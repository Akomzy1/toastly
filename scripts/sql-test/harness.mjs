/**
 * A throwaway Postgres for testing database rules — never production.
 *
 * Boots PGlite (real Postgres compiled to WebAssembly, in memory), adds
 * stand-ins for the pieces Supabase provides (auth.users and auth.uid(),
 * the anon / authenticated / service_role roles, vault, pg_cron, storage),
 * then applies every migration in supabase/migrations in order.
 *
 *   import { freshDb, as } from "./harness.mjs";
 *   const db = await freshDb();
 *   await as(db, userId, (tx) => tx.query("select coin_balance($1)", [userId]));
 */
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const MIGRATIONS = path.resolve("supabase/migrations");

export const SHIMS = `
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgcrypto;

do $$ begin
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
exception when duplicate_object then null; end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  phone text,
  phone_confirmed_at timestamptz,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema if not exists vault;
create table if not exists vault.secrets (name text primary key, secret text, description text);
create or replace function vault.create_secret(p_secret text, p_name text, p_description text default null)
returns uuid language sql as $$
  insert into vault.secrets values (p_name, p_secret, p_description) returning gen_random_uuid()
$$;
create or replace view vault.decrypted_secrets as select name, secret as decrypted_secret from vault.secrets;

create schema if not exists cron;
create table if not exists cron.job (jobid bigserial primary key, jobname text, schedule text, command text);
create or replace function cron.schedule(p_name text, p_schedule text, p_command text)
returns bigint language sql as $$
  insert into cron.job (jobname, schedule, command) values (p_name, p_schedule, p_command) returning jobid
$$;
create or replace function cron.unschedule(p_name text) returns boolean language sql as $$
  delete from cron.job where jobname = p_name returning true
$$;

create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text,
  name text, owner uuid, created_at timestamptz default now());
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(name, '/')
$$;
alter table storage.objects enable row level security;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

export async function freshDb({ upTo } = {}) {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(SHIMS);
  const files = fs
    .readdirSync(MIGRATIONS)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort()
    .filter((f) => !upTo || f.slice(0, 4) <= upTo);
  for (const f of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, f), "utf8");
    try {
      await db.exec(sql);
    } catch (e) {
      throw new Error(`migration ${f} failed: ${e.message}`);
    }
  }
  return db;
}

/** Run fn as a signed-in member (role authenticated, auth.uid() = userId). */
export async function as(db, userId, fn) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true)`, [userId ?? ""]);
    await tx.exec("set local role authenticated");
    return fn(tx);
  });
}

/** Run fn as the server (service role). */
export async function asService(db, fn) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return fn(tx);
  });
}

/**
 * Make a member's profile LIVE (0029): phone confirmed, Verified Real, four
 * photos and a main photo that matched. Runs as the database owner, the way
 * the server records these results — every member-facing rule still applies
 * to what the test does next.
 */
export async function goLive(db, id, { phoneHash, seeking } = {}) {
  // 0036: going live needs a gender from the list, who they'd like to meet,
  // and one prompt answer. Test members default to a man who'd meet anyone
  // (women and men), so any two of them match each other unless a test says
  // otherwise; the women's offer still follows the gender a test signs up with.
  await db.query(
    "update profiles set gender = case when is_gender_option(gender) then gender else 'man' end, seeking = coalesce($2::text[], seeking, '{woman,man}') where id = $1",
    [id, seeking ?? null],
  );
  await db.query(
    "insert into prompt_answers (profile_id, prompt_id, answer) values ($1, 10, 'Being early, every time') on conflict do nothing",
    [id],
  );
  // The confirmed number's hash, as record_phone_verified stores it (0028).
  await db.query(
    "insert into phone_identities (phone_hash, profile_id) values (coalesce($2, md5($1::text) || md5($1::text || 'phone')), $1::uuid) on conflict do nothing",
    [id, phoneHash ?? null],
  );
  await db.query(
    "update profiles set phone_verified_at = coalesce(phone_verified_at, now()), stage = case when stage in ('verified_real', 'id_confirmed') then stage else 'verified_real' end where id = $1",
    [id],
  );
  const photos = [];
  for (let i = 0; i < 4; i++) {
    const { rows } = await db.query(
      "insert into profile_photos (profile_id, storage_path, position) values ($1, $2, $3) returning id",
      [id, `${id}/live-${i}.jpg`, i],
    );
    photos.push(rows[0].id);
  }
  await db.query("update profiles set pending_main_photo_id = $2 where id = $1", [id, photos[0]]);
  await db.query("select record_main_photo_match($1, 'matched')", [photos[0]]);
  return photos;
}

/** Create an auth user; the signup trigger creates the profile. */
export async function makeUser(db, { name, email, gender = "prefer_not_to_say", dob = "1995-01-01" }) {
  const id = crypto.randomUUID();
  await db.query(
    "insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values ($1, $2, $3, now())",
    [id, email, JSON.stringify({ display_name: name, gender, date_of_birth: dob })],
  );
  return id;
}

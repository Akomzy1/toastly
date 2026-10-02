-- Toastly — Smile ID verification: sessions, outcomes, and ID de-duplication.
--
-- Two Smile ID products, run through the hosted web integration:
--   smartselfie   -> the Verified Real seal (liveness only, required)
--   biometric_kyc -> the ID check (NIN, Virtual NIN or BVN; optional)
--
-- HARD RULES, enforced by shape:
--   * Only the outcome is stored: Smile ID's job ID, its result status and
--     reason code, pass/fail, timestamps. Nothing returned from the ID record
--     — name, date of birth, photo, phone, address, marital status — has a
--     column anywhere.
--   * The ID number itself is never stored. A keyed HMAC of it is, so the same
--     ID can't verify two accounts and a removed member can't return with it.
--     The key lives in Supabase Vault and is readable only by the service
--     role; the hash is computed in the app server, so the number never
--     reaches the database or its logs.
--   * The callback is the only source of truth. Nothing here is written by a
--     client: RLS lets a member read their own sessions and nothing else.

do $$
begin
  if to_regclass('vault.secrets') is null then
    raise exception 'Supabase Vault is not available. The ID-number key will not fall back to anything weaker.';
  end if;
end $$;

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- The ID-number HMAC key, in Vault
-- ---------------------------------------------------------------------------
--
-- Rotating it makes every stored ID hash unmatchable: the same ID could then
-- verify a second account. Do not rotate it casually.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'id_number_hmac_key') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'id_number_hmac_key',
      'Keys the HMAC of verified ID numbers (0016). Rotating it breaks ID de-duplication.'
    );
  end if;
end $$;

create or replace function public.id_number_hmac_key()
returns text
language plpgsql
stable
security definer
set search_path = public, vault
as $$
declare
  k text;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'id_number_hmac_key';
  if k is null then
    raise exception 'ID-number key is not configured.';
  end if;
  return k;
end;
$$;

-- Service role only: the app server computes the HMAC, so the ID number never
-- has to travel to the database.
revoke all on function public.id_number_hmac_key() from public, anon, authenticated;
grant execute on function public.id_number_hmac_key() to service_role;

-- ---------------------------------------------------------------------------
-- Verification sessions — one per attempt
-- ---------------------------------------------------------------------------

create table public.verification_sessions (
  -- Also the nonce echoed back by Smile ID in partner_params.
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  product text not null check (product in ('smartselfie', 'biometric_kyc')),
  -- 'sandbox' or 'production', so sandbox results can be revoked at cut-over.
  environment text not null check (environment in ('sandbox', 'production')),
  id_type text check (id_type in ('NIN_V2', 'V_NIN', 'BVN')),
  -- Keyed HMAC of the ID number (ID check only). Never the number.
  id_hash text,
  status text not null default 'started'
    check (status in ('started', 'submitted', 'clear', 'attention', 'block', 'error')),
  job_id text unique,
  result_code text check (char_length(result_code) <= 64),
  passed boolean,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  completed_at timestamptz,
  check (product = 'biometric_kyc' or (id_type is null and id_hash is null))
);

create index verification_sessions_profile_idx
  on public.verification_sessions (profile_id, product, created_at desc);

alter table public.verification_sessions enable row level security;

-- A member sees their own outcomes (for the "being checked" and result
-- screens). Every write is done by the server with the service role.
create policy "own verification sessions readable" on public.verification_sessions
  for select using (auth.uid() = profile_id);

-- ---------------------------------------------------------------------------
-- ID de-duplication
-- ---------------------------------------------------------------------------

-- One ID, one account: the unique primary key is the guarantee.
create table public.verified_id_hashes (
  id_hash text primary key,
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  id_type text not null check (id_type in ('NIN_V2', 'V_NIN', 'BVN')),
  verified_at timestamptz not null default now()
);

-- A removed member's ID stays blocked for the safety-record retention period,
-- mirroring blocked_phone_hashes (0015).
create table public.blocked_id_hashes (
  id_hash text primary key,
  former_profile_id uuid not null,
  retain_until timestamptz not null
);

alter table public.verified_id_hashes enable row level security;
alter table public.blocked_id_hashes enable row level security;
revoke all on public.verified_id_hashes from anon, authenticated;
revoke all on public.blocked_id_hashes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Account deletion keeps a removed member's ID hash blocked
-- ---------------------------------------------------------------------------
--
-- Re-creates 0015's function with one addition: the verified ID hash joins
-- the phone hash in being blocked when the account was removed for breaking
-- the rules. Everything else is unchanged.

create or replace function public.prepare_account_deletion()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_hash text;
  v_id_hash text;
begin
  if v_me is null then
    raise exception 'Not signed in.';
  end if;

  delete from retained_safety_records where former_profile_id = v_me;
  insert into retained_safety_records (former_profile_id, reason, status, reported_at, retain_until)
  select v_me, r.reason, r.status, r.created_at, now() + interval '2 years'
  from reports r
  where r.reported_id = v_me;

  if exists (select 1 from reports r where r.reported_id = v_me and r.status = 'actioned') then
    select phone_hash into v_hash from phone_identities where profile_id = v_me;
    if v_hash is not null then
      insert into blocked_phone_hashes (phone_hash, former_profile_id, retain_until)
      values (v_hash, v_me, now() + interval '2 years')
      on conflict (phone_hash) do update set retain_until = excluded.retain_until;
    end if;

    select id_hash into v_id_hash from verified_id_hashes where profile_id = v_me;
    if v_id_hash is not null then
      insert into blocked_id_hashes (id_hash, former_profile_id, retain_until)
      values (v_id_hash, v_me, now() + interval '2 years')
      on conflict (id_hash) do update set retain_until = excluded.retain_until;
    end if;
  end if;

  insert into retained_payments (
    former_profile_id, provider, provider_ref, amount_minor, currency,
    status, purpose, paid_at, retain_until
  )
  select v_me, p.provider, p.provider_ref, p.amount_minor, p.currency,
         p.status, p.purpose, p.created_at, now() + interval '6 years'
  from payments p
  where p.profile_id = v_me
  on conflict (provider, provider_ref) do nothing;
end;
$$;

create or replace function public.purge_expired_retention()
returns void
language sql
security definer
set search_path = public
as $$
  delete from retained_safety_records where retain_until < now();
  delete from blocked_phone_hashes where retain_until < now();
  delete from blocked_id_hashes where retain_until < now();
  delete from retained_payments where retain_until < now();
  -- An ID check that never got a result keeps no hash past a day; a decided
  -- one keeps it only if it passed (the callback clears the rest).
  update verification_sessions set id_hash = null
   where id_hash is not null
     and status in ('started', 'submitted')
     and created_at < now() - interval '1 day';
$$;

revoke all on function public.purge_expired_retention() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Verification columns are written by the server, not by members
-- ---------------------------------------------------------------------------
--
-- "own profile writable" (0001) lets a member update every column of their own
-- row — including stage, liveness_verified_at and id_confirmed_at. With the
-- public anon key and a session, anyone could have set themselves to
-- id_confirmed from a browser console. The callback cannot be the only source
-- of truth while that is possible.
--
-- From here: a member's own session may make exactly one verification change —
-- unverified -> phone_verified, and only once Supabase Auth has confirmed the
-- phone OTP. Everything else (Verified Real, the ID ring, a verified
-- profession) is written by the service role from Smile ID's signed callback,
-- or by staff. Security-definer functions run as their owner and are
-- unaffected; none of them sets these columns.

create or replace function public.phone_is_confirmed(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from auth.users u where u.id = p_uid and u.phone_confirmed_at is not null
  );
$$;

revoke all on function public.phone_is_confirmed(uuid) from public, anon;
grant execute on function public.phone_is_confirmed(uuid) to authenticated, service_role;

-- SECURITY INVOKER on purpose: current_user is the caller's role here
-- ('authenticated' for a member's session, 'service_role' for the server).
create or replace function public.guard_verification_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Profiles are created by on_auth_user_created; a client insert can never
    -- arrive pre-verified.
    new.stage := 'unverified';
    new.phone_verified_at := null;
    new.liveness_verified_at := null;
    new.id_confirmed_at := null;
    new.profession_verified_at := null;
    return new;
  end if;

  if new.liveness_verified_at is distinct from old.liveness_verified_at
     or new.id_confirmed_at is distinct from old.id_confirmed_at
     or new.profession_verified_at is distinct from old.profession_verified_at then
    raise exception 'Verification results are recorded by Toastly, not by the app.'
      using errcode = '42501';
  end if;

  if new.stage is distinct from old.stage
     or new.phone_verified_at is distinct from old.phone_verified_at then
    if old.stage = 'unverified'
       and new.stage = 'phone_verified'
       and new.phone_verified_at is not null
       and public.phone_is_confirmed(new.id) then
      return new;
    end if;
    raise exception 'Verification results are recorded by Toastly, not by the app.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_verification_columns on public.profiles;
create trigger guard_verification_columns
  before insert or update on public.profiles
  for each row execute function public.guard_verification_columns();

-- ---------------------------------------------------------------------------
-- Sentinel: one event per verification result, outcome only
-- ---------------------------------------------------------------------------

alter type trust_event_kind add value if not exists 'liveness_result';
alter type trust_event_kind add value if not exists 'id_check_result';

-- emit_trust_event (0009) is called by triggers and by the server's service
-- role. Supabase grants EXECUTE on new functions to clients by default, which
-- would let any member write trust events about anyone; close that.
revoke all on function public.emit_trust_event(uuid, uuid, trust_event_kind, jsonb)
  from public, anon, authenticated;
grant execute on function public.emit_trust_event(uuid, uuid, trust_event_kind, jsonb)
  to service_role;

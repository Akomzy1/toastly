/**
 * The privacy claims, at the database (decided 6 October 2026) — against a
 * throwaway Postgres (PGlite) with every migration applied. Never production.
 *
 *   node --test scripts/sql-test/privacy-claims.test.mjs
 *
 *   - Every image enters storage through the server, which strips it
 *     (lib/strip-image.ts): members' sessions can't write to either image
 *     bucket, so no unstripped file can be stored — and another member can
 *     read only a registered photo, never a stray file in someone's folder.
 *   - The selfie is never kept: no table has anywhere to put an image, a
 *     face template or a score.
 *   - The surname Smile ID requires is never stored: no column for it.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { freshDb, as, makeUser, goLive } from "./harness.mjs";

let db;
let alice, bola;

before(async () => {
  db = await freshDb();
  // Supabase grants these table privileges to signed-in members; the
  // policies decide. Mirror that, so a missing grant can't pass a test.
  await db.exec("grant usage on schema storage to authenticated; grant select, insert, update, delete on storage.objects to authenticated");
  alice = await makeUser(db, { name: "Alice", email: `${crypto.randomUUID()}@example.com` });
  bola = await makeUser(db, { name: "Bola", email: `${crypto.randomUUID()}@example.com` });
  await goLive(db, alice);
  await goLive(db, bola);
});

const me = (id, sql, params) => as(db, id, (tx) => tx.query(sql, params));

test("no member can write a file into either image bucket — every image comes through the server", async () => {
  const { rows } = await db.query(
    "select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd in ('INSERT', 'UPDATE', 'ALL')",
  );
  assert.deepEqual(rows, [], "no insert or update policy on storage.objects");
  await assert.rejects(me(alice, "insert into storage.objects (bucket_id, name, owner) values ('profile-photos', $1, $2)", [`${alice}/raw-with-gps.jpg`, alice]));
  await assert.rejects(me(alice, "insert into storage.objects (bucket_id, name, owner) values ('message-attachments', $1, $2)", [`${crypto.randomUUID()}/raw.jpg`, alice]));
});

test("members still delete their own photo files", async () => {
  await db.query("insert into storage.objects (bucket_id, name, owner) values ('profile-photos', $1, $2)", [`${alice}/to-delete.jpg`, alice]);
  const { rowCount } = await me(alice, "delete from storage.objects where bucket_id = 'profile-photos' and name = $1", [`${alice}/to-delete.jpg`]);
  assert.equal(rowCount, 1);
});

test("another member reads only a registered photo, never a stray file in the folder", async () => {
  const registered = (await db.query("select storage_path from profile_photos where profile_id = $1 order by position limit 1", [alice])).rows[0].storage_path;
  const stray = `${alice}/stray-unstripped.jpg`;
  await db.query("insert into storage.objects (bucket_id, name, owner) values ('profile-photos', $1, $2), ('profile-photos', $3, $2)", [registered, alice, stray]);
  const { rows } = await me(bola, "select name from storage.objects where bucket_id = 'profile-photos' and name = any($1)", [[registered, stray]]);
  assert.deepEqual(rows.map((r) => r.name), [registered]);
  const own = await me(alice, "select name from storage.objects where bucket_id = 'profile-photos' and name = $1", [stray]);
  assert.equal(own.rows.length, 1, "the owner still sees their own files");
});

test("no table can hold an image, a face template or a score — the selfie is never kept", async () => {
  const { rows: bytea } = await db.query(
    "select table_name, column_name from information_schema.columns where table_schema = 'public' and data_type = 'bytea'",
  );
  assert.deepEqual(bytea, [{ table_name: "genotypes", column_name: "ciphertext" }], "no binary columns but the encrypted genotype");
  const { rows } = await db.query(
    `select table_name, column_name from information_schema.columns
      where table_schema = 'public' and data_type <> 'boolean'  -- e.g. blur_incoming_images, a setting
        and column_name ~* '(selfie|image|frame|photo_data|template|embedding|face_vector|biometric|liveness_(score|image)|match_score|confidence)'`,
  );
  assert.deepEqual(rows, [], "nothing named for an image, template or score");
  const { rows: cols } = await db.query(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'verification_sessions' order by column_name",
  );
  assert.deepEqual(cols.map((c) => c.column_name), [
    "check_id", "completed_at", "created_at", "environment", "id", "id_hash", "id_type", "job_id",
    "passed", "photo_id", "product", "profile_id", "result_code", "status", "step", "submitted_at",
  ], "a selfie check keeps its outcome and nothing else");
});

test("no table has a column for the surname Smile ID requires", async () => {
  const { rows } = await db.query(
    "select table_name, column_name from information_schema.columns where table_schema = 'public' and column_name ~* '(surname|last_name|lastname|family_name|given_name|legal_name|full_name)'",
  );
  assert.deepEqual(rows, []);
});

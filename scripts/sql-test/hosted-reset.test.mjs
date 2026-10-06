/**
 * Verified Real comes only from the in-page selfie (0029 §5b; decided
 * 6 October 2026) — against a throwaway Postgres (PGlite). Never production.
 *
 * The database is built to 0028, members are verified the way main's hosted
 * flow left them, then 0029 is applied — exactly what production will see.
 *
 *   node --test scripts/sql-test/hosted-reset.test.mjs
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { freshDb, as, asService, makeUser } from "./harness.mjs";

let db;
let staff, hosted, hostedWithId, phoneOnly, inFlight;

const me = (id, sql, params) => as(db, id, (tx) => tx.query(sql, params));
const svc = (sql, params) => asService(db, (tx) => tx.query(sql, params));
const profile = async (id) =>
  (await db.query("select stage, liveness_verified_at, id_confirmed_at from profiles where id = $1", [id])).rows[0];

async function user(name) {
  return makeUser(db, { name, email: `${crypto.randomUUID()}@example.com` });
}

before(async () => {
  db = await freshDb({ upTo: "0028" });

  staff = await user("Staff Reviewer");
  await db.query("insert into staff_members (profile_id) values ($1)", [staff]);

  // Verified Real through main's hosted selfie.
  hosted = await user("Hosted Selfie");
  await db.query("update profiles set stage = 'verified_real', phone_verified_at = now(), liveness_verified_at = now() where id = $1", [hosted]);
  await db.query("insert into verification_sessions (profile_id, product, environment, status, passed) values ($1, 'smartselfie', 'sandbox', 'clear', true)", [hosted]);

  // Hosted selfie, then the ID check.
  hostedWithId = await user("Hosted With ID");
  await db.query(
    "update profiles set stage = 'id_confirmed', phone_verified_at = now(), liveness_verified_at = now(), id_confirmed_at = now() where id = $1",
    [hostedWithId],
  );
  await db.query("insert into verified_id_hashes (id_hash, profile_id, id_type) values ('hash-of-an-id', $1, 'NIN_V2')", [hostedWithId]);

  phoneOnly = await user("Phone Only");
  await db.query("update profiles set stage = 'phone_verified', phone_verified_at = now() where id = $1", [phoneOnly]);

  // A hosted selfie handed to Smile ID but not yet answered.
  inFlight = await user("In Flight");
  await db.query("update profiles set stage = 'phone_verified', phone_verified_at = now() where id = $1", [inFlight]);
  await db.query("insert into verification_sessions (profile_id, product, environment, status) values ($1, 'smartselfie', 'sandbox', 'submitted')", [inFlight]);

  await db.exec(fs.readFileSync("supabase/migrations/0029_photos_face_match_live_profile.sql", "utf8"));
});

test("hosted-only Verified Real is reset to the step before the selfie", async () => {
  const p = await profile(hosted);
  assert.equal(p.stage, "phone_verified");
  assert.equal(p.liveness_verified_at, null);
});

test("a hosted ID check is reset too — but the ID stays bound to its member", async () => {
  const p = await profile(hostedWithId);
  assert.equal(p.stage, "phone_verified");
  assert.equal(p.id_confirmed_at, null, "the ring goes: it's redone in the page");
  const { rows } = await db.query("select 1 from verified_id_hashes where profile_id = $1", [hostedWithId]);
  assert.equal(rows.length, 1, "no other account can use that ID meanwhile");
});

test("members who weren't Verified Real are untouched", async () => {
  assert.equal((await profile(phoneOnly)).stage, "phone_verified");
});

test("the reset raises no Sentinel 'verification drift' event — it's Toastly's change", async () => {
  const { rows } = await db.query(
    "select count(*)::int as n from trust_events where kind = 'verification_recheck' and profile_id = any($1)",
    [[hosted, hostedWithId]],
  );
  assert.equal(rows[0].n, 0);
});

test("a hosted selfie still in flight is closed and grants nothing", async () => {
  const { rows } = await db.query("select status, passed, result_code from verification_sessions where profile_id = $1", [inFlight]);
  assert.deepEqual(rows[0], { status: "error", passed: false, result_code: "hosted_flow_retired" });
});

async function onboard(m) {
  const photos = [];
  for (let i = 0; i < 4; i++) {
    photos.push((await me(m, "insert into profile_photos (profile_id, storage_path, position) values ($1, $2, $3) returning id", [m, `${m}/${i}.jpg`, i])).rows[0].id);
  }
  await me(m, "select nominate_main_photo($1)", [photos[0]]);
  const { rows: [s] } = await db.query(
    "insert into verification_sessions (profile_id, product, environment, photo_id, step, status) values ($1, 'smartselfie', 'sandbox', $2, 'onboard', 'submitted') returning id",
    [m, photos[0]],
  );
  await db.query("update verification_sessions set status = 'clear', passed = true where id = $1", [s.id]);
  await svc("select record_onboarding_check($1, 'passed', 'matched')", [s.id]);
}

test("the new onboarding selfie restores Verified Real — not the ID ring, which is redone", async () => {
  await onboard(hosted);
  await onboard(hostedWithId);
  assert.equal((await profile(hosted)).stage, "verified_real");
  assert.equal((await profile(hostedWithId)).stage, "verified_real");
  assert.equal((await db.query("select profile_is_live($1) as l", [hosted])).rows[0].l, true);
});

test("a re-verification selfie that passes clears the reviewer's request", async () => {
  await db.query("insert into reverification_requests (profile_id, reason_category, requested_by) values ($1, 'verification', $2)", [hosted, staff]);
  const { rows: [s] } = await db.query(
    "insert into verification_sessions (profile_id, product, environment, step, status) values ($1, 'smartselfie', 'sandbox', 'reverify', 'submitted') returning id",
    [hosted],
  );
  await db.query("update verification_sessions set status = 'clear', passed = true where id = $1", [s.id]);
  const { rows } = await db.query("select 1 from reverification_requests where profile_id = $1", [hosted]);
  assert.equal(rows.length, 0);
});

test("a borderline re-verification selfie goes to a person, whose 'clear' clears the request", async () => {
  await db.query("insert into reverification_requests (profile_id, reason_category, requested_by) values ($1, 'verification', $2)", [hostedWithId, staff]);
  const { rows: [s] } = await db.query(
    "insert into verification_sessions (profile_id, product, environment, step, status) values ($1, 'smartselfie', 'sandbox', 'reverify', 'submitted') returning id",
    [hostedWithId],
  );
  await db.query("update verification_sessions set status = 'attention' where id = $1", [s.id]);
  const item = (await db.query("select id, kind from review_items where source_table = 'verification_sessions' and source_id = $1", [s.id])).rows[0];
  assert.equal(item.kind, "selfie_review");
  assert.equal((await db.query("select 1 from reverification_requests where profile_id = $1", [hostedWithId])).rows.length, 1, "nothing automatic");

  await as(db, staff, (tx) => tx.query("select staff_decide($1, 'clear', 'Same person as at verification.')", [item.id]));
  assert.equal((await db.query("select 1 from reverification_requests where profile_id = $1", [hostedWithId])).rows.length, 0);
  assert.equal((await profile(hostedWithId)).stage, "verified_real", "the stage is untouched by a re-check");
});

// --- The ID check, in the page: Biometric KYC + Authentication of one capture ---

async function idCheck(m, hash, kyc, auth) {
  const check = crypto.randomUUID();
  const ins = (step, withId) =>
    db.query(
      `insert into verification_sessions (profile_id, product, environment, step, check_id, status, id_type, id_hash)
       values ($1, 'biometric_kyc', 'sandbox', $2, $3, 'submitted', $4, $5) returning id`,
      [m, step, check, withId ? "NIN_V2" : null, withId ? hash : null],
    );
  const k = (await ins("id_kyc", true)).rows[0].id;
  const a = (await ins("id_auth", false)).rows[0].id;
  await db.query("update verification_sessions set status = $2, passed = ($2 = 'clear') where id = $1", [k, kyc]);
  await db.query("update verification_sessions set status = $2, passed = ($2 = 'clear') where id = $1", [a, auth]);
  const outcome = (await svc("select record_id_check($1) as o", [check])).rows[0].o;
  return { check, k, a, outcome };
}

test("the ring needs both: the ID on the record AND the same selfie as the registered face", async () => {
  const r = await idCheck(hosted, "hash-of-hosted-id", "clear", "block");
  assert.equal(r.outcome, "not_clear");
  assert.equal((await profile(hosted)).stage, "verified_real", "an ID match from a face that isn't theirs earns nothing");
  const ok = await idCheck(hosted, "hash-of-hosted-id", "clear", "clear");
  assert.equal(ok.outcome, "confirmed");
  const p = await profile(hosted);
  assert.equal(p.stage, "id_confirmed");
  assert.ok(p.id_confirmed_at);
  assert.equal((await db.query("select profile_id from verified_id_hashes where id_hash = 'hash-of-hosted-id'")).rows[0].profile_id, hosted);
});

test("a hosted-era member redoes the check with the same ID — their binding carries on", async () => {
  const r = await idCheck(hostedWithId, "hash-of-an-id", "clear", "clear");
  assert.equal(r.outcome, "confirmed");
  assert.equal((await profile(hostedWithId)).stage, "id_confirmed");
});

test("an ID already verified on another account is refused, and nothing is granted", async () => {
  const other = await user("Other Member");
  await db.query("update profiles set stage = 'verified_real', phone_verified_at = now() where id = $1", [other]);
  const r = await idCheck(other, "hash-of-an-id", "clear", "clear");
  assert.equal(r.outcome, "id_already_used");
  assert.equal((await profile(other)).stage, "verified_real");
  const k = (await db.query("select status, result_code, id_hash from verification_sessions where id = $1", [r.k])).rows[0];
  assert.deepEqual(k, { status: "block", result_code: "id_already_used", id_hash: null });
});

test("a borderline half goes to a person; their 'clear' grants the ring only with the other half clear", async () => {
  const m = await user("Borderline ID");
  await db.query("update profiles set stage = 'verified_real', phone_verified_at = now() where id = $1", [m]);
  const r = await idCheck(m, "hash-borderline", "clear", "attention");
  assert.equal(r.outcome, "not_clear");
  const item = (await db.query("select id, kind from review_items where source_table = 'verification_sessions' and source_id = $1", [r.a])).rows[0];
  assert.equal(item.kind, "id_review");
  await as(db, staff, (tx) => tx.query("select staff_decide($1, 'clear', 'Same person as at verification.')", [item.id]));
  assert.equal((await profile(m)).stage, "id_confirmed");
});

test("a member can't call record_id_check themselves", async () => {
  await assert.rejects(me(hosted, "select record_id_check(gen_random_uuid())"));
});

test("a member can't record a re-check step themselves", async () => {
  await assert.rejects(
    me(hosted, "insert into verification_sessions (profile_id, product, environment, step, status, passed) values ($1, 'smartselfie', 'sandbox', 'reverify', 'clear', true)", [hosted]),
  );
});

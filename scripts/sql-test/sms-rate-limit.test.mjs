/**
 * Our own rate limit on verification-code SMS (migration 0049) — against a
 * throwaway Postgres (PGlite) with every migration applied. Never production.
 *
 *   node --test scripts/sql-test/sms-rate-limit.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb, as, asService } from "./harness.mjs";

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);

async function setup() {
  const db = await freshDb();
  const allow = (key) => asService(db, (tx) => tx.query("select sms_code_allow($1) as ok", [key])).then((r) => r.rows[0].ok);
  const age = (key, seconds) => db.query("update sms_code_sends set sent_at = sent_at - make_interval(secs => $2) where phone_key = $1", [key, seconds]);
  return { db, allow, age };
}

test("a number gets at most five codes an hour, and never two within thirty seconds", async () => {
  const { db, allow, age } = await setup();
  assert.equal(await allow(KEY_A), true, "the first code");
  assert.equal(await allow(KEY_A), false, "a second one straight away");
  await age(KEY_A, 31);
  assert.equal(await allow(KEY_A), true, "thirty seconds on");

  // Fill the hour: five in all, each spaced out.
  for (let i = 0; i < 3; i++) {
    await age(KEY_A, 31);
    assert.equal(await allow(KEY_A), true);
  }
  assert.equal((await db.query("select count(*)::int as n from sms_code_sends where phone_key = $1", [KEY_A])).rows[0].n, 5);
  await age(KEY_A, 31);
  assert.equal(await allow(KEY_A), false, "the sixth in an hour");

  // An hour later it opens again; another number was never affected.
  await age(KEY_A, 3600);
  assert.equal(await allow(KEY_A), true);
  assert.equal(await allow(KEY_B), true);
});

test("the limits are settings, rows older than a day go, and only the service role can ask", async () => {
  const { db, allow, age } = await setup();
  await db.query("update sms_limits set per_hour = 2, min_gap_seconds = 0");
  assert.equal(await allow(KEY_A), true);
  assert.equal(await allow(KEY_A), true, "no gap now");
  assert.equal(await allow(KEY_A), false, "two an hour now");

  await age(KEY_A, 2 * 86400);
  assert.equal(await allow(KEY_B), true);
  assert.equal((await db.query("select count(*)::int as n from sms_code_sends where phone_key = $1", [KEY_A])).rows[0].n, 0, "old rows are deleted");

  await assert.rejects(as(db, "00000000-0000-4000-8000-000000000001", (tx) => tx.query("select sms_code_allow($1)", [KEY_A])), /permission denied/);
  await assert.rejects(as(db, "00000000-0000-4000-8000-000000000001", (tx) => tx.query("select * from sms_code_sends")), /permission denied/);
  await assert.rejects(asService(db, (tx) => tx.query("select sms_code_allow('short')")), /phone key is required/);
});

test("planted violations: without the hourly cap, or the gap, the test can tell", async () => {
  const { db, allow, age } = await setup();
  const original = (await db.query("select pg_get_functiondef('sms_code_allow(text)'::regprocedure) as d")).rows[0].d;

  // No hourly cap.
  await db.exec(original.replace(">= v_hour", ">= 1000"));
  for (let i = 0; i < 6; i++) {
    await age(KEY_A, 31);
    assert.equal(await allow(KEY_A), true, "the planted change lets a sixth through");
  }
  await db.exec(original);
  await db.query("delete from sms_code_sends");

  // No gap.
  await db.exec(original.replace("v_gap > 0 and exists", "false and exists"));
  assert.equal(await allow(KEY_B), true);
  assert.equal(await allow(KEY_B), true, "the planted change lets two through at once");
  await db.exec(original);
  await db.query("delete from sms_code_sends");
  assert.equal(await allow(KEY_B), true);
  assert.equal(await allow(KEY_B), false, "restored");
});

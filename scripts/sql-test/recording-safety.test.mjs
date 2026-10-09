/**
 * Being recorded on video (migration 0041; PRD §5.4) — against a throwaway
 * Postgres (PGlite) with every migration applied. Never production.
 *
 *   node --test scripts/sql-test/recording-safety.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb, as, makeUser, goLive } from "./harness.mjs";

async function setup() {
  const db = await freshDb();
  const me = (id, sql, params) => as(db, id, (tx) => tx.query(sql, params));
  async function member(name, gender) {
    const id = await makeUser(db, { name, email: `${crypto.randomUUID()}@example.com`, gender });
    await goLive(db, id);
    return id;
  }
  return { db, me, member };
}

test("'They recorded or shared me' goes to the top of the review queue, like threats", async () => {
  const { db, me, member } = await setup();
  const reporter = await member("Amaka Woman", "woman");
  const reported = await member("Bayo Man", "man");
  const report = (reason) =>
    me(reporter, "insert into reports (reporter_id, reported_id, reason) values ($1, $2, $3) returning id", [reporter, reported, reason]).then((r) => r.rows[0].id);

  const recorded = await report("recorded_or_shared");
  const threat = await report("threats_or_coercion");
  const rude = await report("harassment");
  const urgent = async (id) => (await db.query("select urgent from review_items where source_table = 'reports' and source_id = $1", [id])).rows[0].urgent;
  assert.equal(await urgent(recorded), true);
  assert.equal(await urgent(threat), true);
  assert.equal(await urgent(rude), false);

  // Reviewers see a plain label, never "Other".
  const label = async (r) => (await db.query("select _report_label($1::report_reason) as l", [r])).rows[0].l;
  assert.equal(await label("recorded_or_shared"), "Recorded or shared them");
  assert.equal(await label("photos_not_them"), "Photos aren't them");
});

test("the recording notice is shown once per member, wherever they are", async () => {
  const { db, me, member } = await setup();
  const id = await member("Chidi Man", "man");
  const seen = async () => (await db.query("select video_notice_seen_at from profiles where id = $1", [id])).rows[0].video_notice_seen_at;
  assert.equal(await seen(), null);
  await me(id, "select acknowledge_video_notice()");
  const first = await seen();
  assert.ok(first);
  await me(id, "select acknowledge_video_notice()");
  assert.equal((await seen()).getTime(), first.getTime(), "once: the first time stands");
  // Only your own.
  const other = await member("Dupe Woman", "woman");
  await me(other, "select acknowledge_video_notice()");
  assert.equal((await seen()).getTime(), first.getTime());
});

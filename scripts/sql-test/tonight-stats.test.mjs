/**
 * "Tonight on Toastly" (migration 0043) — hidden below 500 verified members,
 * then real counts. Against a throwaway Postgres (PGlite). Never production.
 *
 *   node --test scripts/sql-test/tonight-stats.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb, as, asService, makeUser, goLive } from "./harness.mjs";

const stats = (db) => asService(db, (tx) => tx.query("select home_live_stats() as s")).then((r) => r.rows[0].s);

test("hidden until the threshold of verified members, then live counts", async () => {
  const db = await freshDb();
  // A small threshold stands in for 500; the rule is the same.
  await db.query("update site_config set value = 3 where name = 'tonight_min_verified_members'");
  const ids = [];
  for (const [i, g] of ["woman", "man", "woman"].entries()) {
    const id = await makeUser(db, { name: `M${i}`, email: `${crypto.randomUUID()}@example.com`, gender: g });
    ids.push(id);
  }
  // Signed up but not verified: doesn't count.
  await makeUser(db, { name: "Unverified", email: `${crypto.randomUUID()}@example.com`, gender: "man" });

  await goLive(db, ids[0]);
  await goLive(db, ids[1]);
  assert.equal(await stats(db), null, "2 verified, threshold 3: hidden — and the count isn't published");

  await goLive(db, ids[2]);
  await db.query("update profiles set stage = 'id_confirmed' where id = $1", [ids[2]]);
  const s = await stats(db);
  assert.equal(Number(s.verified_members), 3, "Verified Real and Verified Real + ID both count; unverified doesn't");

  // Gist sessions this week: connected ones, in the last 7 days.
  const gist = async (startedDaysAgo) => {
    const { rows } = await db.query(
      "insert into gist_sessions (proposer_id, invitee_id) values ($1, $2) returning id",
      [ids[0], ids[1]],
    );
    if (startedDaysAgo !== null) {
      await db.query("alter table gist_sessions disable trigger user");
      await db.query("update gist_sessions set started_at = now() - make_interval(days => $2) where id = $1", [rows[0].id, startedDaysAgo]);
      await db.query("alter table gist_sessions enable trigger user");
    }
  };
  await gist(1);
  await gist(6);
  await gist(8); // last week
  await gist(null); // never connected
  // Couple Mode: active only.
  await db.query("insert into couples (member_a, member_b, status, proposed_by) values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid), 'active', $1)", [ids[0], ids[1]]);
  await db.query("insert into couples (member_a, member_b, status, proposed_by) values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid), 'ended', $1)", [ids[2], ids[1]]);

  const t = await stats(db);
  assert.equal(Number(t.gists_this_week), 2);
  assert.equal(Number(t.couples), 1);
});

test("the default threshold is 500, and only the server can ask", async () => {
  const db = await freshDb();
  assert.equal((await db.query("select value from site_config where name = 'tonight_min_verified_members'")).rows[0].value, 500);
  const id = await makeUser(db, { name: "Ada Member", email: `${crypto.randomUUID()}@example.com`, gender: "woman" });
  await goLive(db, id);
  assert.equal(await stats(db), null);
  await assert.rejects(as(db, id, (tx) => tx.query("select home_live_stats()")), /permission denied/);
  await assert.rejects(as(db, id, (tx) => tx.query("select * from site_config")), /permission denied/);
});

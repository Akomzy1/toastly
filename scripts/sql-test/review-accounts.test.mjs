/**
 * Review accounts (migration 0051): the Meta reviewer test account and its
 * fictional companions never meet a member, go live without Smile ID only
 * because they are review accounts, stay out of the beta's places, offers and
 * counts, and retire in one call — against a throwaway Postgres (PGlite) with
 * every migration applied. Never production.
 *
 *   node --test scripts/sql-test/review-accounts.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb, as, asService, makeUser, goLive } from "./harness.mjs";

const KEY = "a".repeat(64);
const HASH = "b".repeat(64);

async function setup() {
  const db = await freshDb();
  const me = (id, sql, params) => as(db, id, (tx) => tx.query(sql, params));
  const svc = (sql, params) => asService(db, (tx) => tx.query(sql, params));

  /** A live member, as every other test makes one. */
  async function member(name, gender) {
    const id = await makeUser(db, { name, email: `${crypto.randomUUID()}@example.com`, gender, dob: "1997-05-01" });
    await goLive(db, id);
    return id;
  }
  /** A review account, made the way scripts/db/review-accounts.mjs makes one. */
  async function reviewAccount(name, gender, { phoneHash = null } = {}) {
    const id = await makeUser(db, { name, email: `${crypto.randomUUID()}@example.com`, gender, dob: "1997-05-01" });
    await svc("select review_account_mark($1)", [id]);
    await db.query("insert into prompt_answers (profile_id, prompt_id, answer) values ($1, 1, 'Small chops and a long walk')", [id]);
    for (let i = 0; i < 4; i++) {
      await db.query("insert into profile_photos (profile_id, storage_path, position) values ($1, $2, $3)", [id, `${id}/r-${i}.jpg`, i]);
    }
    const { rows } = await svc("select review_account_go_live($1, $2) as r", [id, phoneHash]);
    assert.equal(rows[0].r, "live", `${name} goes live`);
    // The script marks review accounts seen, as the heartbeat would.
    await svc("insert into member_presence (profile_id, seen_at) values ($1, now()) on conflict (profile_id) do update set seen_at = excluded.seen_at", [id]);
    return id;
  }
  const six = async (id) => (await me(id, "select candidate_id from build_daily_feed($1)", [id])).rows.map((r) => r.candidate_id);
  const answerOf = async (id) => (await db.query("select id from prompt_answers where profile_id = $1 order by prompt_id limit 1", [id])).rows[0].id;
  const inSix = (viewer, candidate) =>
    db.query(`insert into daily_feed (profile_id, feed_date, position, candidate_id)
      select $1, current_date, coalesce(max(position), 0) + 1, $2 from daily_feed where profile_id = $1 and feed_date = current_date
      on conflict do nothing`, [viewer, candidate]);
  const opens = async (viewer, owner) => (await me(viewer, "select profile_for($1) as p", [owner])).rows[0].p !== null;
  const live = async (id) => (await db.query("select profile_is_live($1) as l", [id])).rows[0].l;
  const premium = (id) => db.query("insert into entitlements (profile_id, tier, source, ends_at) values ($1, 'premium', 'subscription', now() + interval '30 days')", [id]);
  return { db, me, svc, member, reviewAccount, six, answerOf, inSix, opens, live, premium };
}

test("a member can never set or clear the review flag", async () => {
  const { db, me } = await setup();
  const id = await makeUser(db, { name: "Kemi Woman", email: `${crypto.randomUUID()}@example.com`, gender: "woman" });
  await assert.rejects(me(id, "update profiles set review_account = true where id = $1", [id]), /recorded by Toastly/);
  assert.equal((await db.query("select review_account from profiles where id = $1", [id])).rows[0].review_account, false);
});

test("the review functions are the server's only", async () => {
  const { db, me } = await setup();
  const id = await makeUser(db, { name: "Kemi Woman", email: `${crypto.randomUUID()}@example.com`, gender: "woman" });
  for (const sql of [
    "select review_account_mark($1)",
    "select review_account_go_live($1)",
    "select review_account_allow_number($1, repeat('a', 64))",
    "select review_account_grant($1, 'premium', now() + interval '30 days')",
  ]) {
    await assert.rejects(me(id, sql, [id]), /permission denied/, sql);
  }
  await assert.rejects(me(id, "select review_accounts_refresh()"), /permission denied/);
  await assert.rejects(me(id, "select review_accounts_retire()"), /permission denied/);
});

test("a member is never turned into a review account, and only a review account skips Smile ID", async () => {
  const { svc, member, db } = await setup();
  const real = await member("Kemi Woman", "woman");
  await assert.rejects(svc("select review_account_mark($1)", [real]), /Only a new, unverified profile/);

  const fresh = await makeUser(db, { name: "Tola Woman", email: `${crypto.randomUUID()}@example.com`, gender: "woman" });
  await assert.rejects(svc("select review_account_go_live($1)", [fresh]), /Not a review account/);
  const p = (await db.query("select stage, phone_verified_at from profiles where id = $1", [fresh])).rows[0];
  assert.equal(p.stage, "unverified");
  assert.equal(p.phone_verified_at, null);
});

test("review accounts and members never share a six, in either direction", async () => {
  const { member, reviewAccount, six } = await setup();
  const realWoman = await member("Kemi Woman", "woman");
  const realMan = await member("Tunde Man", "man");
  const reviewer = await reviewAccount("Review Woman", "woman", { phoneHash: HASH });
  const c1 = await reviewAccount("Companion One", "man");
  const c2 = await reviewAccount("Companion Two", "man");

  const hers = await six(reviewer);
  assert.deepEqual([...hers].sort(), [c1, c2].sort(), "the reviewer sees only her companions");
  assert.ok(!(await six(realWoman)).some((id) => id === c1 || id === c2), "a member never sees a companion");
  assert.ok(!(await six(realMan)).includes(reviewer), "a member never sees the reviewer");
  assert.ok((await six(realMan)).includes(realWoman), "not vacuous: members still see members");
});

test("no profile, photo, reply, invite or message across the line, even if one were in the six", async () => {
  const { db, me, member, reviewAccount, answerOf, inSix, opens, premium } = await setup();
  const realMan = await member("Tunde Man", "man");
  await premium(realMan);
  const reviewer = await reviewAccount("Review Woman", "woman", { phoneHash: HASH });
  await premium(reviewer);

  await inSix(realMan, reviewer);
  await inSix(reviewer, realMan);
  assert.equal(await opens(realMan, reviewer), false, "a member can't open the reviewer");
  assert.equal(await opens(reviewer, realMan), false, "the reviewer can't open a member");
  const photo = (await db.query("select storage_path from profile_photos where profile_id = $1 limit 1", [realMan])).rows[0].storage_path;
  assert.equal((await db.query("select can_see_photo_file($1, $2) as ok", [reviewer, photo])).rows[0].ok, false, "no photo file");
  assert.equal((await me(reviewer, "select count(*)::int as n from prompt_answers where profile_id = $1", [realMan])).rows[0].n, 0, "no answers");

  await assert.rejects(
    me(reviewer, "insert into replies (sender_id, recipient_id, prompt_answer_id, kind, body) values ($1, $2, $3, 'text', 'Hello')", [reviewer, realMan, await answerOf(realMan)]));
  await assert.rejects(
    me(realMan, "insert into replies (sender_id, recipient_id, prompt_answer_id, kind, body) values ($1, $2, $3, 'text', 'Hello')", [realMan, reviewer, await answerOf(reviewer)]));
  await assert.rejects(me(reviewer, "select gist_invite($1)", [await answerOf(realMan)]), /isn't available/);
  await assert.rejects(me(realMan, "select gist_invite($1)", [await answerOf(reviewer)]), /isn't available/);

  // A thread can't arise between them, but if one existed, nothing is sent.
  const [a, b] = [reviewer, realMan].sort();
  const t = (await db.query("insert into threads (member_a, member_b) values ($1, $2) returning id", [a, b])).rows[0].id;
  await assert.rejects(me(reviewer, "insert into messages (thread_id, sender_id, body) values ($1, $2, 'Hello')", [t, reviewer]));
  await assert.rejects(me(realMan, "insert into messages (thread_id, sender_id, body) values ($1, $2, 'Hello')", [t, realMan]));
});

test("not vacuous: inside the review line, and between members, everything still works", async () => {
  const { db, me, member, reviewAccount, answerOf, inSix, opens, premium } = await setup();
  const reviewer = await reviewAccount("Review Woman", "woman", { phoneHash: HASH });
  await premium(reviewer);
  const companion = await reviewAccount("Companion One", "man");
  await inSix(reviewer, companion);
  assert.equal(await opens(reviewer, companion), true);
  await me(reviewer, "insert into replies (sender_id, recipient_id, prompt_answer_id, kind, body) values ($1, $2, $3, 'text', 'Hello')", [reviewer, companion, await answerOf(companion)]);

  const realMan = await member("Tunde Man", "man");
  await premium(realMan);
  const realWoman = await member("Kemi Woman", "woman");
  const [a, b] = [realMan, realWoman].sort();
  const t = (await db.query("insert into threads (member_a, member_b) values ($1, $2) returning id", [a, b])).rows[0].id;
  await me(realMan, "insert into messages (thread_id, sender_id, body) values ($1, $2, 'Hello')", [t, realMan]);
});

test("the reviewer's number passes the gate without taking a beta place or making a founding member", async () => {
  const { db, svc, reviewAccount } = await setup();
  const reviewer = await reviewAccount("Review Woman", "woman", { phoneHash: HASH });
  assert.equal((await svc("select beta_number_approved($1) as ok", [KEY])).rows[0].ok, false);
  await svc("select review_account_allow_number($1, $2)", [reviewer, KEY]);
  assert.equal((await svc("select beta_number_approved($1) as ok", [KEY])).rows[0].ok, true);

  assert.equal((await db.query("select count(*)::int as n from beta_applications")).rows[0].n, 0, "no application row");
  assert.equal((await svc("select beta_claim($1, $2) as r", [reviewer, KEY])).rows[0].r, "none", "nothing to claim");
  assert.equal((await db.query("select count(*)::int as n from founding_members")).rows[0].n, 0, "no founding member");
});

test("a review woman gets the dated grant, never the women's launch offer", async () => {
  const { db, svc, reviewAccount } = await setup();
  const reviewer = await reviewAccount("Review Woman", "woman", { phoneHash: HASH });
  const sources = async () => (await db.query("select source::text from entitlements where profile_id = $1 order by source", [reviewer])).rows.map((r) => r.source);
  assert.deepEqual(await sources(), ["default"], "no launch offer");
  assert.equal((await db.query("select count(*)::int as n from launch_offer_grants")).rows[0].n, 0, "no offer record used up");

  await svc("select review_account_grant($1, 'premium_plus', now() + interval '60 days')", [reviewer]);
  assert.equal((await db.query("select current_tier($1)::text as t", [reviewer])).rows[0].t, "premium_plus");
  await assert.rejects(svc("select review_account_grant($1, 'premium', now() + interval '1 year')", [reviewer]), /within 120 days/);
});

test("Tonight on Toastly never counts a review account", async () => {
  const { db, svc, member, reviewAccount } = await setup();
  await db.query("update site_config set value = 1 where name = 'tonight_min_verified_members'");
  await member("Kemi Woman", "woman");
  await reviewAccount("Review Woman", "woman", { phoneHash: HASH });
  await reviewAccount("Companion One", "man");
  assert.equal(Number((await svc("select home_live_stats() as s")).rows[0].s.verified_members), 1);
});

test("refresh lets the reviewer see her companions again, and touches no member's history", async () => {
  const { db, svc, member, reviewAccount, six } = await setup();
  const realWoman = await member("Kemi Woman", "woman");
  const realMan = await member("Tunde Man", "man");
  const reviewer = await reviewAccount("Review Woman", "woman", { phoneHash: HASH });
  const companion = await reviewAccount("Companion One", "man");
  await six(reviewer);
  await six(realWoman);
  const shown = async (v, c) => (await db.query("select count(*)::int as n from feed_shown where profile_id = $1 and candidate_id = $2", [v, c])).rows[0].n;
  assert.equal(await shown(reviewer, companion), 1);
  assert.equal(await shown(realWoman, realMan), 1);

  const r = (await svc("select review_accounts_refresh() as r")).rows[0].r;
  assert.equal(r.shown_forgotten, 1);
  assert.equal(await shown(reviewer, companion), 0, "the reviewer's history with a companion is forgotten");
  assert.equal(await shown(realWoman, realMan), 1, "a member's history is untouched");
});

test("retiring takes every review account out in one call", async () => {
  const { db, me, svc, member, reviewAccount, six, inSix, opens } = await setup();
  const realWoman = await member("Kemi Woman", "woman");
  const reviewer = await reviewAccount("Review Woman", "woman", { phoneHash: HASH });
  const companion = await reviewAccount("Companion One", "man");
  const other = await reviewAccount("Companion Two", "man");
  await svc("select review_account_allow_number($1, $2)", [reviewer, KEY]);
  await svc("select review_account_grant($1, 'premium_plus', now() + interval '60 days')", [reviewer]);
  await inSix(other, reviewer);

  const r = (await svc("select review_accounts_retire() as r")).rows[0].r;
  assert.deepEqual([...r.profile_ids].sort(), [reviewer, companion, other].sort());
  assert.equal(r.retired, 3);
  const paused = (await db.query("select bool_and(paused and review_retired_at is not null) as p from profiles where review_account")).rows[0].p;
  assert.equal(paused, true, "every review account is paused and marked retired");
  assert.equal((await db.query("select paused from profiles where id = $1", [realWoman])).rows[0].paused, false, "a member is untouched");
  assert.deepEqual(await six(reviewer), [], "no companion is shown any more");
  assert.equal(await opens(other, reviewer), false, "no retired profile opens");
  assert.equal((await svc("select beta_number_approved($1) as ok", [KEY])).rows[0].ok, false, "the number is out of the gate");
  assert.equal((await db.query("select current_tier($1)::text as t", [reviewer])).rows[0].t, "starter", "the grant has ended");
  await assert.rejects(me(reviewer, "update profiles set paused = false where id = $1", [reviewer]), /recorded by Toastly/, "it can't un-pause itself");
  await assert.rejects(svc("select review_account_go_live($1)", [reviewer]), /retired/, "nor be taken live again");

  // A second run changes nothing.
  assert.equal((await svc("select review_accounts_retire() as r")).rows[0].r.retired, 0);
});

test("the review account log is append-only", async () => {
  const { db, reviewAccount } = await setup();
  await reviewAccount("Review Woman", "woman", { phoneHash: HASH });
  assert.ok((await db.query("select count(*)::int as n from review_account_log")).rows[0].n >= 2);
  await assert.rejects(db.query("delete from review_account_log"), /append-only/);
  await assert.rejects(db.query("update review_account_log set action = 'x'"), /append-only/);
});

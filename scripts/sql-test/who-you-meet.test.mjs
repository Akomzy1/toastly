/**
 * Gender, who you'd like to meet, and a first prompt before going live
 * (migration 0036; PRD §7.3) — against a throwaway Postgres (PGlite) with
 * every migration applied. Never production.
 *
 *   node --test scripts/sql-test/who-you-meet.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb, as, makeUser, goLive } from "./harness.mjs";

async function setup() {
  const db = await freshDb();
  const me = (id, sql, params) => as(db, id, (tx) => tx.query(sql, params));

  /** A live member: gender and who they'd like to meet, as at sign-up. */
  async function member(name, gender, seeking, { live = true } = {}) {
    const id = await makeUser(db, { name, email: `${crypto.randomUUID()}@example.com`, gender });
    await db.query("update profiles set seeking = $2 where id = $1", [id, seeking]);
    if (live) await goLive(db, id, { seeking });
    await db.query("insert into prompt_answers (profile_id, prompt_id, answer) values ($1, 1, 'Jollof, then a long walk') on conflict do nothing", [id]);
    return id;
  }
  const six = async (id) => (await me(id, "select candidate_id from build_daily_feed($1)", [id])).rows.map((r) => r.candidate_id);
  const answerOf = async (id) => (await db.query("select id from prompt_answers where profile_id = $1 order by prompt_id limit 1", [id])).rows[0].id;
  const inSix = (viewer, candidate) =>
    db.query(`insert into daily_feed (profile_id, feed_date, position, candidate_id)
      select $1, current_date, coalesce(max(position), 0) + 1, $2 from daily_feed where profile_id = $1 and feed_date = current_date
      on conflict do nothing`, [viewer, candidate]);
  const opens = async (viewer, owner) => (await me(viewer, "select profile_for($1) as p", [owner])).rows[0].p !== null;
  return { db, me, member, six, answerOf, inSix, opens };
}

test("two members are in each other's six only if each matches the other's preference", async () => {
  const { member, six } = await setup();
  const man = await member("Adebayo Man", "man", ["woman"]);
  const woman = await member("Bisi Woman", "woman", ["man"]);
  const womanForWomen = await member("Chioma Woman", "woman", ["woman"]);
  const manForMen = await member("Dayo Man", "man", ["man"]);
  const womanForAnyone = await member("Efe Woman", "woman", ["woman", "man"]);

  const s = await six(man);
  assert.ok(s.includes(woman), "a man seeking women, a woman seeking men: yes");
  assert.ok(s.includes(womanForAnyone), "a woman open to both: yes");
  assert.ok(!s.includes(womanForWomen), "she isn't seeking men: no, though he's seeking women");
  assert.ok(!s.includes(manForMen), "he's seeking men, but this man isn't seeking men: no");
  assert.ok(!(await six(womanForWomen)).includes(man), "and it's the same both ways");
  assert.ok((await six(womanForWomen)).includes(womanForAnyone));
  assert.ok((await six(manForMen)).every((id) => id !== man && id !== woman));
});

test("no reply, invite or profile access across a preference that doesn't match", async () => {
  const { db, me, member, answerOf, inSix, opens } = await setup();
  const man = await member("Adebayo Man", "man", ["woman"], {});
  await db.query("insert into entitlements (profile_id, tier, source, ends_at) values ($1, 'premium', 'subscription', now() + interval '30 days')", [man]);
  const womanForWomen = await member("Chioma Woman", "woman", ["woman"]);
  // Even if she were in his six (say, before she changed her preference):
  await inSix(man, womanForWomen);
  assert.equal(await opens(man, womanForWomen), false, "no profile access");
  await assert.rejects(
    me(man, "insert into replies (sender_id, recipient_id, prompt_answer_id, kind, body) values ($1, $2, $3, 'text', 'Hello')", [man, womanForWomen, await answerOf(womanForWomen)]),
    "no reply");
  await assert.rejects(me(man, "select gist_invite($1)", [await answerOf(womanForWomen)]), /isn't available/, "no invite");

  // Not vacuous: a woman seeking men, in his six, is reachable every way.
  const woman = await member("Bisi Woman", "woman", ["man"]);
  await inSix(man, woman);
  assert.equal(await opens(man, woman), true);
  await me(man, "insert into replies (sender_id, recipient_id, prompt_answer_id, kind, body) values ($1, $2, $3, 'text', 'Hello')", [man, woman, await answerOf(woman)]);
  assert.ok((await me(man, "select gist_invite($1) as id", [await answerOf(woman)])).rows[0].id);

  // A preference changed later closes the door both ways.
  await me(woman, "update profiles set seeking = '{woman}' where id = $1", [woman]);
  assert.equal(await opens(man, woman), false);
  assert.equal(await opens(woman, man), false);
});

test("going live needs gender, who you'd like to meet, and one prompt answer", async () => {
  const { db, me } = await setup();
  const live = async (id) => (await db.query("select profile_is_live($1) as l", [id])).rows[0].l;
  const id = await makeUser(db, { name: "Folake Woman", email: `${crypto.randomUUID()}@example.com`, gender: "woman" });
  await goLive(db, id, { seeking: ["man"] });
  await db.query("delete from prompt_answers where profile_id = $1", [id]);
  await db.query("update profiles set first_live_at = null where id = $1", [id]);
  await db.query("delete from entitlements where profile_id = $1 and source = 'womens_launch_offer'", [id]);
  await db.query("delete from launch_offer_grants");
  assert.equal(await live(id), false, "photos and selfie done, no answer yet: not live");
  const s = (await me(id, "select live_profile_status() as s")).rows[0].s;
  assert.equal(s.prompt, false);
  assert.equal(s.about_you, true);

  // The first answer is the step that makes it live — and starts the women's offer.
  await me(id, "insert into prompt_answers (profile_id, prompt_id, answer) values ($1, 2, 'Someone who calls back')", [id]);
  assert.equal(await live(id), true);
  assert.ok((await db.query("select first_live_at from profiles where id = $1", [id])).rows[0].first_live_at, "stamped at that moment");
  assert.equal((await db.query("select count(*)::int as n from entitlements where profile_id = $1 and source = 'womens_launch_offer'", [id])).rows[0].n, 1);

  // Without who they'd like to meet, or with no gender, a profile isn't live.
  await db.query("update profiles set seeking = null where id = $1", [id]);
  assert.equal(await live(id), false);
  await db.query("update profiles set seeking = '{man}', gender = null where id = $1", [id]);
  assert.equal(await live(id), false);
});

test("the six only ever shows live members — a verified member without photos isn't shown", async () => {
  const { db, member, six } = await setup();
  const viewer = await member("Viewer Man", "man", ["woman"]);
  const id = await makeUser(db, { name: "Not Live Woman", email: `${crypto.randomUUID()}@example.com`, gender: "woman" });
  // Verified Real with phone, gender and an answer — but no photos.
  await db.query("update profiles set stage = 'verified_real', phone_verified_at = now(), seeking = '{man}' where id = $1", [id]);
  await db.query("insert into prompt_answers (profile_id, prompt_id, answer) values ($1, 1, 'Sunday rice')", [id]);
  assert.equal((await six(viewer)).includes(id), false);
});

test("the options come from config, and only listed options can be chosen", async () => {
  const { db, me } = await setup();
  const id = await makeUser(db, { name: "Gbemi Member", email: `${crypto.randomUUID()}@example.com`, gender: "woman" });
  await assert.rejects(me(id, "update profiles set gender = 'robot' where id = $1", [id]), /Choose from the list/);
  await assert.rejects(me(id, "update profiles set seeking = '{robot}' where id = $1", [id]), /Choose who/);
  await assert.rejects(me(id, "update profiles set seeking = '{}' where id = $1", [id]), /Choose who/);
  await me(id, "update profiles set seeking = '{woman,man}' where id = $1", [id]);
  // A new option, added by config, can be chosen without a code change.
  await db.query("insert into gender_options (code, label, plural, sort) values ('non_binary', 'Non-binary', 'Non-binary people', 3)");
  await me(id, "update profiles set seeking = '{non_binary}' where id = $1", [id]);
  // Sign-up keeps only listed values.
  const u = crypto.randomUUID();
  await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)",
    [u, `${u}@example.com`, JSON.stringify({ display_name: "Signup Test", gender: "man", seeking: ["woman", "robot"] })]);
  const row = (await db.query("select gender, seeking from profiles where id = $1", [u])).rows[0];
  assert.deepEqual(row, { gender: "man", seeking: ["woman"] });
});

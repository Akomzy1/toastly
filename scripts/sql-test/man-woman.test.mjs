/**
 * Woman or man, a man meets women and a woman meets men, and a first prompt
 * before going live (migration 0036; PRD §7.3) — against a throwaway
 * Postgres (PGlite) with every migration applied. Never production.
 *
 *   node --test scripts/sql-test/man-woman.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb, as, makeUser, goLive } from "./harness.mjs";

async function setup() {
  const db = await freshDb();
  const me = (id, sql, params) => as(db, id, (tx) => tx.query(sql, params));

  /** A live member, woman or man, as at sign-up. */
  async function member(name, gender, { live = true } = {}) {
    const id = await makeUser(db, { name, email: `${crypto.randomUUID()}@example.com`, gender });
    if (live) await goLive(db, id);
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
  const live = async (id) => (await db.query("select profile_is_live($1) as l", [id])).rows[0].l;
  return { db, me, member, six, answerOf, inSix, opens, live };
}

test("a man's six holds only women, and a woman's only men", async () => {
  const { member, six } = await setup();
  const man = await member("Adebayo Man", "man");
  const otherMan = await member("Dayo Man", "man");
  const woman = await member("Bisi Woman", "woman");
  const otherWoman = await member("Chioma Woman", "woman");

  const his = await six(man);
  assert.ok(his.includes(woman) && his.includes(otherWoman), "a man sees women");
  assert.ok(!his.includes(otherMan), "a man never sees a man");
  const hers = await six(woman);
  assert.ok(hers.includes(man) && hers.includes(otherMan), "a woman sees men");
  assert.ok(!hers.includes(otherWoman), "a woman never sees a woman");
});

test("no reply, invite or profile access between two men or two women", async () => {
  const { db, me, member, answerOf, inSix, opens } = await setup();
  const man = await member("Adebayo Man", "man");
  await db.query("insert into entitlements (profile_id, tier, source, ends_at) values ($1, 'premium', 'subscription', now() + interval '30 days')", [man]);
  const otherMan = await member("Dayo Man", "man");
  // Even if he were in his six:
  await inSix(man, otherMan);
  assert.equal(await opens(man, otherMan), false, "no profile access");
  await assert.rejects(
    me(man, "insert into replies (sender_id, recipient_id, prompt_answer_id, kind, body) values ($1, $2, $3, 'text', 'Hello')", [man, otherMan, await answerOf(otherMan)]),
    "no reply");
  await assert.rejects(me(man, "select gist_invite($1)", [await answerOf(otherMan)]), /isn't available/, "no invite");

  const woman = await member("Bisi Woman", "woman");
  const otherWoman = await member("Chioma Woman", "woman");
  await inSix(woman, otherWoman);
  assert.equal(await opens(woman, otherWoman), false);

  // Not vacuous: a woman in his six is reachable every way.
  await inSix(man, woman);
  assert.equal(await opens(man, woman), true);
  await me(man, "insert into replies (sender_id, recipient_id, prompt_answer_id, kind, body) values ($1, $2, $3, 'text', 'Hello')", [man, woman, await answerOf(woman)]);
  assert.ok((await me(man, "select gist_invite($1) as id", [await answerOf(woman)])).rows[0].id);
});

test("going live needs woman or man, and one prompt answer", async () => {
  const { db, me, live } = await setup();
  const id = await makeUser(db, { name: "Folake Woman", email: `${crypto.randomUUID()}@example.com`, gender: "woman" });
  await goLive(db, id);
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

  // No gender, or an answer from before (Non-binary, Prefer not to say): not live.
  await db.query("update profiles set gender = null where id = $1", [id]);
  assert.equal(await live(id), false);
  await db.query("update profiles set gender = 'non_binary' where id = $1", [id]);
  assert.equal(await live(id), false);
  assert.equal((await me(id, "select live_profile_status() as s")).rows[0].s.about_you, false);
});

test("a member who chose Non-binary or Prefer not to say before can choose woman or man, then it's locked", async () => {
  const { db, me, member, live } = await setup();
  // Live before 0036 with an answer that's gone (set as the old sign-up did).
  const id = await member("Old Member", "man");
  await db.query("update profiles set gender = 'prefer_not_to_say' where id = $1", [id]);
  assert.equal(await live(id), false, "not live until they choose");

  await assert.rejects(me(id, "update profiles set gender = 'non_binary' where id = $1", [id]), /Choose woman or man/);
  await me(id, "update profiles set gender = 'woman' where id = $1", [id]);
  assert.equal(await live(id), true);
  // Already live once: choosing woman now doesn't start the women's offer.
  assert.equal((await db.query("select count(*)::int as n from entitlements where profile_id = $1 and source = 'womens_launch_offer'", [id])).rows[0].n, 0);
  // From here it's locked: support changes it.
  await assert.rejects(me(id, "update profiles set gender = 'man' where id = $1", [id]), /Toastly Help/);
});

test("only woman and man exist: not as a choice, not in config, not from sign-up", async () => {
  const { db, me } = await setup();
  const id = await makeUser(db, { name: "Gbemi Member", email: `${crypto.randomUUID()}@example.com`, gender: "woman" });
  await assert.rejects(me(id, "update profiles set gender = 'robot' where id = $1", [id]), /Choose woman or man/);
  await assert.rejects(me(id, "update profiles set gender = 'non_binary' where id = $1", [id]), /Choose woman or man/);
  await assert.rejects(db.query("insert into gender_options (code, label, sort) values ('non_binary', 'Non-binary', 3)"),
    "the list can't grow a third option, even by config");
  assert.deepEqual((await db.query("select code from gender_options order by sort")).rows.map((r) => r.code), ["woman", "man"]);
  await assert.rejects(me(id, "insert into gender_options (code, label) values ('man', 'x')"));

  // Sign-up keeps only woman or man.
  const u = crypto.randomUUID();
  await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)",
    [u, `${u}@example.com`, JSON.stringify({ display_name: "Signup Test", gender: "non_binary" })]);
  assert.equal((await db.query("select gender from profiles where id = $1", [u])).rows[0].gender, null);
});

test("the six only ever shows live members — a verified member without photos isn't shown", async () => {
  const { db, member, six } = await setup();
  const viewer = await member("Viewer Man", "man");
  const id = await makeUser(db, { name: "Not Live Woman", email: `${crypto.randomUUID()}@example.com`, gender: "woman" });
  // Verified Real with phone, gender and an answer — but no photos.
  await db.query("update profiles set stage = 'verified_real', phone_verified_at = now() where id = $1", [id]);
  await db.query("insert into prompt_answers (profile_id, prompt_id, answer) values ($1, 1, 'Sunday rice')", [id]);
  assert.equal((await six(viewer)).includes(id), false);
});

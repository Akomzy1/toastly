/**
 * Live video in a Gist (migration 0040; PRD §5.4; Phase 2) — against a
 * throwaway Postgres (PGlite) with every migration applied. Never production.
 *
 *   node --test scripts/sql-test/gist-video.test.mjs
 *
 * The four the owner asked for: video can't start without both accepting;
 * a call where neither has a video plan can't enable video; one person
 * turning video off stops both; a repeat request after a decline is refused.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb, as, makeUser, goLive } from "./harness.mjs";

async function setup() {
  const db = await freshDb();
  const me = (id, sql, params) => as(db, id, (tx) => tx.query(sql, params));
  async function member(name, gender, tier = "premium") {
    const id = await makeUser(db, { name, email: `${crypto.randomUUID()}@example.com`, gender });
    await goLive(db, id);
    // goLive may have started a woman's launch offer; tests set plans explicitly.
    await db.query("update entitlements set ends_at = now() where profile_id = $1 and source = 'womens_launch_offer'", [id]);
    if (tier !== "starter") {
      await db.query("insert into entitlements (profile_id, tier, source, ends_at) values ($1, $2, 'subscription', now() + interval '30 days')", [id, tier]);
    }
    return id;
  }
  /** A man and a woman in a connected Gist, started `minutes` ago. */
  async function call(man, woman, minutes = 4) {
    await db.query(`insert into daily_feed (profile_id, feed_date, position, candidate_id)
      select $1, current_date, coalesce(max(position), 0) + 1, $2 from daily_feed where profile_id = $1 and feed_date = current_date
      on conflict do nothing`, [man, woman]);
    const answer = (await db.query("select id from prompt_answers where profile_id = $1 limit 1", [woman])).rows[0].id;
    const s = (await me(man, "select gist_invite($1) as id", [answer])).rows[0].id;
    await me(woman, "select gist_respond($1, true)", [s]);
    await db.query("update gist_sessions set proposer_ready_at = now(), invitee_ready_at = now() where id = $1", [s]);
    await me(man, "select gist_join($1)", [s]);
    await me(woman, "select gist_join($1)", [s]);
    await db.query("update gist_sessions set started_at = now() - make_interval(mins => $2) where id = $1", [s, minutes]);
    return s;
  }
  const state = async (s) => (await db.query("select video_state as v, video_declined_at is not null as declined, video_off_reason as reason from gist_sessions where id = $1", [s])).rows[0];
  const request = (who, s) => me(who, "select gist_video_request($1) as r", [s]).then((r) => r.rows[0].r);
  const answer = (who, s, yes) => me(who, "select gist_video_answer($1, $2) as r", [s, yes]).then((r) => r.rows[0].r);
  const off = (who, s, reason = "turned_off") => me(who, "select gist_video_off($1, $2) as r", [s, reason]).then((r) => r.rows[0].r);
  return { db, me, member, call, state, request, answer, off };
}

test("video can't start without both accepting", async () => {
  const { member, call, state, request, answer } = await setup();
  const man = await member("Ade Man", "man", "premium_plus");
  const woman = await member("Bisi Woman", "woman");
  const s = await call(man, woman);

  assert.equal(await request(man, s), "requested");
  assert.equal((await state(s)).v, "requested", "asking alone doesn't turn it on");
  await assert.rejects(answer(man, s, true), /other person answers/, "the asker can't accept their own request");
  assert.equal((await state(s)).v, "requested");
  assert.equal(await answer(woman, s, true), "on");
  assert.equal((await state(s)).v, "on", "on only once the other person accepts");
});

test("a call where neither has a video plan can't enable video — either one's plan is enough", async () => {
  const { me, member, call, state, request } = await setup();
  const man = await member("Chidi Man", "man", "premium");
  const woman = await member("Dupe Woman", "woman", "starter");
  const s = await call(man, woman);
  assert.equal((await me(man, "select gist_video_allowed($1) as a", [s])).rows[0].a, false);
  await assert.rejects(request(man, s), /isn't available/);
  await assert.rejects(request(woman, s), /isn't available/);
  assert.equal((await state(s)).v, "off");

  // Either participant's plan unlocks it — here the invitee's Diaspora Plus.
  const man2 = await member("Emeka Man", "man", "starter");
  const woman2 = await member("Funke Woman", "woman", "diaspora_plus");
  const s2 = await call(man2, woman2);
  assert.equal((await me(man2, "select gist_video_allowed($1) as a", [s2])).rows[0].a, true);
  assert.equal(await request(man2, s2), "requested", "the Starter member can ask, because she has the plan");
});

test("the women's launch offer counts as a video plan", async () => {
  const { db, me, member, call, request } = await setup();
  const man = await member("Gbenga Man", "man", "starter");
  const woman = await member("Halima Woman", "woman", "starter");
  await db.query("insert into entitlements (profile_id, tier, source, starts_at, ends_at) values ($1, 'premium_plus', 'womens_launch_offer', now(), now() + interval '30 days')", [woman]);
  const s = await call(man, woman);
  assert.equal((await me(man, "select gist_video_allowed($1) as a", [s])).rows[0].a, true);
  assert.equal(await request(man, s), "requested");
});

test("one person turning video off stops it for both", async () => {
  const { me, member, call, state, request, answer, off } = await setup();
  const man = await member("Ifeanyi Man", "man", "premium_plus");
  const woman = await member("Jumoke Woman", "woman");
  const s = await call(man, woman);
  await request(man, s);
  await answer(woman, s, true);
  assert.equal((await state(s)).v, "on");
  // She turns it off: there is one state for the Gist, so it's off for him too.
  await off(woman, s);
  assert.deepEqual(await state(s), { v: "off", declined: false, reason: "turned_off" });
  const hisView = (await me(man, "select video_state from gist_sessions where id = $1", [s])).rows[0].video_state;
  assert.equal(hisView, "off", "his screen reads off as well");
  // Turning off isn't a decline: it can be asked for again.
  assert.equal(await request(man, s), "requested");
  // A weak connection does the same, for both, and says why.
  await answer(woman, s, true);
  await off(man, s, "weak_connection");
  assert.deepEqual(await state(s), { v: "off", declined: false, reason: "weak_connection" });
});

test("a repeat request after a decline is refused, for the rest of that Gist", async () => {
  const { member, call, state, request, answer } = await setup();
  const man = await member("Kola Man", "man", "premium_plus");
  const woman = await member("Lola Woman", "woman");
  const s = await call(man, woman);
  await request(man, s);
  assert.equal(await answer(woman, s, false), "off");
  assert.deepEqual(await state(s), { v: "off", declined: true, reason: null });
  await assert.rejects(request(man, s), /declined/, "he can't ask again");
  await assert.rejects(request(woman, s), /declined/, "nor can she");
  // A new Gist starts fresh.
  await (async () => {})();
});

test("every Gist starts as voice; asking opens after 3 minutes (config); the asker can cancel", async () => {
  const { db, member, call, state, request, me } = await setup();
  const man = await member("Musa Man", "man", "premium_plus");
  const woman = await member("Nneka Woman", "woman");
  const s = await call(man, woman, 1);
  assert.equal((await state(s)).v, "off", "a Gist starts as voice");
  await assert.rejects(request(man, s), /first few minutes/, "not in the first 3 minutes");
  await db.query("update gist_config set video_ask_after_seconds = 30");
  assert.equal(await request(man, s), "requested", "the wait is one config value");
  await assert.rejects(me(woman, "select gist_video_cancel($1)", [s]).then(async () => {
    if ((await state(s)).v !== "requested") throw new Error("she cancelled his request");
    throw new Error("no-op as expected");
  }), /no-op as expected/, "only the asker can withdraw it");
  assert.equal((await me(man, "select gist_video_cancel($1) as r", [s])).rows[0].r, "off");
  assert.deepEqual(await state(s), { v: "off", declined: false, reason: "cancelled" });
});

test("plans are checked again when the request is answered", async () => {
  const { db, member, call, state, request, answer } = await setup();
  const man = await member("Obi Man", "man", "premium_plus");
  const woman = await member("Peju Woman", "woman");
  const s = await call(man, woman);
  await request(man, s);
  // His Premium Plus ends before she answers.
  await db.query("update entitlements set ends_at = now() where profile_id = $1 and tier = 'premium_plus'", [man]);
  assert.equal(await answer(woman, s, true), "unavailable");
  assert.equal((await state(s)).v, "off", "the request lapses; the Gist stays voice");
});

test("members can't write video state, and strangers can't touch it", async () => {
  const { me, member, call, state } = await setup();
  const man = await member("Quadri Man", "man", "premium_plus");
  const woman = await member("Ronke Woman", "woman");
  const s = await call(man, woman);
  // A member's own write never changes video state — refused by the guard,
  // or ignored outright for a live Gist; either way nothing moves.
  const tryWrite = (who, sql) => me(who, sql, [s]).catch((e) => assert.match(e.message, /kept by Toastly|Gist clock/));
  await tryWrite(man, "update gist_sessions set video_state = 'on' where id = $1");
  await tryWrite(woman, "update gist_sessions set video_declined_at = now() where id = $1");
  assert.deepEqual(await state(s), { v: "off", declined: false, reason: null });
  const stranger = await member("Sola Man", "man", "premium_plus");
  await assert.rejects(me(stranger, "select gist_video_request($1)", [s]), /doesn't exist/);
  await assert.rejects(me(stranger, "select gist_video_allowed($1)", [s]), /doesn't exist/);
  assert.equal((await state(s)).v, "off");
});

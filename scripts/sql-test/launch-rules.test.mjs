/**
 * Launch rules decided 8 October 2026 (migration 0035; PRD §5.4, §7.1,
 * §7.3) — against a throwaway Postgres (PGlite) with every migration
 * applied. Never production.
 *
 *   node --test scripts/sql-test/launch-rules.test.mjs
 *
 *   - Starter's monthly Gist cap counts only a Gist the member STARTED that
 *     CONNECTED; accepting an invitation is free and never counts.
 *   - Nobody pays before going live.
 *   - The women's launch offer starts at go-live, at most once per phone
 *     number; gender can't be changed by the member once live; the notice
 *     three days before the offer ends fires once.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb, as, asService, makeUser, goLive } from "./harness.mjs";

async function setup() {
  const db = await freshDb();
  const me = (id, sql, params) => as(db, id, (tx) => tx.query(sql, params));
  const svc = (sql, params) => asService(db, (tx) => tx.query(sql, params));

  async function member(name, { tier = null, live = true, gender = "prefer_not_to_say", country = "NG", phoneHash } = {}) {
    const id = await makeUser(db, { name, email: `${crypto.randomUUID()}@example.com`, gender });
    if (country !== "NG") await db.query("update profiles set country_code = $2 where id = $1", [id, country]);
    if (live) await goLive(db, id, { phoneHash });
    if (tier) await db.query("insert into entitlements (profile_id, tier, source, ends_at) values ($1, $2, 'subscription', now() + interval '30 days')", [id, tier]);
    await db.query("insert into prompt_answers (profile_id, prompt_id, answer) values ($1, 1, 'Jollof, then a long walk')", [id]);
    return id;
  }
  const answerOf = async (id) => (await db.query("select id from prompt_answers where profile_id = $1", [id])).rows[0].id;
  const inSix = (viewer, candidate) =>
    db.query(`insert into daily_feed (profile_id, feed_date, position, candidate_id)
      select $1, current_date, coalesce(max(position), 0) + 1, $2 from daily_feed where profile_id = $1 and feed_date = current_date
      on conflict do nothing`, [viewer, candidate]);

  /** from invites to through the real functions; returns the session id. */
  async function invite(from, to) {
    await inSix(from, to);
    return (await me(from, "select gist_invite($1) as id", [await answerOf(to)])).rows[0].id;
  }
  const accept = (to, s) => me(to, "select gist_respond($1, true)", [s]);
  /** Both say ready, then the call connects (gist_join). */
  async function connect(s, from, to) {
    await db.query("update gist_sessions set proposer_ready_at = now(), invitee_ready_at = now() where id = $1", [s]);
    await me(from, "select gist_join($1)", [s]);
    return me(to, "select gist_join($1)", [s]);
  }
  const used = async (id) => (await db.query("select voice_gists_this_month($1) as n", [id])).rows[0].n;
  const room = async (id) => (await db.query("select gist_has_room($1) as r", [id])).rows[0].r;

  return { db, me, svc, member, invite, accept, connect, used, room };
}

// --- A. The Starter Gist cap ----------------------------------------------------

test("the cap is one config value: one Gist a month on Starter", async () => {
  const { db, member } = await setup();
  const s = await member("Starter");
  const p = await member("Premium", { tier: "premium" });
  assert.equal((await db.query("select starter_monthly_gists from plan_config")).rows[0].starter_monthly_gists, 1);
  assert.equal((await db.query("select voice_gist_allowance($1) as a", [s])).rows[0].a, 1);
  assert.equal((await db.query("select voice_gist_allowance($1) as a", [p])).rows[0].a, null, "paid plans: unlimited");
});

test("a second started Gist in a month is refused without coins", async () => {
  const { member, invite, accept, connect, used } = await setup();
  const starter = await member("Starter");
  const b = await member("Bola");
  const c = await member("Chidi");
  const d = await member("Dami");

  // An invite to C is sent before the first call connects — allowed then…
  const first = await invite(starter, b);
  const queued = await invite(starter, c);
  await accept(b, first);
  await accept(c, queued);
  await connect(first, starter, b);
  assert.equal(await used(starter), 1, "the first started Gist that connected counts");

  // …but a second one can't start, and a new invite is refused.
  await assert.rejects(connect(queued, starter, c), /allowance/, "the second call can't connect");
  await assert.rejects(invite(starter, d), /allowance/, "a new invite is refused");
  assert.equal(await used(starter), 1);
});

test("accepting any number of invitations never counts", async () => {
  const { member, invite, accept, connect, used, room } = await setup();
  const starter = await member("Starter");
  for (let i = 0; i < 3; i++) {
    const inviter = await member(`Inviter ${i}`, { tier: "premium" });
    const s = await invite(inviter, starter);
    await accept(starter, s);
    await connect(s, inviter, starter);
  }
  assert.equal(await used(starter), 0, "three accepted, connected Gists: none of them the Starter member's");
  assert.equal(await room(starter), true, "their own Gist is still there to start");
  // And a Starter inviter's call to a Starter invitee spends only the inviter's.
  const other = await member("Other Starter");
  const s = await invite(other, starter);
  await accept(starter, s);
  await connect(s, other, starter);
  assert.equal(await used(other), 1);
  assert.equal(await used(starter), 0);
});

test("a started Gist that never connects doesn't count", async () => {
  const { db, member, invite, accept, used, room } = await setup();
  const starter = await member("Starter");
  const b = await member("Bola");
  const c = await member("Chidi");
  const accepted = await invite(starter, b);
  await accept(b, accepted); // accepted, never joined
  const declined = await invite(starter, c);
  await db.query("update gist_sessions set status = 'declined' where id = $1", [declined]);
  assert.equal(await used(starter), 0);
  assert.equal(await room(starter), true, "still has this month's Gist");
});

// --- C. Nobody pays before going live ---------------------------------------------

test("no payment opens and no coin-paid plan is granted for a member who isn't live", async () => {
  const { db, me, svc, member } = await setup();
  const notLive = await member("Not Live", { live: false });
  const live = await member("Live");
  const ref = () => `tly_${crypto.randomUUID()}`;
  await assert.rejects(svc("select payment_open($1, 'ng-10', 'pack', $2) as o", [notLive, ref()]), /isn't live/);
  await assert.rejects(svc("select payment_open($1, 'premium', 'pass', $2) as o", [notLive, ref()]), /isn't live/);
  await assert.rejects(svc("select payment_open($1, 'diaspora', 'recurring', $2) as o", [notLive, ref()]), /isn't live/);
  await db.query("insert into coin_ledger (profile_id, delta, kind, bucket) values ($1, 50, 'purchase', 'purchased')", [notLive]);
  await assert.rejects(me(notLive, "select subscribe_with_coins('premium')"), /isn't live/);
  assert.equal((await db.query("select count(*)::int as n from payments where profile_id = $1", [notLive])).rows[0].n, 0);
  // Not vacuous: the same things work once live.
  assert.ok((await svc("select payment_open($1, 'ng-10', 'pack', $2) as o", [live, ref()])).rows[0].o);
  await db.query("insert into coin_ledger (profile_id, delta, kind, bucket) values ($1, 50, 'purchase', 'purchased')", [live]);
  assert.equal((await me(live, "select subscribe_with_coins('premium') as r")).rows[0].r.paid, true);
});

test("diaspora prices are $10 and $20", async () => {
  const { db, svc, member } = await setup();
  const rows = (await db.query("select sku, amount_minor from price_list where sku in ('diaspora', 'diaspora_plus') order by sku")).rows;
  assert.deepEqual(rows, [{ sku: "diaspora", amount_minor: 1000 }, { sku: "diaspora_plus", amount_minor: 2000 }]);
  const abroad = await member("Abroad", { country: "GB" });
  const o = (await svc("select payment_open($1, 'diaspora_plus', 'recurring', $2) as o", [abroad, `tly_${crypto.randomUUID()}`])).rows[0].o;
  assert.equal(o.amount_minor, 2000, "checkout charges the new price");
});

// --- C. The women's offer --------------------------------------------------------

const offer = async (db, id) =>
  (await db.query("select tier, starts_at, ends_at from entitlements where profile_id = $1 and source = 'womens_launch_offer'", [id])).rows;

test("the women's entitlement starts at go-live, not at sign-up", async () => {
  const { db, member } = await setup();
  const home = await member("Woman Home", { gender: "woman", live: false });
  assert.deepEqual(await offer(db, home), [], "nothing at sign-up");
  assert.equal((await db.query("select current_tier($1) as t", [home])).rows[0].t, "starter");

  await goLive(db, home);
  const [g] = await offer(db, home);
  const firstLive = (await db.query("select first_live_at from profiles where id = $1", [home])).rows[0].first_live_at;
  assert.equal(g.tier, "premium_plus");
  assert.equal(+g.starts_at, +firstLive, "starts the moment the profile first went live");
  assert.equal(+g.ends_at - +g.starts_at, 30 * 24 * 60 * 60 * 1000, "30 days");
  assert.equal((await db.query("select current_tier($1) as t", [home])).rows[0].t, "premium_plus");

  const abroad = await member("Woman Abroad", { gender: "woman", country: "GB" });
  assert.equal((await offer(db, abroad))[0].tier, "diaspora_plus", "abroad: Diaspora Plus");
  const man = await member("Man", { gender: "man" });
  assert.deepEqual(await offer(db, man), []);
});

test("the offer can't be granted twice to the same phone number", async () => {
  const { db, member } = await setup();
  const hash = "a".repeat(64);
  const first = await member("First Account", { gender: "woman", phoneHash: hash });
  assert.equal((await offer(db, first)).length, 1);
  // Delete the account; the number signs up again.
  await db.query("delete from auth.users where id = $1", [first]);
  const again = await member("Same Phone Again", { gender: "woman", phoneHash: hash });
  assert.deepEqual(await offer(db, again), [], "no second offer on the same number");
  // Going live again (a profile that dropped below four photos and came back) doesn't re-grant either.
  const other = await member("Other Phone", { gender: "woman" });
  await db.query("update profiles set first_live_at = first_live_at where id = $1", [other]);
  assert.equal((await offer(db, other)).length, 1);
});

test("gender can't be changed by the member after go-live", async () => {
  const { db, me, svc, member } = await setup();
  const before = await member("Before Live", { gender: "woman", live: false });
  await me(before, "update profiles set gender = 'man' where id = $1", [before]);
  assert.equal((await db.query("select gender from profiles where id = $1", [before])).rows[0].gender, "man", "before going live it can be corrected");

  const live = await member("Live Member", { gender: "woman" });
  await assert.rejects(me(live, "update profiles set gender = 'man' where id = $1", [live]), /Toastly Help/);
  await assert.rejects(me(live, "update profiles set gender = null where id = $1", [live]), /Toastly Help/);
  assert.equal((await db.query("select gender from profiles where id = $1", [live])).rows[0].gender, "woman");
  // Support can.
  await svc("update profiles set gender = 'non_binary' where id = $1", [live]);
  assert.equal((await db.query("select gender from profiles where id = $1", [live])).rows[0].gender, "non_binary");
});

test("the notice three days before the offer ends fires, once", async () => {
  const { db, svc, member } = await setup();
  const due = await member("Ends Soon", { gender: "woman" });
  const later = await member("Ends Later", { gender: "woman" });
  // Day 27 of 30 for one, day 20 for the other.
  await db.query("update entitlements set ends_at = now() + interval '2 days 23 hours' where profile_id = $1 and source = 'womens_launch_offer'", [due]);
  await db.query("update entitlements set ends_at = now() + interval '10 days' where profile_id = $1 and source = 'womens_launch_offer'", [later]);

  const sent = (await svc("select * from offer_ending_notices()")).rows;
  assert.deepEqual(sent.map((r) => r.profile_id), [due], "only the offer ending within three days");
  assert.equal(sent[0].tier, "premium_plus");
  const notices = (await db.query("select profile_id, kind from member_notices where kind = 'offer_ending'")).rows;
  assert.deepEqual(notices, [{ profile_id: due, kind: "offer_ending" }], "an in-app notice for her");
  assert.deepEqual((await svc("select * from offer_ending_notices()")).rows, [], "the next run sends nothing twice");
  // The member reads her own notice; nobody else's.
  assert.equal((await as(db, due, (tx) => tx.query("select kind from member_notices"))).rows.length, 1);
  assert.equal((await as(db, later, (tx) => tx.query("select kind from member_notices"))).rows.length, 0);
});

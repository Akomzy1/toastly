/**
 * Launch blockers decided 8 October 2026 (migration 0037) — against a
 * throwaway Postgres (PGlite) with every migration applied. Never production.
 *
 *   node --test scripts/sql-test/launch-blockers.test.mjs
 *
 *   - An extra Gist with coins at the cap: ₦1,000 or $3 in coins from config,
 *     taken only when the call connects, once; accepting stays free.
 *   - Refunds: a refunded plan ends; unspent coins are removed; spent ones go
 *     to staff; nothing is ever paid out.
 *   - A reviewer corrects gender on a "Not who they say they are" report,
 *     which ends the women's launch offer. Never automatic.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb, as, asService, makeUser, goLive } from "./harness.mjs";

async function setup() {
  const db = await freshDb();
  const me = (id, sql, params) => as(db, id, (tx) => tx.query(sql, params));
  const svc = (sql, params) => asService(db, (tx) => tx.query(sql, params));

  async function member(name, { gender = "man", country = "NG", live = true, phoneHash } = {}) {
    const id = await makeUser(db, { name, email: `${crypto.randomUUID()}@example.com`, gender });
    if (country !== "NG") await db.query("update profiles set country_code = $2 where id = $1", [id, country]);
    if (live) await goLive(db, id, { phoneHash });
    return id;
  }
  const answerOf = async (id) => (await db.query("select id from prompt_answers where profile_id = $1 limit 1", [id])).rows[0].id;
  const inSix = (viewer, candidate) =>
    db.query(`insert into daily_feed (profile_id, feed_date, position, candidate_id)
      select $1, current_date, coalesce(max(position), 0) + 1, $2 from daily_feed where profile_id = $1 and feed_date = current_date
      on conflict do nothing`, [viewer, candidate]);
  /** A Gist the member started, accepted and connected — it counts. */
  async function useGist(from, to) {
    await inSix(from, to);
    const s = (await me(from, "select gist_invite($1) as id", [await answerOf(to)])).rows[0].id;
    await me(to, "select gist_respond($1, true)", [s]);
    await db.query("update gist_sessions set proposer_ready_at = now(), invitee_ready_at = now() where id = $1", [s]);
    await me(from, "select gist_join($1)", [s]);
    await me(to, "select gist_join($1)", [s]);
    return s;
  }
  const room = async (id) => (await db.query("select gist_has_room($1) as r", [id])).rows[0].r;
  const balances = async (id) =>
    (await db.query("select purchased_balance($1) as bought, promo_balance($1) as promo", [id])).rows[0];
  const ref = () => `tst_${crypto.randomUUID()}`;
  const one = async (sql, params) => (await svc(sql, params)).rows[0];
  async function buyPack(id, sku = "ng-30") {
    const r = ref();
    const o = await one("select payment_open($1, $2, 'pack', $3) as o", [id, sku, r]);
    assert.equal((await one("select payment_settle('paystack', $1, $2, 'NGN', 'NG', 'card') as s", [r, o.o.amount_minor])).s, "granted");
    return { ref: r, amount: o.o.amount_minor };
  }
  return { db, me, svc, one, member, useGist, room, balances, buyPack, ref };
}

// --- 5. An extra Gist with coins ------------------------------------------------

/** Coins straight onto the ledger, as a pack or a gift would leave them. */
async function give(db, id, n, bucket = "purchased") {
  await db.query(
    "insert into coin_ledger (profile_id, delta, kind, bucket, txn_id, note) values ($1, $2, $3, $4, gen_random_uuid(), 'test')",
    [id, n, bucket === "purchased" ? "purchase" : "promo_grant", bucket],
  );
}

/** A live Starter who has used this month's free Gist, plus helpers for a coin Gist. */
async function atCap(ctx, name, opts) {
  const { db, me, member, useGist } = ctx;
  const id = await member(name, opts);
  await useGist(id, await member(`${name} First`));
  assert.equal(await ctx.room(id), false);
  return id;
}
async function coinInvite(ctx, from, to) {
  const { db, me } = ctx;
  await db.query(`insert into daily_feed (profile_id, feed_date, position, candidate_id)
    select $1, current_date, coalesce(max(position), 0) + 1, $2 from daily_feed where profile_id = $1 and feed_date = current_date
    on conflict do nothing`, [from, to]);
  const answer = (await db.query("select id from prompt_answers where profile_id = $1 limit 1", [to])).rows[0].id;
  return (await me(from, "select gist_invite($1, true) as id", [answer])).rows[0].id;
}
async function connect(ctx, s, from, to) {
  const { db, me } = ctx;
  await me(to, "select gist_respond($1, true)", [s]);
  await db.query("update gist_sessions set proposer_ready_at = now(), invitee_ready_at = now() where id = $1", [s]);
  await me(from, "select gist_join($1)", [s]);
  await me(to, "select gist_join($1)", [s]);
}
const coinsOf = async (db, id) => (await db.query("select coin_balance($1) as b", [id])).rows[0].b;

test("the extra Gist costs ₦1,000 or $3 in coins at the built pack rate — 10 and 15, both in config", async () => {
  const ctx = await setup();
  const { db, member } = ctx;
  const cfg = (await db.query("select extra_gist_coins_ngn as ngn, extra_gist_coins_usd as usd from plan_config")).rows[0];
  const coinNaira = (await db.query("select coin_naira from coin_config")).rows[0].coin_naira;
  const usdRates = (await db.query("select distinct amount_minor::numeric / coins as cents from price_list where kind = 'coin_pack' and currency = 'USD' and active")).rows;
  assert.equal(usdRates.length, 1, "every dollar pack is one rate");
  assert.equal(cfg.ngn, Math.round(1000 / coinNaira), "₦1,000 at the coin rate");
  assert.equal(cfg.usd, Math.round(300 / Number(usdRates[0].cents)), "$3 at the dollar pack rate");
  assert.deepEqual(cfg, { ngn: 10, usd: 15 });

  const home = await member("Home Hauwa");
  const away = await member("Away Ade", { country: "GB" });
  assert.equal((await db.query("select extra_gist_price($1) as p", [home])).rows[0].p, 10);
  assert.equal((await db.query("select extra_gist_price($1) as p", [away])).rows[0].p, 15);
});

test("coins come off only when the call connects — nothing if it never does", async () => {
  const ctx = await setup();
  const { db, me, member } = ctx;
  const sade = await atCap(ctx, "Starter Sade");
  const bola = await member("Bola");
  const chidi = await member("Chidi");
  const dami = await member("Dami");
  const ans = async (id) => (await db.query("select id from prompt_answers where profile_id = $1 limit 1", [id])).rows[0].id;

  // At the cap, an ordinary invite is refused; a coin invite needs the coins.
  await db.query(`insert into daily_feed (profile_id, feed_date, position, candidate_id)
    select $1, current_date, coalesce(max(position), 0) + 1, $2 from daily_feed where profile_id = $1 and feed_date = current_date`, [sade, bola]);
  await assert.rejects(me(sade, "select gist_invite($1)", [await ans(bola)]), /allowance/);
  await give(db, sade, 3);
  await assert.rejects(coinInvite(ctx, sade, bola), /You need 10 coins/);
  await give(db, sade, 17);
  assert.equal(await coinsOf(db, sade), 20);

  // Declined: nothing spent.
  const declined = await coinInvite(ctx, sade, bola);
  assert.equal((await db.query("select paid_with_coins from gist_sessions where id = $1", [declined])).rows[0].paid_with_coins, true);
  await me(bola, "select gist_respond($1, false)", [declined]);
  assert.equal(await coinsOf(db, sade), 20, "declined — nothing spent");

  // Accepted but never joined: nothing spent.
  const quiet = await coinInvite(ctx, sade, chidi);
  await me(chidi, "select gist_respond($1, true)", [quiet]);
  assert.equal(await coinsOf(db, sade), 20, "accepted, never connected — nothing spent");

  // Connected: 10 coins, once, recorded on the session.
  const real = await coinInvite(ctx, sade, dami);
  await give(db, dami, 5);
  await connect(ctx, real, sade, dami);
  assert.equal(await coinsOf(db, sade), 10);
  const row = (await db.query("select coins_charged, coins_charged_at is not null as charged from gist_sessions where id = $1", [real])).rows[0];
  assert.deepEqual(row, { coins_charged: 10, charged: true });

  // Accepting stays free: the invitee's coins and count are untouched.
  assert.equal(await coinsOf(db, dami), 5);
  assert.equal((await db.query("select voice_gists_this_month($1) as n", [dami])).rows[0].n, 0);
  // The paid Gist doesn't use the month's free one.
  assert.equal((await db.query("select voice_gists_this_month($1) as n", [sade])).rows[0].n, 1);
});

test("no double charge when either person reconnects", async () => {
  const ctx = await setup();
  const { db, me, member } = ctx;
  const sade = await atCap(ctx, "Starter Sade");
  const eko = await member("Eko");
  await give(db, sade, 25);
  const s = await coinInvite(ctx, sade, eko);
  await connect(ctx, s, sade, eko);
  for (let i = 0; i < 3; i++) {
    await me(sade, "select gist_join($1)", [s]);
    await me(eko, "select gist_join($1)", [s]);
  }
  assert.equal(await coinsOf(db, sade), 15, "charged 10 once, however often anyone rejoins");
  assert.equal((await db.query("select count(distinct txn_id)::int as n from coin_ledger where profile_id = $1 and kind = 'gist_top_up'", [sade])).rows[0].n, 1);
});

test("the price is read from config when the call connects, by track; gift coins pay first", async () => {
  const ctx = await setup();
  const { db, member } = ctx;
  const home = await atCap(ctx, "Home Halima");
  const away = await atCap(ctx, "Away Ayo", { country: "GB" });
  const x = await member("Xavier");
  const y = await member("Yemi");
  await give(db, home, 6, "promotional");
  await give(db, home, 10);
  await give(db, away, 30);

  const s1 = await coinInvite(ctx, home, x);
  const s2 = await coinInvite(ctx, away, y);
  // Config changes between the invite and the call: the call's price wins.
  await db.query("update plan_config set extra_gist_coins_ngn = 7, extra_gist_coins_usd = 12");
  await connect(ctx, s1, home, x);
  await connect(ctx, s2, away, y);

  const b = (await db.query("select purchased_balance($1) as bought, promo_balance($1) as promo", [home])).rows[0];
  assert.deepEqual(b, { bought: 9, promo: 0 }, "7 coins: the 6 gift coins first, then 1 bought");
  assert.equal(await coinsOf(db, away), 18, "abroad: the dollar-track price, 12");
});

test("an extra Gist: paid plans never pay, and members can't touch the coin columns or the price", async () => {
  const ctx = await setup();
  const { db, me, member } = ctx;
  const paid = await member("Premium Pat");
  await db.query("insert into entitlements (profile_id, tier, source, ends_at) values ($1, 'premium', 'subscription', now() + interval '30 days')", [paid]);
  const q = await member("Queen");
  await give(db, paid, 20);
  const s = await coinInvite(ctx, paid, q);
  assert.equal((await db.query("select paid_with_coins from gist_sessions where id = $1", [s])).rows[0].paid_with_coins, false, "unlimited plans don't use coins");
  await connect(ctx, s, paid, q);
  assert.equal(await coinsOf(db, paid), 20);

  // A member can't mark a free Gist as paid to win back the month's free one.
  const sade = await atCap(ctx, "Starter Sade");
  const free = (await db.query("select id from gist_sessions where proposer_id = $1", [sade])).rows[0].id;
  await assert.rejects(me(sade, "update gist_sessions set coins_charged_at = now(), coins_charged = 1 where id = $1", [free]), /kept by Toastly/);
  await assert.rejects(me(sade, "update gist_sessions set paid_with_coins = true where id = $1", [free]), /kept by Toastly/);
  await assert.rejects(me(sade, "update plan_config set extra_gist_coins_ngn = 1"));
  await assert.rejects(me(sade, "select _charge_extra_gist($1, $2, 1)", [free, sade]));
});

// --- 6. Refunds --------------------------------------------------------------------

test("a refunded coin pack removes its unspent coins; spent ones go to staff, never cash", async () => {
  const { db, one, member, buyPack } = await setup();
  const id = await member("Refund Rita");
  const pack = await buyPack(id, "ng-30");
  assert.equal((await one("select payment_refund('paystack', $1, $2) as r", [pack.ref, pack.amount])).r, "refunded");
  assert.equal((await db.query("select purchased_balance($1) as b", [id])).rows[0].b, 0);
  assert.equal((await db.query("select status from payments where provider_ref = $1", [pack.ref])).rows[0].status, "refunded");
  assert.equal((await db.query("select count(*)::int as n from review_items where subject_id = $1 and kind = 'refund'", [id])).rows[0].n, 0,
    "nothing spent: no case");
  assert.equal((await one("select payment_refund('paystack', $1, $2) as r", [pack.ref, pack.amount])).r, "duplicate");
  assert.equal((await one("select payment_settle('paystack', $1, $2, 'NGN', 'NG', 'card') as s", [pack.ref, pack.amount])).s, "refunded",
    "a late success for a refunded payment grants nothing");

  // 40 bought, 35 spent on Premium, then the 30-coin pack is refunded: the
  // 5 left go, and staff hear about the 25 already spent.
  const spender = await member("Spender Sam");
  const p2 = await buyPack(spender, "ng-30");
  await buyPack(spender, "ng-10");
  assert.equal((await as(db, spender, (tx) => tx.query("select subscribe_with_coins('premium') as r"))).rows[0].r.paid, true);
  const before = (await db.query("select purchased_balance($1) as b", [spender])).rows[0].b;
  assert.equal(before, 5);
  assert.equal((await one("select payment_refund('paystack', $1, $2) as r", [p2.ref, p2.amount])).r, "refunded");
  assert.equal((await db.query("select purchased_balance($1) as b", [spender])).rows[0].b, 0, "never below zero");
  const f = (await db.query("select coins_due, coins_removed, coins_short from payment_refunds r join payments p on p.id = r.payment_id where p.provider_ref = $1", [p2.ref])).rows[0];
  assert.deepEqual(f, { coins_due: 30, coins_removed: before, coins_short: 30 - before });
  const item = (await db.query("select kind, source_table from review_items where subject_id = $1 and kind = 'refund'", [spender])).rows[0];
  assert.deepEqual(item, { kind: "refund", source_table: "payment_refunds" });
  const reason = (await db.query("select why from case_events e join review_items i on i.id = e.review_item_id where i.subject_id = $1 and i.kind = 'refund'", [spender])).rows[0].why;
  assert.match(reason, /were already spent/);
  // No ledger row ever pays anything out: the only refund rows are removals.
  assert.equal((await db.query("select count(*)::int as n from coin_ledger where kind = 'refund' and delta > 0")).rows[0].n, 0);
});

test("a refunded plan ends now; a still-renewing subscription and a partial refund go to staff", async () => {
  const { db, one, member, ref } = await setup();
  const id = await member("Plan Peju");
  const r = ref();
  await one("select payment_open($1, 'premium', 'pass', $2) as o", [id, r]);
  await one("select payment_settle('paystack', $1, 350000, 'NGN', 'NG', 'card') as s", [r]);
  assert.equal((await db.query("select current_tier($1) as t", [id])).rows[0].t, "premium");
  assert.equal((await one("select payment_refund('paystack', $1, 350000) as r", [r])).r, "refunded");
  assert.equal((await db.query("select current_tier($1) as t", [id])).rows[0].t, "starter", "the refunded plan has ended");

  // A renewing card plan: the plan ends here, and staff decide whether to stop the subscription.
  const sub = await member("Sub Segun");
  const r2 = ref();
  await one("select payment_open($1, 'premium', 'recurring', $2, null, 'CUS_1') as o", [sub, r2]);
  await one("select payment_settle('paystack', $1, 350000, 'NGN', 'NG', 'card', 'CUS_1', 'SUB_1', now() + interval '30 days') as s", [r2]);
  await one("select subscription_sync('paystack', 'SUB_1', 'CUS_1', 'premium', 'active', now() + interval '30 days', null, $1) as s", [sub]);
  assert.equal((await one("select payment_refund('paystack', $1, 350000) as r", [r2])).r, "refunded");
  assert.equal((await db.query("select current_tier($1) as t", [sub])).rows[0].t, "starter");
  assert.equal((await db.query("select count(*)::int as n from review_items where subject_id = $1 and kind = 'refund'", [sub])).rows[0].n, 1);

  // Partial: nothing changes automatically.
  const part = await member("Part Pelumi");
  const r3 = ref();
  await one("select payment_open($1, 'premium', 'pass', $2) as o", [part, r3]);
  await one("select payment_settle('paystack', $1, 350000, 'NGN', 'NG', 'card') as s", [r3]);
  assert.equal((await one("select payment_refund('paystack', $1, 100000) as r", [r3])).r, "partial");
  assert.equal((await db.query("select current_tier($1) as t", [part])).rows[0].t, "premium");
  assert.equal((await db.query("select status from payments where provider_ref = $1", [r3])).rows[0].status, "succeeded");
  assert.equal((await db.query("select count(*)::int as n from review_items where subject_id = $1 and kind = 'refund'", [part])).rows[0].n, 1);
  assert.equal((await one("select payment_refund('paystack', 'never-opened', 1) as r")).r, "unknown");
});

test("coins held towards a refunded coins-plus-card plan come back as coins", async () => {
  const { db, one, member, buyPack, ref } = await setup();
  const id = await member("Hybrid Halima");
  await buyPack(id, "ng-10");
  const r = ref();
  const o = (await one("select payment_open($1, 'premium', 'remainder', $2) as o", [id, r])).o;
  assert.equal(o.hold_coins, 10);
  await one("select payment_settle('paystack', $1, $2, 'NGN', 'NG', 'card') as s", [r, o.amount_minor]);
  assert.equal((await db.query("select purchased_balance($1) as b", [id])).rows[0].b, 0);
  assert.equal((await one("select payment_refund('paystack', $1, $2) as r", [r, o.amount_minor])).r, "refunded");
  assert.equal((await db.query("select current_tier($1) as t", [id])).rows[0].t, "starter");
  assert.equal((await db.query("select purchased_balance($1) as b", [id])).rows[0].b, 10);
});

test("members can't call the refund function or read refund records", async () => {
  const { db, me, member } = await setup();
  const id = await member("Curious Kemi");
  await assert.rejects(me(id, "select payment_refund('paystack', 'x', 1)"));
  await assert.rejects(me(id, "select * from payment_refunds"));
  await assert.rejects(me(id, "select _correct_gender($1, 'woman')", [id]));
});

// --- 8. Correcting gender ---------------------------------------------------------

test("a reviewer corrects gender on a 'Not who they say they are' report, which ends the women's offer", async () => {
  const { db, me, member } = await setup();
  const staff = await member("Staff Sope");
  await db.query("insert into staff_members (profile_id) values ($1)", [staff]);
  const asStaff = (sql, params) => me(staff, sql, params);

  const subject = await member("Subject Uche", { gender: "woman", phoneHash: "phash-subject" });
  const offer = async () =>
    (await db.query("select count(*)::int as n from entitlements where profile_id = $1 and source = 'womens_launch_offer' and ends_at > now()", [subject])).rows[0].n;
  assert.equal(await offer(), 1, "the offer was granted at go-live");

  const reporter = await member("Reporter Ronke");
  await me(reporter, "insert into reports (reporter_id, reported_id, reason) values ($1, $2, 'harassment')", [reporter, subject]);
  await me(reporter, "insert into reports (reporter_id, reported_id, reason) values ($1, $2, 'fake_profile')", [reporter, subject]);
  const items = (await db.query(`select i.id, r.reason from review_items i join reports r on r.id = i.source_id where i.subject_id = $1`, [subject])).rows;
  const harassment = items.find((x) => x.reason === "harassment").id;
  const fake = items.find((x) => x.reason === "fake_profile").id;

  const actions = async (id) => (await asStaff("select staff_item($1) -> 'actions' as a", [id])).rows[0].a;
  assert.ok(!(await actions(harassment)).some((a) => a.startsWith("correct_gender")), "only on 'Not who they say they are'");
  assert.deepEqual((await actions(fake)).filter((a) => a.startsWith("correct_gender")), ["correct_gender:man"],
    "one action per option, never the current gender");

  // Never automatic: the report alone changed nothing.
  assert.equal((await db.query("select gender from profiles where id = $1", [subject])).rows[0].gender, "woman");
  await assert.rejects(asStaff("select staff_decide($1, 'correct_gender:man', 'short')", [fake]), /reason/);
  await assert.rejects(asStaff("select staff_decide($1, 'correct_gender:robot', 'not on the gender list at all')", [fake]), /isn't available/);
  await assert.rejects(me(reporter, "select staff_decide($1, 'correct_gender:man', 'not staff, should be refused')", [fake]));

  await asStaff("select staff_decide($1, 'correct_gender:man', 'video Gist and ID show a man')", [fake]);
  assert.equal((await db.query("select gender from profiles where id = $1", [subject])).rows[0].gender, "man");
  assert.equal(await offer(), 0, "the women's offer has ended");
  assert.equal((await db.query("select current_tier($1) as t", [subject])).rows[0].t, "starter");
  const closed = (await db.query("select stage, decision from review_items where id = $1", [fake])).rows[0];
  assert.deepEqual(closed, { stage: "decided", decision: "correct_gender:man" });
  const audit = (await db.query("select action, note from staff_audit_log where review_item_id = $1", [fake])).rows[0];
  assert.deepEqual(audit, { action: "correct_gender:man", note: "video Gist and ID show a man" });
  const event = (await db.query("select what from case_events where review_item_id = $1 and is_decision", [fake])).rows[0].what;
  assert.equal(event, "Correct gender to Man");
  // The phone's grant stays: the offer can't come back.
  assert.equal((await db.query("select count(*)::int as n from launch_offer_grants where phone_hash = $1", ["phash-subject"])).rows[0].n, 1);
  // The member still can't change it back themselves.
  await assert.rejects(me(subject, "update profiles set gender = 'woman' where id = $1", [subject]), /Toastly Help/);
});


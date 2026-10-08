/**
 * Launch blockers decided 8 October 2026 (migrations 0037, 0038) — against a
 * throwaway Postgres (PGlite) with every migration applied. Never production.
 *
 *   node --test scripts/sql-test/launch-blockers.test.mjs
 *
 *   - An extra Gist bought with coins, only at the limit, only while priced.
 *   - Refunds: a refunded plan ends; unspent coins are removed; spent ones go
 *     to staff; nothing is ever paid out.
 *   - A reviewer corrects gender on a "Not who they say they are" report,
 *     which ends the women's launch offer. Never automatic.
 *   - The waitlist: anyone can join; nobody can read it back.
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

test("an extra Gist: not on sale until priced, then bought with coins only at the limit", async () => {
  const { db, me, member, useGist, room, balances, buyPack } = await setup();
  const starter = await member("Starter Sade");
  const other = await member("Other Obi");
  const third = await member("Third Tunde");

  const buy = () => me(starter, "select buy_extra_gist() as r").then((x) => x.rows[0].r);

  // While the price is unset, nothing is on sale.
  assert.equal((await db.query("select extra_gist_coins from plan_config")).rows[0].extra_gist_coins, null);
  await assert.rejects(buy(), /aren't available yet/);

  await db.query("update plan_config set extra_gist_coins = 5");
  await assert.rejects(buy(), /still have a Gist/, "not before this month's free one is used");

  await useGist(starter, other);
  assert.equal(await room(starter), false);

  // Short of coins: nothing is spent and the shortfall is named.
  const short = await buy();
  assert.equal(short.paid, false);
  assert.equal(short.shortfall_coins, 5);

  // Gift coins first, then bought ones.
  await buyPack(starter, "ng-10");
  await db.query("select grant_promo_coins($1, 3, 'welcome')", [starter]);
  const paid = await buy();
  assert.equal(paid.paid, true);
  assert.deepEqual(await balances(starter), { bought: 8, promo: 0 });
  assert.equal(await room(starter), true, "the extra Gist makes room");
  assert.equal((await db.query("select voice_gist_allowance($1) as a", [starter])).rows[0].a, 2);
  await assert.rejects(buy(), /still have a Gist/, "one at a time — never bought ahead");

  // The extra one is used like the free one.
  await useGist(starter, third);
  assert.equal(await room(starter), false);
  const ledger = (await db.query("select sum(delta)::int as d from coin_ledger where profile_id = $1 and kind = 'gist_top_up'", [starter])).rows[0].d;
  assert.equal(ledger, -5);
});

test("an extra Gist: paid plans, members not live, and direct writes are refused", async () => {
  const { db, me, member } = await setup();
  await db.query("update plan_config set extra_gist_coins = 5");
  const paid = await member("Premium Pat");
  await db.query("insert into entitlements (profile_id, tier, source, ends_at) values ($1, 'premium', 'subscription', now() + interval '30 days')", [paid]);
  await assert.rejects(me(paid, "select buy_extra_gist()"), /already has unlimited Gists/);

  const notLive = await member("Not Live Nneka", { live: false });
  await assert.rejects(me(notLive, "select buy_extra_gist()"));

  const s = await member("Starter Sola");
  await assert.rejects(me(s, "insert into gist_extras (profile_id, coins, txn_id) values ($1, 5, gen_random_uuid())", [s]));
  await assert.rejects(me(s, "update plan_config set extra_gist_coins = 1"));
  await assert.rejects(as(db, null, (tx) => tx.query("select buy_extra_gist()")));
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

// --- 9. The waitlist (0037) -------------------------------------------------------

test("anyone can join the waitlist once per email; nobody can read it back", async () => {
  const { db, me, member } = await setup();
  const anon = (sql, params) => as(db, null, (tx) => tx.query(sql, params));
  await anon("select join_waitlist('Ada@Example.com', 'Lagos', 'woman')");
  await anon("select join_waitlist('ada@example.com', 'Abuja', 'woman')");
  const rows = (await db.query("select email, city, gender from waitlist")).rows;
  assert.deepEqual(rows, [{ email: "ada@example.com", city: "Abuja", gender: "woman" }], "one row per email, latest city");

  await assert.rejects(anon("select join_waitlist('not-an-email', 'Lagos', 'woman')"));
  await assert.rejects(anon("select join_waitlist('b@example.com', 'Lagos', 'robot')"));
  await assert.rejects(anon("select join_waitlist('c@example.com', 'L', 'man')"));
  await assert.rejects(anon("select * from waitlist"));
  await assert.rejects(anon("insert into waitlist (email, city, gender) values ('d@example.com', 'Lagos', 'man')"));
  const id = await member("Member Mo");
  await assert.rejects(me(id, "select * from waitlist"));
  await assert.rejects(me(id, "delete from waitlist"));
});

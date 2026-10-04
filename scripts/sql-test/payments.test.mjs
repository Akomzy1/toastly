/**
 * Live payments (migration 0024) — tested against a throwaway Postgres
 * (PGlite) with every migration applied. Never production, never a provider.
 *
 *   node --test scripts/sql-test/payments.test.mjs
 *
 * The webhooks and checkout actions call these functions as the service
 * role; members must not be able to call them at all.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { freshDb, as, asService, makeUser } from "./harness.mjs";

let db;
before(async () => {
  db = await freshDb();
});

const member = (name = "Pay Test") => makeUser(db, { name, email: `${crypto.randomUUID()}@example.com` });
const ref = () => `tst_${crypto.randomUUID()}`;
const svc = (sql, params) => asService(db, (tx) => tx.query(sql, params));
const one = async (sql, params) => (await svc(sql, params)).rows[0];

const open = (profile, sku, mode, r, ip = null, customer = null) =>
  one("select payment_open($1, $2, $3, $4, $5, $6) as o", [profile, sku, mode, r, ip, customer]).then((x) => x.o);
const settle = (provider, r, amount, currency, country = "NG", customer = null, sub = null, periodEnd = null) =>
  one("select payment_settle($1, $2, $3, $4, $5, 'card', $6, $7, $8) as s", [provider, r, amount, currency, country, customer, sub, periodEnd]).then((x) => x.s);

const bal = async (id) => (await db.query("select coin_balance($1) as b", [id])).rows[0].b;
const tier = async (id) => (await db.query("select current_tier($1) as t", [id])).rows[0].t;
const paidUntil = async (id, t) =>
  (await db.query("select max(ends_at) as e from entitlements where profile_id = $1 and tier = $2 and source = 'subscription'", [id, t])).rows[0].e;
const days = (d) => (d.getTime() - Date.now()) / 86_400_000;

async function coins(id, n) {
  const r = ref();
  const sku = n === 10 ? "ng-10" : "ng-30";
  const o = await open(id, sku, "pack", r);
  assert.equal(await settle("paystack", r, o.amount_minor, "NGN"), "granted");
}

test("members and anonymous callers can read prices but can't write them or call any payment function", async () => {
  const id = await member();
  const prices = await as(db, id, (tx) => tx.query("select sku, amount_minor from price_list order by sku"));
  assert.equal(prices.rows.length, 7);
  assert.equal(prices.rows.find((p) => p.sku === "premium").amount_minor, 350000);
  await assert.rejects(as(db, id, (tx) => tx.query("update price_list set amount_minor = 1 where sku = 'premium'")));
  for (const sql of [
    ["select payment_open($1, 'ng-30', 'pack', 'tst_member_ref_1')", [id]],
    ["select payment_settle('paystack', 'x', 1, 'NGN')", []],
    ["select payment_fail('paystack', 'x')", []],
    ["select payment_record_renewal('paystack', 'x', 'c', 's', 'premium', 1, 'NGN')", []],
    ["select subscription_sync('paystack', 's', 'c', 'premium', 'active')", []],
    ["select payment_release_stale()", []],
    ["insert into payments (profile_id, provider, provider_ref, amount_minor, currency, purpose) values ($1, 'paystack', 'x', 1, 'NGN', 'x')", [id]],
  ]) {
    await assert.rejects(as(db, id, (tx) => tx.query(sql[0], sql[1])), `member could run: ${sql[0]}`);
  }
});

test("a coin pack credits purchased coins exactly once", async () => {
  const id = await member();
  const r = ref();
  const o = await open(id, "ng-30", "pack", r);
  assert.equal(o.amount_minor, 270000);
  assert.equal(await settle("paystack", r, 270000, "NGN"), "granted");
  assert.equal(await settle("paystack", r, 270000, "NGN"), "duplicate");
  assert.equal(await bal(id), 30);
  assert.equal((await db.query("select purchased_balance($1) as b", [id])).rows[0].b, 30, "bought coins are stakeable");
});

test("a payment for the wrong amount or currency grants nothing", async () => {
  const id = await member();
  const r = ref();
  await open(id, "ng-10", "pack", r);
  assert.equal(await settle("paystack", r, 100, "NGN"), "mismatch");
  assert.equal(await settle("paystack", r, 100000, "USD"), "mismatch");
  assert.equal(await bal(id), 0);
  assert.equal(await settle("paystack", "never-opened", 100000, "NGN"), "unknown");
});

test("a 30-day pass grants the plan, and a second pass extends it", async () => {
  const id = await member();
  const r1 = ref();
  await open(id, "premium", "pass", r1);
  assert.equal(await settle("paystack", r1, 350000, "NGN"), "granted");
  assert.equal(await tier(id), "premium");
  assert.ok(Math.abs(days(await paidUntil(id, "premium")) - 30) < 0.1);
  const r2 = ref();
  await open(id, "premium", "pass", r2);
  await settle("paystack", r2, 350000, "NGN");
  assert.ok(Math.abs(days(await paidUntil(id, "premium")) - 60) < 0.1, "extends from the current end");
});

test("coins part-pay a plan: held at checkout, the card pays the rest", async () => {
  const id = await member();
  await coins(id, 10);
  await coins(id, 10);
  const r = ref();
  const o = await open(id, "premium", "remainder", r);
  assert.equal(o.hold_coins, 20);
  assert.equal(o.amount_minor, (35 - 20) * 100 * 100, "₦1,500 for the 15 coins short");
  assert.equal(await bal(id), 0, "the coins are held");
  assert.equal(await settle("paystack", r, o.amount_minor, "NGN"), "granted");
  assert.equal(await tier(id), "premium");
  assert.equal(await bal(id), 0, "the held coins are spent");
});

test("a failed part-payment gives every held coin back", async () => {
  const id = await member();
  await coins(id, 10);
  const r = ref();
  await open(id, "premium_plus", "remainder", r);
  assert.equal(await bal(id), 0);
  assert.equal(await one("select payment_fail('paystack', $1) as f", [r]).then((x) => x.f), "failed");
  assert.equal(await bal(id), 10);
  assert.equal(await tier(id), "starter");
});

test("an abandoned part-payment is released after an hour; a late success re-takes the coins or credits coins", async () => {
  // Coins still there: the late payment re-takes them and grants the plan.
  const a = await member();
  await coins(a, 30);
  const ra = ref();
  const oa = await open(a, "premium", "remainder", ra);
  await db.query("update payments set created_at = now() - interval '2 hours' where provider_ref = $1", [ra]);
  assert.equal(await one("select payment_release_stale() as n").then((x) => x.n), 1);
  assert.equal(await bal(a), 30, "released");
  assert.equal(await settle("paystack", ra, oa.amount_minor, "NGN"), "granted");
  assert.equal(await tier(a), "premium");
  assert.equal(await bal(a), 0);

  // Coins gone by then: the money paid becomes coins, never a plan nobody paid for.
  const b = await member();
  await coins(b, 30);
  const rb = ref();
  const ob = await open(b, "premium", "remainder", rb);
  await db.query("update payments set created_at = now() - interval '2 hours' where provider_ref = $1", [rb]);
  await one("select payment_release_stale() as n");
  await db.query("insert into coin_ledger (profile_id, delta, kind, bucket) values ($1, -30, 'gist_top_up', 'purchased')", [b]);
  assert.equal(await settle("paystack", rb, ob.amount_minor, "NGN"), "credited_as_coins");
  assert.equal(await bal(b), 5, "₦500 paid = 5 coins");
  assert.equal(await tier(b), "starter");
});

test("part-payment is refused when coins already cover the plan, or there are none", async () => {
  const rich = await member();
  await coins(rich, 30);
  await coins(rich, 10);
  await assert.rejects(open(rich, "premium", "remainder", ref()), /coins cover it/);
  const broke = await member();
  await assert.rejects(open(broke, "premium", "remainder", ref()), /no coins/);
  await assert.rejects(open(rich, "diaspora", "remainder", ref()), /isn't available/, "never a diaspora plan");
});

test("modes are checked: no passes or part-payments on Stripe, no packs as plans", async () => {
  const id = await member();
  await assert.rejects(open(id, "diaspora", "pass", ref()));
  await assert.rejects(open(id, "ng-30", "recurring", ref()));
  await assert.rejects(open(id, "premium", "pack", ref()));
  await assert.rejects(open(id, "nope", "pack", ref()));
  const o = await open(id, "diaspora", "recurring", ref());
  assert.equal(o.provider, "stripe");
  assert.equal(o.amount_minor, 1500);
});

test("a renewing card plan: first charge, subscription, then a renewal we didn't start", async () => {
  const id = await member();
  const r = ref();
  const end1 = new Date(Date.now() + 30 * 86_400_000).toISOString();
  await open(id, "premium_plus", "recurring", r, "NG", "CUS_test1");
  assert.equal(await settle("paystack", r, 700000, "NGN", "NG", "CUS_test1", null, end1), "granted");
  assert.equal(await tier(id), "premium_plus");
  assert.ok(Math.abs(days(await paidUntil(id, "premium_plus")) - 31) < 0.1, "period end plus a day's grace");

  assert.equal(
    await one("select subscription_sync('paystack', 'SUB_1', 'CUS_test1', 'premium_plus', 'active', $1, 'tok_secret') as s", [end1]).then((x) => x.s),
    "ok",
  );
  const end2 = new Date(Date.now() + 60 * 86_400_000).toISOString();
  const renewal = await one(
    "select payment_record_renewal('paystack', 'renew_1', 'CUS_test1', 'SUB_1', 'premium_plus', 700000, 'NGN', 'NG', 'card', $1) as s",
    [end2],
  );
  assert.equal(renewal.s, "granted");
  assert.ok(Math.abs(days(await paidUntil(id, "premium_plus")) - 61) < 0.1);
  assert.equal(
    await one("select payment_record_renewal('paystack', 'renew_x', 'CUS_nobody', null, 'premium', 350000, 'NGN') as s").then((x) => x.s),
    "unknown",
  );

  // The member sees their subscription, but never the token that stops it.
  const mine = await as(db, id, (tx) => tx.query("select tier, status from subscriptions"));
  assert.deepEqual(mine.rows, [{ tier: "premium_plus", status: "active" }]);
  await assert.rejects(as(db, id, (tx) => tx.query("select provider_token from subscriptions")));
  const other = await member();
  assert.equal((await as(db, other, (tx) => tx.query("select id from subscriptions"))).rows.length, 0);
});

test("pricing integrity: foreign card or request country on a Naira payment goes to review, never a block", async () => {
  const id = await member();
  const r1 = ref();
  await open(id, "ng-10", "pack", r1, "GB");
  assert.equal(await settle("paystack", r1, 100000, "NGN", "GB"), "granted", "the payment still goes through");
  const r2 = ref();
  await open(id, "ng-10", "pack", r2);
  await settle("paystack", r2, 100000, "NGN", "US");
  const reviews = await svc("select signal, status from integrity_reviews where profile_id = $1 ", [id]);
  assert.deepEqual(reviews.rows.map((x) => x.signal).sort(), ["ip_country_mismatch", "payment_geography_mismatch"]);
  const events = await svc("select kind from trust_events where profile_id = $1 and kind in ('payment_geography_mismatch', 'ip_country_mismatch')", [id]);
  assert.equal(events.rows.length, 3, "every mismatch is an event; the queue holds one open review per signal");
  assert.equal(await bal(id), 20);
  assert.equal(await tier(id), "starter");

  // Dollars on a Nigerian card is not arbitrage.
  const d = await member();
  const r3 = ref();
  await open(d, "us-30", "pack", r3, "NG");
  await settle("stripe", r3, 600, "USD", "NG");
  assert.equal((await svc("select count(*)::int as n from integrity_reviews where profile_id = $1", [d])).rows[0].n, 0);
});

test("coins are never cash: no function pays out, and the ledger stays append-only", async () => {
  const fns = await svc("select proname from pg_proc where pronamespace = 'public'::regnamespace and proname ~ '(withdraw|payout|cash_?out|transfer|send_coins)' and proname not in ('withdrawable_balance', '_date_payout')");
  assert.deepEqual(fns.rows, []);
  const id = await member();
  await coins(id, 10);
  await assert.rejects(db.query("update coin_ledger set delta = 1000 where profile_id = $1", [id]));
});

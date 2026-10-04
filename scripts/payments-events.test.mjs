/**
 * Provider events → database calls (lib/payments/events.ts), with a fake
 * database that records each call. No provider, no network, no database.
 *
 *   node --test scripts/payments-events.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { handlePaystackEvent, handleStripeEvent, stripeStatus } from "../lib/payments/events.ts";

function fakeDb(results = {}) {
  const calls = [];
  return {
    calls,
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      const r = results[fn];
      const data = typeof r === "function" ? r(args, calls) : r ?? "ok";
      return { data, error: null };
    },
  };
}

const paystackDeps = { tierForPlan: async (code) => ({ PLN_p: "premium", PLN_pp: "premium_plus" })[code] ?? null };

test("Paystack charge.success settles our reference with the card country and channel", async () => {
  const db = fakeDb({ payment_settle: "granted" });
  const out = await handlePaystackEvent(
    {
      event: "charge.success",
      data: { reference: "tly_1", amount: 270000, currency: "NGN", channel: "card", authorization: { country_code: "GB" }, customer: { customer_code: "CUS_1" }, plan: {} },
    },
    db,
    paystackDeps,
  );
  assert.deepEqual(out, { status: "granted", provider: "paystack", ref: "tly_1" });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0], {
    fn: "payment_settle",
    args: { p_provider: "paystack", p_ref: "tly_1", p_amount_minor: 270000, p_currency: "NGN", p_card_country: "GB", p_channel: "card", p_customer: "CUS_1", p_subscription: null, p_period_end: null },
  });
});

test("Paystack renewal (a reference we never opened, on a plan) is recorded as a renewal", async () => {
  const db = fakeDb({ payment_settle: "unknown", payment_record_renewal: "granted" });
  const out = await handlePaystackEvent(
    { event: "charge.success", data: { reference: "T123", amount: 700000, currency: "NGN", customer: { customer_code: "CUS_9" }, plan: { plan_code: "PLN_pp" } } },
    db,
    paystackDeps,
  );
  assert.equal(out.status, "granted");
  assert.equal(db.calls[1].fn, "payment_record_renewal");
  assert.equal(db.calls[1].args.p_tier, "premium_plus");
  assert.equal(db.calls[1].args.p_customer, "CUS_9");
});

test("Paystack: an unknown reference with no plan grants nothing", async () => {
  const db = fakeDb({ payment_settle: "unknown" });
  const out = await handlePaystackEvent({ event: "charge.success", data: { reference: "x", amount: 1, currency: "NGN", plan: {} } }, db, paystackDeps);
  assert.equal(out.status, "unknown");
  assert.equal(db.calls.length, 1);
});

test("Paystack subscription events keep the subscription in step", async () => {
  const cases = [
    ["subscription.create", "active"],
    ["subscription.not_renew", "non_renewing"],
    ["subscription.disable", "ended"],
  ];
  for (const [event, status] of cases) {
    const db = fakeDb();
    await handlePaystackEvent(
      { event, data: { subscription_code: "SUB_1", email_token: "tok", next_payment_date: "2026-11-04T00:00:00.000Z", plan: { plan_code: "PLN_p" }, customer: { customer_code: "CUS_1" } } },
      db,
      paystackDeps,
    );
    assert.equal(db.calls[0].fn, "subscription_sync");
    assert.equal(db.calls[0].args.p_status, status, event);
    assert.equal(db.calls[0].args.p_tier, "premium");
    assert.equal(db.calls[0].args.p_token, "tok");
  }
  const failed = fakeDb();
  await handlePaystackEvent(
    { event: "invoice.payment_failed", data: { subscription: { subscription_code: "SUB_1", plan: { plan_code: "PLN_p" } }, customer: { customer_code: "CUS_1" } } },
    failed,
    paystackDeps,
  );
  assert.equal(failed.calls[0].args.p_status, "past_due");
});

test("Paystack: charge.failed releases the payment; unrelated events do nothing", async () => {
  const db = fakeDb({ payment_fail: "failed" });
  assert.equal((await handlePaystackEvent({ event: "charge.failed", data: { reference: "tly_2" } }, db, paystackDeps)).status, "failed");
  const quiet = fakeDb();
  assert.equal((await handlePaystackEvent({ event: "transfer.success", data: {} }, quiet, paystackDeps)).status, "ignored");
  assert.equal(quiet.calls.length, 0);
});

const sub = (over = {}) => ({ id: "sub_1", status: "active", cancel_at_period_end: false, current_period_end: 1793750400, customer: "cus_1", metadata: { profile_id: "p1", tier: "diaspora" }, ...over });

test("Stripe checkout: a coin pack settles; a subscription settles and is synced with its period end", async () => {
  const pack = fakeDb({ payment_settle: "granted" });
  const deps = { subscription: async () => sub() };
  const out = await handleStripeEvent(
    { type: "checkout.session.completed", data: { object: { id: "cs_1", mode: "payment", payment_status: "paid", client_reference_id: "tly_3", amount_total: 600, currency: "usd", customer: null, metadata: { profile_id: "p1" } } } },
    pack,
    deps,
  );
  assert.deepEqual(out, { status: "granted", provider: "stripe", ref: "tly_3" });
  assert.equal(pack.calls.length, 1);

  const plan = fakeDb({ payment_settle: "granted" });
  await handleStripeEvent(
    { type: "checkout.session.completed", data: { object: { id: "cs_2", mode: "subscription", payment_status: "paid", client_reference_id: "tly_4", amount_total: 1500, currency: "usd", customer: "cus_1", subscription: "sub_1", metadata: { profile_id: "p1" } } } },
    plan,
    deps,
  );
  assert.equal(plan.calls[0].args.p_period_end, new Date(1793750400 * 1000).toISOString());
  assert.equal(plan.calls[1].fn, "subscription_sync");
  assert.equal(plan.calls[1].args.p_profile, "p1");
  assert.equal(plan.calls[1].args.p_tier, "diaspora");
});

test("Stripe: unpaid sessions grant nothing; the first invoice is left to checkout; renewals are recorded", async () => {
  const deps = { subscription: async () => sub() };
  const unpaid = fakeDb();
  await handleStripeEvent({ type: "checkout.session.completed", data: { object: { id: "cs", payment_status: "unpaid", client_reference_id: "r", amount_total: 1, currency: "usd" } } }, unpaid, deps);
  assert.equal(unpaid.calls.length, 0);

  const first = fakeDb();
  await handleStripeEvent({ type: "invoice.paid", data: { object: { id: "in_1", billing_reason: "subscription_create", subscription: "sub_1", amount_paid: 1500, currency: "usd" } } }, first, deps);
  assert.equal(first.calls.length, 0);

  const renew = fakeDb({ payment_record_renewal: "granted" });
  await handleStripeEvent(
    { type: "invoice.paid", data: { object: { id: "in_2", billing_reason: "subscription_cycle", subscription: "sub_1", customer: "cus_1", amount_paid: 3000, currency: "usd", subscription_details: { metadata: { tier: "diaspora_plus" } }, lines: { data: [{ period: { end: 1796428800 } }] } } } },
    renew,
    deps,
  );
  assert.equal(renew.calls[0].fn, "payment_record_renewal");
  assert.equal(renew.calls[0].args.p_ref, "in_2");
  assert.equal(renew.calls[0].args.p_tier, "diaspora_plus");
  assert.equal(renew.calls[0].args.p_period_end, new Date(1796428800 * 1000).toISOString());
});

test("Stripe subscription status maps to ours", () => {
  assert.equal(stripeStatus({ status: "active", cancel_at_period_end: false }), "active");
  assert.equal(stripeStatus({ status: "active", cancel_at_period_end: true }), "non_renewing");
  assert.equal(stripeStatus({ status: "past_due", cancel_at_period_end: false }), "past_due");
  assert.equal(stripeStatus({ status: "canceled", cancel_at_period_end: false }), "ended");
});

test("Stripe: a deleted subscription ends; a missing tier is ignored rather than guessed", async () => {
  const db = fakeDb();
  await handleStripeEvent({ type: "customer.subscription.deleted", data: { object: sub() } }, db, { subscription: async () => sub() });
  assert.equal(db.calls[0].args.p_status, "ended");
  const none = fakeDb();
  await handleStripeEvent({ type: "customer.subscription.updated", data: { object: sub({ metadata: {} }) } }, none, { subscription: async () => sub() });
  assert.equal(none.calls.length, 0);
});

test("a database error propagates, so the webhook answers 500 and the provider retries", async () => {
  const db = { rpc: async () => ({ data: null, error: { message: "boom" } }) };
  await assert.rejects(
    handlePaystackEvent({ event: "charge.success", data: { reference: "r", amount: 1, currency: "NGN" } }, db, paystackDeps),
    /payment_settle: boom/,
  );
});

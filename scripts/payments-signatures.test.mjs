/**
 * Webhook signature checks and the live-key guard (lib/payments/*.ts), with
 * throwaway secrets. No network, no database.
 *
 *   node --test scripts/payments-signatures.test.mjs
 *
 * Node runs the TypeScript directly (type stripping); a tiny resolve hook
 * maps the extensionless relative imports Next uses ("./config") to .ts.
 */
import { register } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

register(
  "data:text/javascript," +
    encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec.startsWith(".") && !/\\.[a-z]+$/.test(spec)) {
    try { return await next(spec + ".ts", ctx); } catch {}
  }
  return next(spec, ctx);
}`),
);

const PAYSTACK_TEST = "sk_test_signature_check_only";
const STRIPE_WHSEC = "whsec_signature_check_only";
process.env.PAYSTACK_SECRET_KEY = PAYSTACK_TEST;
process.env.STRIPE_WEBHOOK_SECRET = STRIPE_WHSEC;
delete process.env.VERCEL_ENV;

const { verifyPaystackSignature } = await import("../lib/payments/paystack.ts");
const { verifyStripeSignature } = await import("../lib/payments/stripe.ts");
const config = await import("../lib/payments/config.ts");

const body = JSON.stringify({ event: "charge.success", data: { reference: "tly_x", amount: 100000, currency: "NGN" } });

test("Paystack: the right HMAC-SHA512 passes; a wrong or missing one fails", () => {
  const good = createHmac("sha512", PAYSTACK_TEST).update(body).digest("hex");
  assert.equal(verifyPaystackSignature(body, good), true);
  assert.equal(verifyPaystackSignature(body + " ", good), false, "a changed body fails");
  assert.equal(verifyPaystackSignature(body, createHmac("sha512", "sk_test_other").update(body).digest("hex")), false);
  assert.equal(verifyPaystackSignature(body, ""), false);
});

test("Stripe: a fresh, correct v1 passes; stale, wrong or rolled signatures behave", () => {
  const now = Math.floor(Date.now() / 1000);
  const sig = (t, secret = STRIPE_WHSEC) => createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  assert.equal(verifyStripeSignature(body, `t=${now},v1=${sig(now)}`), true);
  assert.equal(verifyStripeSignature(body, `t=${now - 600},v1=${sig(now - 600)}`), false, "older than five minutes");
  assert.equal(verifyStripeSignature(body, `t=${now},v1=${sig(now, "whsec_other")}`), false);
  assert.equal(verifyStripeSignature(body, `t=${now},v1=${sig(now, "whsec_old")},v1=${sig(now)}`), true, "any v1 during a secret roll");
  assert.equal(verifyStripeSignature(body, ""), false);
});

test("live keys are refused outside production, and honoured in it", () => {
  process.env.PAYSTACK_SECRET_KEY = "sk_live_pretend";
  process.env.STRIPE_SECRET_KEY = "sk_live_pretend";
  assert.equal(config.paystackSecret(), null);
  assert.equal(config.stripeSecret(), null);
  assert.match(config.paymentsOffReason("paystack"), /production/);
  process.env.VERCEL_ENV = "preview";
  assert.equal(config.paystackSecret(), null, "previews are not production");
  process.env.VERCEL_ENV = "production";
  assert.equal(config.paystackSecret(), "sk_live_pretend");
  process.env.PAYSTACK_SECRET_KEY = "  sk_test_padded  ";
  delete process.env.VERCEL_ENV;
  assert.equal(config.paystackSecret(), "sk_test_padded", "test keys work anywhere, trimmed");
});

test("references are unique and recognisable", () => {
  const a = config.newReference();
  const b = config.newReference();
  assert.match(a, /^tly_[0-9a-f]{32}$/);
  assert.notEqual(a, b);
});

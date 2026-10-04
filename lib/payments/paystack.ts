import { createHmac, timingSafeEqual } from "node:crypto";
import { paystackSecret } from "./config";

/**
 * Paystack (NGN) — a small REST client. Server only.
 *
 * Checkout is Paystack's hosted page: we initialize a transaction with an
 * amount the database set, send the member to authorization_url, and learn
 * the result from the signed webhook (or a server-side verify on return).
 */

const API = "https://api.paystack.co";

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const key = paystackSecret();
  if (!key) throw new Error("Paystack isn't configured.");
  const res = await fetch(`${API}${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: T };
  if (!res.ok || json.status === false) throw new Error(`Paystack: ${json.message ?? res.status}`);
  return json.data as T;
}

/** Verify the x-paystack-signature header (HMAC-SHA512 of the raw body). */
export function verifyPaystackSignature(raw: string, signature: string): boolean {
  const key = paystackSecret();
  if (!key) return false;
  const expected = createHmac("sha512", key).update(raw).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// --- Plans: monthly card subscriptions for Premium and Premium Plus ---------

type Plan = { plan_code: string; name: string; amount: number; interval: string; currency: string };

const PLAN_NAMES: Record<"premium" | "premium_plus", string> = {
  premium: "Toastly Premium",
  premium_plus: "Toastly Premium Plus",
};

const planCache = new Map<string, string>();

/**
 * The plan code for a tier at this price, creating the plan on first use, so
 * nothing has to be set up by hand in the dashboard. A price change creates
 * a new plan; existing subscribers stay on theirs.
 */
export async function paystackPlanCode(tier: "premium" | "premium_plus", amountKobo: number): Promise<string> {
  const cacheKey = `${tier}:${amountKobo}`;
  const cached = planCache.get(cacheKey);
  if (cached) return cached;
  const plans = await call<Plan[]>("/plan?perPage=100");
  let plan = plans.find(
    (p) => p.name === PLAN_NAMES[tier] && p.amount === amountKobo && p.interval === "monthly" && p.currency === "NGN",
  );
  if (!plan) {
    plan = await call<Plan>("/plan", {
      method: "POST",
      body: { name: PLAN_NAMES[tier], interval: "monthly", amount: amountKobo, currency: "NGN" },
    });
  }
  planCache.set(cacheKey, plan.plan_code);
  return plan.plan_code;
}

/** Which tier a Paystack plan code is, for renewals Paystack starts itself. */
export async function paystackTierForPlan(planCode: string): Promise<"premium" | "premium_plus" | null> {
  const plan = await call<Plan>(`/plan/${encodeURIComponent(planCode)}`).catch(() => null);
  if (!plan) return null;
  if (plan.name === PLAN_NAMES.premium_plus) return "premium_plus";
  if (plan.name === PLAN_NAMES.premium) return "premium";
  return null;
}

/** The customer code for an email (Paystack returns the existing customer). */
export async function paystackCustomer(email: string): Promise<string> {
  const c = await call<{ customer_code: string }>("/customer", { method: "POST", body: { email } });
  return c.customer_code;
}

// --- Transactions ------------------------------------------------------------

/** Card, bank and USSD channels a one-off payment may use. */
const ONE_OFF_CHANNELS = ["card", "bank", "ussd", "bank_transfer", "qr"];
/** Bank and USSD only: the 30-day pass for members who don't pay by card. */
const PASS_CHANNELS = ["bank", "ussd", "bank_transfer", "qr"];

export async function paystackInitialize(args: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  mode: "pack" | "pass" | "recurring" | "remainder";
  planCode?: string;
  metadata: Record<string, string>;
}): Promise<string> {
  const body: Record<string, unknown> = {
    email: args.email,
    amount: args.amountKobo,
    currency: "NGN",
    reference: args.reference,
    callback_url: args.callbackUrl,
    metadata: { ...args.metadata, cancel_action: args.callbackUrl.replace(/\?.*$/, "") },
  };
  if (args.mode === "recurring") {
    // A plan makes Paystack keep the card and bill it monthly (cards only).
    body.plan = args.planCode;
    body.channels = ["card"];
  } else {
    body.channels = args.mode === "pass" ? PASS_CHANNELS : ONE_OFF_CHANNELS;
  }
  const data = await call<{ authorization_url: string }>("/transaction/initialize", { method: "POST", body });
  return data.authorization_url;
}

export type PaystackCharge = {
  reference: string;
  status: string;
  amount: number;
  currency: string;
  channel?: string;
  authorization?: { country_code?: string | null } | null;
  customer?: { customer_code?: string; email?: string } | null;
  plan?: { plan_code?: string } | string | null;
};

/** Server-to-Paystack check of a transaction (used on the return page). */
export function paystackVerify(reference: string): Promise<PaystackCharge> {
  return call<PaystackCharge>(`/transaction/verify/${encodeURIComponent(reference)}`);
}

/** Stop a subscription renewing (the member keeps the period they paid for). */
export async function paystackDisable(code: string, token: string): Promise<void> {
  await call("/subscription/disable", { method: "POST", body: { code, token } });
}

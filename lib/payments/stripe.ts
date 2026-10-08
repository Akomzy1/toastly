import { createHmac, timingSafeEqual } from "node:crypto";
import { stripeSecret, stripeWebhookSecret } from "./config";

/**
 * Stripe (USD) — a small REST client. Server only.
 *
 * Checkout is Stripe's hosted page (card and Apple Pay). The API version is
 * pinned so the shapes read below (current_period_end on a subscription,
 * lines on an invoice) don't move under us.
 */

const API = "https://api.stripe.com/v1";
const VERSION = "2024-06-20";

/** Stripe's form encoding, including nested objects and arrays. */
function form(obj: Record<string, unknown>, prefix = "", out = new URLSearchParams()): URLSearchParams {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === "object" ? form(item as Record<string, unknown>, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(item))));
    else if (typeof v === "object") form(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function call<T>(path: string, init?: { method?: string; body?: Record<string, unknown> }): Promise<T> {
  const key = stripeSecret();
  if (!key) throw new Error("Stripe isn't configured.");
  const res = await fetch(`${API}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      "Stripe-Version": VERSION,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: init?.body ? form(init.body).toString() : undefined,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Stripe: ${json.error?.message ?? res.status}`);
  return json;
}

const TOLERANCE_SECONDS = 300;

/** Verify the Stripe-Signature header: t=, v1= HMAC-SHA256 of "t.body". */
export function verifyStripeSignature(raw: string, header: string): boolean {
  const secret = stripeWebhookSecret();
  if (!secret) return false;
  const parts = header.split(",").map((p) => p.split("=") as [string, string]);
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  if (!t || Math.abs(Date.now() / 1000 - t) > TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex"));
  // Stripe may send several v1 signatures while a secret is being rolled.
  return parts
    .filter(([k]) => k === "v1")
    .some(([, v]) => {
      const got = Buffer.from(v ?? "");
      return got.length === expected.length && timingSafeEqual(got, expected);
    });
}

// --- Prices for the diaspora plans ---------------------------------------------

const LOOKUP: Record<"diaspora" | "diaspora_plus", { key: string; name: string }> = {
  diaspora: { key: "toastly_diaspora_monthly", name: "Toastly Diaspora" },
  diaspora_plus: { key: "toastly_diaspora_plus_monthly", name: "Toastly Diaspora Plus" },
};

const priceCache = new Map<string, string>();

/**
 * The monthly price for a diaspora tier at this amount, created on first use
 * (looked up by lookup_key) so nothing is set up by hand in the dashboard.
 */
export async function stripePriceId(tier: "diaspora" | "diaspora_plus", amountCents: number): Promise<string> {
  const { key, name } = LOOKUP[tier];
  const cached = priceCache.get(`${key}:${amountCents}`);
  if (cached) return cached;
  const list = await call<{ data: { id: string; unit_amount: number }[] }>(
    `/prices?active=true&lookup_keys[0]=${key}`,
  );
  let id = list.data.find((p) => p.unit_amount === amountCents)?.id;
  if (!id) {
    const created = await call<{ id: string }>("/prices", {
      method: "POST",
      body: {
        currency: "usd",
        unit_amount: amountCents,
        recurring: { interval: "month" },
        product_data: { name },
        lookup_key: key,
        // A new amount takes the lookup key over from the old price.
        transfer_lookup_key: true,
        metadata: { tier },
      },
    });
    id = created.id;
  }
  priceCache.set(`${key}:${amountCents}`, id);
  return id;
}

// --- Checkout ------------------------------------------------------------------

export async function stripeCheckout(args: {
  mode: "pack" | "recurring";
  reference: string;
  profileId: string;
  email: string | null;
  customer: string | null;
  amountCents: number;
  label: string;
  tier: "diaspora" | "diaspora_plus" | null;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const base: Record<string, unknown> = {
    client_reference_id: args.reference,
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    metadata: { ref: args.reference, profile_id: args.profileId },
  };
  if (args.customer) base.customer = args.customer;
  else if (args.email) base.customer_email = args.email;

  const body: Record<string, unknown> =
    args.mode === "recurring" && args.tier
      ? {
          ...base,
          mode: "subscription",
          line_items: [{ price: await stripePriceId(args.tier, args.amountCents), quantity: 1 }],
          subscription_data: { metadata: { profile_id: args.profileId, tier: args.tier } },
        }
      : {
          ...base,
          mode: "payment",
          line_items: [
            {
              quantity: 1,
              price_data: { currency: "usd", unit_amount: args.amountCents, product_data: { name: `Toastly · ${args.label}` } },
            },
          ],
        };
  const session = await call<{ url: string }>("/checkout/sessions", { method: "POST", body });
  return session.url;
}

export type StripeSession = {
  id: string;
  mode: "payment" | "subscription";
  payment_status: string;
  client_reference_id: string | null;
  customer: string | null;
  subscription: string | null;
  amount_total: number | null;
  currency: string | null;
  metadata?: Record<string, string> | null;
};

export type StripeSubscription = {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: number;
  customer: string;
  metadata?: Record<string, string> | null;
};

export function stripeSession(id: string): Promise<StripeSession> {
  return call<StripeSession>(`/checkout/sessions/${encodeURIComponent(id)}`);
}

export function stripeSubscription(id: string): Promise<StripeSubscription> {
  return call<StripeSubscription>(`/subscriptions/${encodeURIComponent(id)}`);
}

type CardDetails = { payment_method_details?: { card?: { country?: string | null } | null } | null } | null;
const countryOf = (c: CardDetails | string | undefined) => (c && typeof c === "object" ? c.payment_method_details?.card?.country ?? null : null);

/**
 * The issuing country of the card that paid: from the charge, the payment
 * intent's latest charge, or the invoice's charge. Two letters or null.
 */
export async function stripeCardCountry(from: { charge?: string | null; paymentIntent?: string | null; invoice?: string | null }): Promise<string | null> {
  if (from.charge) return countryOf(await call<CardDetails>(`/charges/${encodeURIComponent(from.charge)}`));
  if (from.paymentIntent) {
    const pi = await call<{ latest_charge?: CardDetails | string }>(
      `/payment_intents/${encodeURIComponent(from.paymentIntent)}?expand[]=latest_charge`,
    );
    return countryOf(pi.latest_charge);
  }
  if (from.invoice) {
    const inv = await call<{ charge?: CardDetails | string }>(`/invoices/${encodeURIComponent(from.invoice)}?expand[]=charge`);
    return countryOf(inv.charge);
  }
  return null;
}

/**
 * Our payment reference for a refunded charge. A first subscription invoice
 * was settled under the checkout's reference; a renewal under the invoice id;
 * a one-off payment under the checkout's reference.
 */
export async function stripeRefundRef(charge: { paymentIntent?: string | null; invoice?: string | null }): Promise<string | null> {
  if (charge.invoice) {
    const inv = await call<{ id: string; billing_reason?: string; subscription?: string | null }>(
      `/invoices/${encodeURIComponent(charge.invoice)}`,
    );
    if (inv.billing_reason !== "subscription_create" || !inv.subscription) return inv.id;
    const list = await call<{ data: { client_reference_id: string | null }[] }>(
      `/checkout/sessions?limit=1&subscription=${encodeURIComponent(inv.subscription)}`,
    );
    return list.data[0]?.client_reference_id ?? null;
  }
  if (charge.paymentIntent) {
    const list = await call<{ data: { client_reference_id: string | null }[] }>(
      `/checkout/sessions?limit=1&payment_intent=${encodeURIComponent(charge.paymentIntent)}`,
    );
    return list.data[0]?.client_reference_id ?? null;
  }
  return null;
}

/** Stop a subscription renewing; the member keeps the period they paid for. */
export async function stripeCancelAtPeriodEnd(id: string): Promise<void> {
  await call(`/subscriptions/${encodeURIComponent(id)}`, { method: "POST", body: { cancel_at_period_end: true } });
}

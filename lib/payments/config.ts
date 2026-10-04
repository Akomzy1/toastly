/**
 * Payment configuration — server only.
 *
 * LIVE-KEY GUARD. Live keys charge real cards. They are honoured only on the
 * production deployment (VERCEL_ENV=production); anywhere else — a laptop, a
 * preview deployment — a live key reads as "not configured", so testing can
 * never take real money by accident. Use test keys (sk_test_…) locally and
 * on previews.
 */

export type Provider = "paystack" | "stripe";

function isProduction() {
  return process.env.VERCEL_ENV === "production";
}

function guarded(value: string | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  if (/^(sk|pk|rk)_live_/.test(v) && !isProduction()) return null;
  return v;
}

export function paystackSecret(): string | null {
  return guarded(process.env.PAYSTACK_SECRET_KEY);
}

export function stripeSecret(): string | null {
  return guarded(process.env.STRIPE_SECRET_KEY);
}

export function stripeWebhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}

export function paymentsConfigured(provider: Provider): boolean {
  return provider === "paystack" ? Boolean(paystackSecret()) : Boolean(stripeSecret());
}

/** Why a provider is off, for the in-app notice. Never echoes a key. */
export function paymentsOffReason(provider: Provider): string {
  const raw = provider === "paystack" ? process.env.PAYSTACK_SECRET_KEY : process.env.STRIPE_SECRET_KEY;
  if (raw && /^(sk|rk)_live_/.test(raw.trim()) && !isProduction()) return "live keys only work on the production site";
  return "it isn't set up in this environment";
}

/** Where a provider sends the member back to. */
export function siteUrl(): string {
  // A preview deployment returns to itself, not to production.
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/** Our payment references: recognisable in a provider dashboard, unguessable. */
export function newReference(): string {
  return `tly_${crypto.randomUUID().replace(/-/g, "")}`;
}

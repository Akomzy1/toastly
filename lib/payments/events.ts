/**
 * Provider events → database. Shared by the signed webhooks and the
 * return-page verification (a server-to-provider fetch, never the browser's
 * word). Every database call is idempotent, so the webhook and the return
 * page can both report the same payment and it is granted once.
 *
 * Pure apart from the injected `db` and lookups, so it is tested without a
 * provider or a database (scripts/payments-events.test.mjs).
 */

export type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
export type Db = { rpc: Rpc };

export type Outcome = { status: string; provider: "paystack" | "stripe"; ref?: string };

async function rpc(db: Db, fn: string, args: Record<string, unknown>): Promise<string> {
  const { data, error } = await db.rpc(fn, args);
  // Throwing makes the webhook answer 500, so the provider retries.
  if (error) throw new Error(`${fn}: ${error.message}`);
  return String(data);
}

const iso = (unixSeconds?: number | null) => (unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null);
const isoDate = (s?: string | null) => (s ? new Date(s).toISOString() : null);

// --- Paystack ------------------------------------------------------------------

type PaystackTier = "premium" | "premium_plus";

export type PaystackDeps = { tierForPlan: (planCode: string) => Promise<PaystackTier | null> };

function planCode(plan: unknown): string | null {
  if (!plan) return null;
  if (typeof plan === "string") return plan || null;
  return (plan as { plan_code?: string }).plan_code || null;
}

type PaystackData = {
  reference?: string;
  amount?: number;
  currency?: string;
  channel?: string;
  authorization?: { country_code?: string | null } | null;
  customer?: { customer_code?: string } | null;
  plan?: unknown;
  subscription_code?: string;
  email_token?: string;
  next_payment_date?: string | null;
  subscription?: { subscription_code?: string; email_token?: string; next_payment_date?: string | null; plan?: unknown } | null;
};

export async function handlePaystackEvent(
  event: { event: string; data: PaystackData },
  db: Db,
  deps: PaystackDeps,
): Promise<Outcome> {
  const d = event.data ?? {};
  const customer = d.customer?.customer_code ?? null;

  switch (event.event) {
    case "charge.success": {
      if (!d.reference || typeof d.amount !== "number" || !d.currency) return { status: "ignored", provider: "paystack" };
      const args = {
        p_provider: "paystack",
        p_ref: d.reference,
        p_amount_minor: d.amount,
        p_currency: d.currency,
        p_card_country: d.authorization?.country_code ?? null,
        p_channel: d.channel ?? null,
        p_customer: customer,
      };
      let status = await rpc(db, "payment_settle", { ...args, p_subscription: null, p_period_end: null });
      // A renewal Paystack billed itself: a reference we never opened, on a plan.
      const code = planCode(d.plan);
      if (status === "unknown" && code && customer) {
        const tier = await deps.tierForPlan(code);
        if (tier) {
          status = await rpc(db, "payment_record_renewal", {
            p_provider: "paystack",
            p_ref: d.reference,
            p_customer: customer,
            p_subscription: null,
            p_tier: tier,
            p_amount_minor: d.amount,
            p_currency: d.currency,
            p_card_country: args.p_card_country,
            p_channel: args.p_channel,
            p_period_end: null,
          });
        }
      }
      return { status, provider: "paystack", ref: d.reference };
    }

    case "charge.failed": {
      if (!d.reference) return { status: "ignored", provider: "paystack" };
      return { status: await rpc(db, "payment_fail", { p_provider: "paystack", p_ref: d.reference }), provider: "paystack", ref: d.reference };
    }

    case "subscription.create":
    case "subscription.not_renew":
    case "subscription.disable":
    case "invoice.payment_failed":
    case "invoice.update": {
      const sub = event.event.startsWith("invoice.") ? d.subscription ?? {} : d;
      const subCode = sub.subscription_code;
      const code = planCode(sub.plan) ?? planCode(d.plan);
      if (!subCode || !code) return { status: "ignored", provider: "paystack" };
      const tier = await deps.tierForPlan(code);
      if (!tier) return { status: "ignored", provider: "paystack" };
      const status =
        event.event === "subscription.create" ? "active"
        : event.event === "subscription.not_renew" ? "non_renewing"
        : event.event === "subscription.disable" ? "ended"
        : event.event === "invoice.payment_failed" ? "past_due"
        : "active";
      // invoice.update fires on a successful renewal too; it only refreshes state.
      if (event.event === "invoice.update" && (d as { paid?: boolean }).paid !== true) return { status: "ignored", provider: "paystack" };
      const result = await rpc(db, "subscription_sync", {
        p_provider: "paystack",
        p_subscription: subCode,
        p_customer: customer,
        p_tier: tier,
        p_status: status,
        p_period_end: isoDate(sub.next_payment_date ?? null),
        p_token: sub.email_token ?? null,
        p_profile: null,
      });
      return { status: result, provider: "paystack" };
    }

    default:
      return { status: "ignored", provider: "paystack" };
  }
}

// --- Stripe --------------------------------------------------------------------

type DiasporaTier = "diaspora" | "diaspora_plus";

export type StripeSub = {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: number;
  customer: string;
  metadata?: Record<string, string> | null;
};

export type StripeDeps = { subscription: (id: string) => Promise<StripeSub> };

export function stripeStatus(sub: Pick<StripeSub, "status" | "cancel_at_period_end">): "active" | "non_renewing" | "past_due" | "ended" {
  if (sub.status === "canceled" || sub.status === "incomplete_expired") return "ended";
  if (sub.status === "past_due" || sub.status === "unpaid" || sub.status === "incomplete") return "past_due";
  return sub.cancel_at_period_end ? "non_renewing" : "active";
}

const tierOf = (m?: Record<string, string> | null): DiasporaTier | null =>
  m?.tier === "diaspora" || m?.tier === "diaspora_plus" ? m.tier : null;

async function syncStripeSub(db: Db, sub: StripeSub, status: string, profile: string | null): Promise<string> {
  const tier = tierOf(sub.metadata);
  if (!tier) return "ignored";
  return rpc(db, "subscription_sync", {
    p_provider: "stripe",
    p_subscription: sub.id,
    p_customer: sub.customer,
    p_tier: tier,
    p_status: status,
    p_period_end: iso(sub.current_period_end),
    p_token: null,
    p_profile: profile,
  });
}

type StripeObject = Record<string, unknown> & {
  id: string;
  mode?: string;
  payment_status?: string;
  client_reference_id?: string | null;
  customer?: string | null;
  subscription?: string | null;
  amount_total?: number | null;
  amount_paid?: number | null;
  currency?: string | null;
  billing_reason?: string;
  metadata?: Record<string, string> | null;
  subscription_details?: { metadata?: Record<string, string> | null } | null;
  lines?: { data?: { period?: { end?: number } }[] };
  status?: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
};

export async function handleStripeEvent(
  event: { type: string; data: { object: StripeObject } },
  db: Db,
  deps: StripeDeps,
): Promise<Outcome> {
  const o = event.data?.object;
  if (!o) return { status: "ignored", provider: "stripe" };

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const ref = o.client_reference_id;
      if (!ref || o.payment_status !== "paid" || typeof o.amount_total !== "number" || !o.currency) {
        return { status: "ignored", provider: "stripe" };
      }
      const sub = o.mode === "subscription" && o.subscription ? await deps.subscription(o.subscription) : null;
      const status = await rpc(db, "payment_settle", {
        p_provider: "stripe",
        p_ref: ref,
        p_amount_minor: o.amount_total,
        p_currency: o.currency,
        p_card_country: null,
        p_channel: "card",
        p_customer: o.customer ?? null,
        p_subscription: o.subscription ?? null,
        p_period_end: sub ? iso(sub.current_period_end) : null,
      });
      if (sub) await syncStripeSub(db, sub, stripeStatus(sub), o.metadata?.profile_id ?? null);
      return { status, provider: "stripe", ref };
    }

    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      if (!o.client_reference_id) return { status: "ignored", provider: "stripe" };
      return {
        status: await rpc(db, "payment_fail", { p_provider: "stripe", p_ref: o.client_reference_id }),
        provider: "stripe",
        ref: o.client_reference_id,
      };
    }

    case "invoice.paid": {
      // The first invoice is settled by checkout.session.completed.
      if (o.billing_reason === "subscription_create" || !o.subscription || typeof o.amount_paid !== "number" || !o.currency) {
        return { status: "ignored", provider: "stripe" };
      }
      if (o.amount_paid === 0) return { status: "ignored", provider: "stripe" };
      let tier = tierOf(o.subscription_details?.metadata);
      if (!tier) tier = tierOf((await deps.subscription(o.subscription)).metadata);
      if (!tier) return { status: "ignored", provider: "stripe" };
      const status = await rpc(db, "payment_record_renewal", {
        p_provider: "stripe",
        p_ref: o.id,
        p_customer: o.customer ?? null,
        p_subscription: o.subscription,
        p_tier: tier,
        p_amount_minor: o.amount_paid,
        p_currency: o.currency,
        p_card_country: null,
        p_channel: "card",
        p_period_end: iso(o.lines?.data?.[0]?.period?.end ?? null),
      });
      return { status, provider: "stripe", ref: o.id };
    }

    case "invoice.payment_failed": {
      if (!o.subscription) return { status: "ignored", provider: "stripe" };
      const sub = await deps.subscription(o.subscription);
      return { status: await syncStripeSub(db, sub, "past_due", null), provider: "stripe" };
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = o as unknown as StripeSub;
      const status = event.type === "customer.subscription.deleted" ? "ended" : stripeStatus(sub);
      return { status: await syncStripeSub(db, sub, status, sub.metadata?.profile_id ?? null), provider: "stripe" };
    }

    default:
      return { status: "ignored", provider: "stripe" };
  }
}

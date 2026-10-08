import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireLiveProfile, notLiveError } from "@/lib/live-profile";
import { paymentsOpenFor, PAYMENTS_CLOSED } from "@/lib/launch";
import { newReference, paymentsConfigured, paymentsOffReason, siteUrl } from "./config";
import { paystackCustomer, paystackInitialize, paystackPlanCode } from "./paystack";
import { stripeCheckout } from "./stripe";

/**
 * Start a hosted checkout. Returns the provider's URL to send the member to.
 *
 * The member chooses WHAT (a sku) and HOW (a mode); the database decides how
 * much (payment_open reads price_list and holds any coins). No amount from
 * the browser is ever read.
 */

export type Mode = "pack" | "pass" | "recurring" | "remainder";

export type CheckoutResult = { url: string } | { error: string };

type Opened = { payment_id: string; amount_minor: number; currency: "NGN" | "USD"; hold_coins: number; label: string; provider: "paystack" | "stripe" };

/** How a member chose to pay a coin pack. Stripe shows card and Apple Pay together. */
export type Method = "card" | "bank" | "apple" | null;

export async function startCheckout(sku: string, mode: Mode, method: Method = null): Promise<CheckoutResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  // Nobody pays before going live (PRD §7.3; the database refuses too, 0035),
  // and nobody pays before launch unless they're on the allow-list.
  const live = await requireLiveProfile(supabase);
  if (!live.live) return { error: notLiveError(live) };
  if (!(await paymentsOpenFor(supabase, user))) return { error: PAYMENTS_CLOSED };

  const { data: price } = await supabase.from("price_list").select("sku, kind, provider, tier").eq("sku", sku).eq("active", true).maybeSingle();
  if (!price) return { error: "That isn't something you can buy." };
  const provider = price.provider as "paystack" | "stripe";
  if (!paymentsConfigured(provider)) {
    return { error: `${provider === "paystack" ? "Paystack" : "Stripe"} isn't connected yet — ${paymentsOffReason(provider)}.` };
  }

  const admin = createAdminClient();
  if (!admin) return { error: "Payments aren't available right now." };

  const email = user.email ?? null;
  if (provider === "paystack" && !email) return { error: "Add an email address to your account to pay in Naira." };

  // A light country check at payment only (PRD §7): Vercel's request country,
  // two letters, never the IP address itself.
  const ipCountry = headers().get("x-vercel-ip-country");
  const ref = newReference();
  const back = price.kind === "coin_pack" ? "/coins/get" : "/profile/plan";

  let customer: string | null = null;
  try {
    if (provider === "paystack" && mode === "recurring") customer = await paystackCustomer(email!);
    if (provider === "stripe") {
      const { data: prior } = await admin
        .from("subscriptions")
        .select("provider_customer_id")
        .eq("profile_id", user.id)
        .eq("provider", "stripe")
        .not("provider_customer_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      customer = prior?.provider_customer_id ?? null;
    }
  } catch (e) {
    return { error: (e as Error).message };
  }

  const { data, error } = await admin.rpc("payment_open", {
    p_profile: user.id,
    p_sku: sku,
    p_mode: mode,
    p_ref: ref,
    p_ip_country: ipCountry,
    p_customer: customer,
  });
  if (error) return { error: error.message };
  const opened = data as Opened;

  try {
    if (provider === "paystack") {
      const url = await paystackInitialize({
        email: email!,
        amountKobo: opened.amount_minor,
        reference: ref,
        callbackUrl: `${siteUrl()}/api/payments/paystack/return?next=${encodeURIComponent(back)}`,
        mode,
        method: mode === "pack" && (method === "card" || method === "bank") ? method : null,
        planCode:
          mode === "recurring" ? await paystackPlanCode(price.tier as "premium" | "premium_plus", opened.amount_minor) : undefined,
        metadata: { profile_id: user.id, payment_id: opened.payment_id },
      });
      return { url };
    }
    const url = await stripeCheckout({
      mode: mode === "recurring" ? "recurring" : "pack",
      reference: ref,
      profileId: user.id,
      email,
      customer,
      amountCents: opened.amount_minor,
      label: opened.label,
      tier: mode === "recurring" ? (price.tier as "diaspora" | "diaspora_plus") : null,
      successUrl: `${siteUrl()}/api/payments/stripe/return?session_id={CHECKOUT_SESSION_ID}&next=${encodeURIComponent(back)}`,
      cancelUrl: `${siteUrl()}${back}?paid=cancelled`,
    });
    return { url };
  } catch (e) {
    // The provider refused: release any coins held for this checkout.
    await admin.rpc("payment_fail", { p_provider: provider, p_ref: ref });
    return { error: `We couldn't start the payment. ${(e as Error).message}` };
  }
}

/** Where a return page may send the member: our own pages only. */
export function safeNext(next: string | null): string {
  return next === "/coins" || next === "/coins/get" || next === "/profile/plan" ? next : "/profile/plan";
}

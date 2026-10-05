"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { coinsOpen, COINS_HELD, PACKS, PLANS, type PlanKey } from "@/lib/coins";

/**
 * Buying coins and paying a naira plan with them (PRD §5.5, Prompt 17).
 *
 * ALWAYS OPEN to the member whatever their live status: buying coins or a
 * plan is never paused for profile reasons (decided 2026-10-05).
 *
 * Paystack and Stripe aren't connected (GO-LIVE.md), so a real charge
 * can't happen yet. In development a stand-in credits what a confirmed
 * charge would; in production the action says payments aren't connected.
 * The coins only ever move through the database's own functions.
 */
export type CoinState = { error?: string; ok?: string; coins?: number } | null;

async function signedIn() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function buyCoins(_prev: CoinState, formData: FormData): Promise<CoinState> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };
  if (!coinsOpen()) return { error: COINS_HELD };

  // The currency follows where the member lives, never their choice.
  const { data: me } = await supabase.from("profiles").select("country_code").eq("id", user.id).single();
  const currency = me?.country_code === "NG" ? "NGN" : "USD";
  const pack = PACKS[currency].find((p) => p.id === formData.get("pack"));
  if (!pack) return { error: "Choose a pack." };
  if (!formData.get("method")) return { error: "Choose how to pay." };

  const admin = createAdminClient();
  if (process.env.NODE_ENV === "production" || !admin) {
    return { error: "Payments aren't connected yet, so coins can't be bought." };
  }
  // Development stand-in for the payment webhook's confirmed charge.
  const { error } = await admin.rpc("credit_coin_purchase", { p_profile_id: user.id, p_coins: pack.coins, p_payment: null });
  if (error) return { error: "Your coins couldn't be added. Try again." };
  revalidatePath("/coins");
  revalidatePath("/coins/get");
  return { ok: "added", coins: pack.coins };
}

export async function payPlanWithCoins(_prev: CoinState, formData: FormData): Promise<CoinState> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };
  if (!coinsOpen()) return { error: COINS_HELD };

  const plan = String(formData.get("plan")) as PlanKey;
  if (!(plan in PLANS)) return { error: "Choose a plan." };
  // Enforced in the database too (coin_checkout_quote refuses Diaspora).
  if (plan === "diaspora") return { error: "Coins can be used on Naira plans." };

  const { data: quote, error: qErr } = await supabase.rpc("coin_checkout_quote", { p_tier: plan });
  if (qErr || !quote) return { error: "Your checkout couldn't be prepared. Try again." };
  const left = (quote as { naira_left: number }).naira_left;

  if (left > 0) {
    if (!formData.get("method")) return { error: "Choose how to pay the rest." };
    if (process.env.NODE_ENV === "production") {
      return { error: "Payments aren't connected yet, so the rest can't be paid." };
    }
  }
  // In development a part-coin checkout stands in for Paystack's
  // confirmation of the remainder.
  const { error } = await supabase.rpc("pay_plan_with_coins", {
    p_tier: plan,
    p_paid_reference: left > 0 ? "development-stand-in" : null,
  });
  if (error) return { error: "Your plan couldn't be started. Try again." };
  revalidatePath("/coins");
  return { ok: "paid" };
}

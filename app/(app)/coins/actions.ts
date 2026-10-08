"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireLiveProfile, notLiveError } from "@/lib/live-profile";
import { paymentsOpenFor, PAYMENTS_CLOSED } from "@/lib/launch";

export type CoinPayState = { ok?: string; error?: string; shortfallCoins?: number; shortfallNaira?: number } | null;

/**
 * Pay Premium or Premium Plus with coins (0023, subscribe_with_coins). Coins
 * apply first; if they don't cover it, nothing is spent and the shortfall is
 * shown — the card payment for the rest needs Paystack, which isn't
 * connected yet. Diaspora plans are refused by the database, not just here.
 */
export async function payWithCoins(_prev: CoinPayState, formData: FormData): Promise<CoinPayState> {
  const tier = String(formData.get("tier") ?? "");
  if (tier !== "premium" && tier !== "premium_plus") return { error: "Coins can pay for Premium and Premium Plus only." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };
  const live = await requireLiveProfile(supabase);
  if (!live.live) return { error: notLiveError(live) };
  if (!(await paymentsOpenFor(supabase, user))) return { error: PAYMENTS_CLOSED };

  const { data, error } = await supabase.rpc("subscribe_with_coins", { p_tier: tier });
  if (error) return { error: error.message };
  const r = data as { paid: boolean; until?: string; shortfall_coins?: number; shortfall_naira?: number };
  revalidatePath("/coins");
  if (r.paid) {
    const until = r.until ? new Date(r.until).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) : "";
    return { ok: `${tier === "premium" ? "Premium" : "Premium Plus"} is on${until ? ` until ${until}` : ""}.` };
  }
  return { shortfallCoins: r.shortfall_coins, shortfallNaira: r.shortfall_naira };
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireLiveProfile, notLiveError } from "@/lib/live-profile";
import { startCheckout, type Method, type Mode } from "@/lib/payments/checkout";
import { stopRenewal as stopAtProvider } from "@/lib/payments/stop-renewal";

export type PlanState = { ok?: string; error?: string } | null;

const MODES: Mode[] = ["pack", "pass", "recurring", "remainder"];

/** Send the member to Paystack's or Stripe's hosted checkout. */
export async function checkout(_prev: PlanState, formData: FormData): Promise<PlanState> {
  // Nobody pays before going live (PRD §7.3). Stopping a renewal never needs it.
  const live = await requireLiveProfile(createClient());
  if (!live.live) return { error: notLiveError(live) };
  const sku = String(formData.get("sku") ?? "");
  const mode = String(formData.get("mode") ?? "") as Mode;
  if (!MODES.includes(mode)) return { error: "Choose how to pay." };
  const m = String(formData.get("method") ?? "");
  const method: Method = m === "card" || m === "bank" || m === "apple" ? m : null;
  const result = await startCheckout(sku, mode, method);
  if ("error" in result) return { error: result.error };
  redirect(result.url);
}

/**
 * Stop a card plan renewing. The member keeps what they've paid for until
 * the period ends; nothing is refunded or taken early. No phone call, as the
 * Pricing page promises.
 */
export async function stopRenewal(_prev: PlanState, formData: FormData): Promise<PlanState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  // Row-level security confirms it's theirs before the service role is used.
  const id = String(formData.get("subscription_id") ?? "");
  const { data: mine } = await supabase.from("subscriptions").select("id, provider, tier, status").eq("id", id).maybeSingle();
  if (!mine) return { error: "That plan isn't on your account." };
  if (mine.status !== "active" && mine.status !== "past_due") return { ok: "It's already set not to renew." };

  const admin = createAdminClient();
  if (!admin) return { error: "Plans can't be changed right now. Try again soon." };
  const stopped = await stopAtProvider(admin, { id, provider: mine.provider, tier: mine.tier, profileId: user.id });
  if (stopped.error) return { error: stopped.error };
  revalidatePath("/profile/plan");
  return { ok: "Done. It won't renew, and you keep it until the end of what you've paid for." };
}

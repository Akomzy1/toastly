import type { SupabaseClient } from "@supabase/supabase-js";
import { paystackDisable } from "@/lib/payments/paystack";
import { stripeCancelAtPeriodEnd } from "@/lib/payments/stripe";

/**
 * Stop a card plan renewing at the provider, then record it. The member
 * keeps what they've paid for until the period ends; nothing is refunded or
 * taken early. Used by "Stop renewing" on Your plan, and when a move
 * changes the member's pricing track (the plan then renews on the new
 * country's plans — migration 0027).
 *
 * `admin` is the service-role client; callers confirm ownership first.
 */
export async function stopRenewal(
  admin: SupabaseClient,
  sub: { id: string; provider: "paystack" | "stripe"; tier: string; profileId: string },
): Promise<{ error?: string }> {
  const { data: row } = await admin
    .from("subscriptions")
    .select("provider_subscription_id, provider_token")
    .eq("id", sub.id)
    .maybeSingle();
  if (!row) return { error: "That plan isn't on your account." };

  try {
    if (sub.provider === "stripe") await stripeCancelAtPeriodEnd(row.provider_subscription_id);
    else {
      if (!row.provider_token) return { error: "We couldn't reach Paystack for this plan yet. Try again in a minute." };
      await paystackDisable(row.provider_subscription_id, row.provider_token);
    }
  } catch (e) {
    return { error: `That didn't go through. ${(e as Error).message}` };
  }

  await admin.rpc("subscription_sync", {
    p_provider: sub.provider,
    p_subscription: row.provider_subscription_id,
    p_customer: null,
    p_tier: sub.tier,
    p_status: "non_renewing",
    p_period_end: null,
    p_token: null,
    p_profile: sub.profileId,
  });
  return {};
}

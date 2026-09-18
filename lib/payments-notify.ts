import type { SupabaseClient } from "@supabase/supabase-js";
import { capture } from "@/lib/analytics";
import { sendReceipt } from "@/lib/email";

/**
 * Receipt and funnel events for a successful charge.
 *
 * Called from the payment webhooks, which arrive with no session — hence the
 * service-role client, used here for exactly two reads: the payment row, and
 * the member's email address.
 *
 * THIS PATH IS CURRENTLY INERT, and deliberately so. It looks the payment up
 * by provider reference, and nothing writes payment rows yet: the webhooks
 * verify signatures and grant nothing (still a TODO). Whoever builds the
 * payment loop gets the receipt and the two funnel events for free by
 * inserting the row before this runs — rather than discovering later that
 * neither was ever wired.
 */

function formatAmount(minor: number, currency: string): string {
  const major = minor / 100;
  return currency === "NGN"
    ? `₦${major.toLocaleString("en-NG")}`
    : `$${major.toFixed(2)}`;
}

export async function notifyCharge(
  admin: SupabaseClient | null,
  providerRef: string,
  provider: "paystack" | "stripe",
): Promise<void> {
  if (!admin || !providerRef) return;

  const { data: payment } = await admin
    .from("payments")
    .select("profile_id, amount_minor, currency, purpose, status")
    .eq("provider", provider)
    .eq("provider_ref", providerRef)
    .maybeSingle();

  // No row means the payment loop hasn't recorded it. Sending a receipt for
  // something we have no record of would be worse than sending none.
  if (!payment) return;

  const { data: account } = await admin.auth.admin.getUserById(payment.profile_id);
  const email = account?.user?.email;

  if (email) {
    await sendReceipt(email, {
      amount: formatAmount(payment.amount_minor, payment.currency),
      reference: providerRef,
      item: payment.purpose,
    });
  }

  // First money in. Counted after the row exists, so 1 means this one.
  const { count } = await admin
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", payment.profile_id)
    .eq("status", "succeeded");

  if ((count ?? 0) <= 1) {
    await capture("first_deposit", payment.profile_id, {
      currency: payment.currency,
    });
  }

  // A subscription purchase is the upgrade event; a coin pack is not.
  if (/subscription|premium|diaspora|plus/i.test(payment.purpose)) {
    await capture("upgrade", payment.profile_id, {
      currency: payment.currency,
      purpose: payment.purpose,
    });
  }
}

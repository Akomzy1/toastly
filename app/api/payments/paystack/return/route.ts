import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyCharge } from "@/lib/payments-notify";
import { safeNext } from "@/lib/payments/checkout";
import { paystackTierForPlan, paystackVerify } from "@/lib/payments/paystack";
import { handlePaystackEvent } from "@/lib/payments/events";

/**
 * Where Paystack sends the member after checkout. The reference in the URL
 * is only a pointer: the result comes from Paystack's API, server to server,
 * and settling is idempotent with the webhook (whichever lands first grants).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const reference = url.searchParams.get("reference") ?? url.searchParams.get("trxref");
  const to = (paid: string) => NextResponse.redirect(new URL(`${next}?paid=${paid}`, url.origin));
  if (!reference) return to("cancelled");

  const admin = createAdminClient();
  if (!admin) return to("pending");
  try {
    const charge = await paystackVerify(reference);
    if (charge.status !== "success") return to(charge.status === "abandoned" ? "cancelled" : "pending");
    const outcome = await handlePaystackEvent({ event: "charge.success", data: charge }, admin, { tierForPlan: paystackTierForPlan });
    if (outcome.status === "granted" || outcome.status === "credited_as_coins") await notifyCharge(admin, reference, "paystack");
    return to(outcome.status === "credited_as_coins" ? "coins" : "1");
  } catch {
    // The webhook will still settle it.
    return to("pending");
  }
}

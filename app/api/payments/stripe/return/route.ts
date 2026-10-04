import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyCharge } from "@/lib/payments-notify";
import { safeNext } from "@/lib/payments/checkout";
import { stripeSession, stripeSubscription } from "@/lib/payments/stripe";
import { handleStripeEvent } from "@/lib/payments/events";

/**
 * Where Stripe sends the member after checkout. The session id is only a
 * pointer: the result is fetched from Stripe server to server, and settling
 * is idempotent with the webhook.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const id = url.searchParams.get("session_id");
  const to = (paid: string) => NextResponse.redirect(new URL(`${next}?paid=${paid}`, url.origin));
  if (!id) return to("cancelled");

  const admin = createAdminClient();
  if (!admin) return to("pending");
  try {
    const session = await stripeSession(id);
    if (session.payment_status !== "paid") return to("pending");
    const outcome = await handleStripeEvent(
      { type: "checkout.session.completed", data: { object: session as never } },
      admin,
      { subscription: stripeSubscription },
    );
    if (outcome.ref && outcome.status === "granted") await notifyCharge(admin, outcome.ref, "stripe");
    return to("1");
  } catch {
    return to("pending");
  }
}

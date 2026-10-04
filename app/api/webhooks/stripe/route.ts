import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyCharge } from "@/lib/payments-notify";
import { stripeWebhookSecret } from "@/lib/payments/config";
import { stripeSubscription, verifyStripeSignature } from "@/lib/payments/stripe";
import { handleStripeEvent } from "@/lib/payments/events";

/**
 * Stripe webhook — USD only, for the diaspora track.
 *
 * Verifies the Stripe-Signature header (t= timestamp, v1= HMAC-SHA256 over
 * "timestamp.body") before parsing, with a five-minute tolerance so a
 * captured request can't be replayed later. Every database call is
 * idempotent, so a retried event grants nothing twice.
 *
 * Stripe → Developers → Webhooks → endpoint
 *   https://www.trytoastly.com/api/webhooks/stripe
 * with the events listed in GO-LIVE.md; its signing secret (whsec_…) is
 * STRIPE_WEBHOOK_SECRET.
 */
export async function POST(request: NextRequest) {
  if (!stripeWebhookSecret()) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const raw = await request.text();
  if (!verifyStripeSignature(raw, request.headers.get("stripe-signature") ?? "")) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not configured" }, { status: 503 });

  try {
    const outcome = await handleStripeEvent(JSON.parse(raw), admin, { subscription: stripeSubscription });
    if (outcome.ref && (outcome.status === "granted" || outcome.status === "credited_as_coins")) {
      await notifyCharge(admin, outcome.ref, "stripe");
    }
    return NextResponse.json({ received: true, status: outcome.status });
  } catch (e) {
    console.error("stripe webhook", (e as Error).message);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

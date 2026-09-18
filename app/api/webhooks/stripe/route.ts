import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyCharge } from "@/lib/payments-notify";

/**
 * Stripe webhook — USD only, for the diaspora track.
 *
 * Verifies the Stripe-Signature header (t= timestamp, v1= HMAC-SHA256 over
 * "timestamp.body") before parsing, with a timestamp tolerance so a captured
 * request cannot be replayed later.
 */
const TOLERANCE_SECONDS = 300;

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const raw = await request.text();
  const header = request.headers.get("stripe-signature") ?? "";

  const parts = Object.fromEntries(
    header.split(",").map((p) => p.split("=") as [string, string]),
  );
  const timestamp = Number(parts.t);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > TOLERANCE_SECONDS) {
    return NextResponse.json({ error: "stale" }, { status: 401 });
  }

  const expected = createHmac("sha256", secret)
    .update(`${parts.t}.${raw}`)
    .digest("hex");

  const a = Buffer.from(parts.v1 ?? "");
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  // TODO: record the payment and grant the subscription entitlement. Not
  // implemented — no live credentials in this build.
  //
  // The receipt and funnel events below are real code on an inert path: they
  // resolve the charge by provider reference, and nothing writes payment rows
  // yet. See lib/payments-notify.ts.
  const event = JSON.parse(raw) as {
    type: string;
    data: { object: { id?: string } };
  };

  if (
    event.type === "checkout.session.completed" ||
    event.type === "invoice.paid" ||
    event.type === "payment_intent.succeeded"
  ) {
    await notifyCharge(createAdminClient(), event.data.object.id ?? "", "stripe");
  }

  return NextResponse.json({ received: true });
}

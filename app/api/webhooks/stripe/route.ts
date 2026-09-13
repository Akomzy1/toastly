import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

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
  return NextResponse.json({ received: true });
}

import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Paystack webhook — NGN only.
 *
 * Paystack signs with HMAC-SHA512 over the raw body using the secret key.
 * The signature is verified before the body is parsed, and compared with a
 * timing-safe equality: a plain === leaks information about the expected
 * value through response timing.
 *
 * Entitlement grants happen here rather than on a client redirect, because a
 * redirect can be forged and a webhook cannot.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const raw = await request.text();
  const signature = request.headers.get("x-paystack-signature") ?? "";
  const expected = createHmac("sha512", secret).update(raw).digest("hex");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const event = JSON.parse(raw) as { event: string; data: { reference: string } };

  // Only NGN reaches this endpoint. A USD charge arriving here is a routing
  // bug or an arbitrage attempt; the payments table refuses the pairing.
  switch (event.event) {
    case "charge.success":
      // TODO: record the payment, credit coins or grant the subscription
      // entitlement. Not implemented — no live credentials in this build.
      break;
    default:
      break;
  }

  return NextResponse.json({ received: true });
}

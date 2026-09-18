import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyCharge } from "@/lib/payments-notify";

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

  // A webhook has no session, so resolving a reference to a member needs the
  // service role. Narrow and deliberate: read the payment row, nothing else.
  const admin = createAdminClient();

  // Only NGN reaches this endpoint. A USD charge arriving here is a routing
  // bug or an arbitrage attempt; the payments table refuses the pairing.
  switch (event.event) {
    case "charge.success":
      // TODO: record the payment, credit coins or grant the subscription
      // entitlement. Not implemented — no live credentials in this build.
      //
      // The receipt and the funnel events below are real code on an inert
      // path: they look the payment up by reference, and nothing writes
      // payment rows yet. Whoever builds the payment loop gets both for free
      // by inserting the row before this runs.
      await notifyCharge(admin, event.data.reference, "paystack");
      break;
    default:
      break;
  }

  return NextResponse.json({ received: true });
}

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyCharge } from "@/lib/payments-notify";
import { paystackSecret } from "@/lib/payments/config";
import { paystackTierForPlan, verifyPaystackSignature } from "@/lib/payments/paystack";
import { handlePaystackEvent } from "@/lib/payments/events";

/**
 * Paystack webhook — NGN only.
 *
 * The HMAC-SHA512 signature over the raw body is verified (timing-safe)
 * before the body is parsed. Grants happen here, or on the return page after
 * a server-side verify — never on a browser's word. Every database call is
 * idempotent, so a retried webhook grants nothing twice.
 *
 * Set this URL in Paystack → Settings → API Keys & Webhooks (test and live):
 *   https://www.trytoastly.com/api/webhooks/paystack
 */
export async function POST(request: NextRequest) {
  if (!paystackSecret()) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const raw = await request.text();
  if (!verifyPaystackSignature(raw, request.headers.get("x-paystack-signature") ?? "")) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  // A webhook has no session: the service role resolves a reference to a
  // member, through the payment functions and nothing else.
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not configured" }, { status: 503 });

  try {
    const outcome = await handlePaystackEvent(JSON.parse(raw), admin, { tierForPlan: paystackTierForPlan });
    if (outcome.ref && (outcome.status === "granted" || outcome.status === "credited_as_coins")) {
      await notifyCharge(admin, outcome.ref, "paystack");
    }
    return NextResponse.json({ received: true, status: outcome.status });
  } catch (e) {
    // 500 makes Paystack retry later.
    console.error("paystack webhook", (e as Error).message);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

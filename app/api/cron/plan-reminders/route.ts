import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPlanEnding } from "@/lib/email";
import { TIER_LABELS } from "@/lib/entitlements";
import type { Tier } from "@/lib/types/profile";

/**
 * Daily (vercel.json): email members whose paid plan ends in the next three
 * days and won't renew on its own — a 30-day pass, or a card plan whose
 * renewal they stopped. Once per grant (plan_reminders).
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; anything else is
 * refused.
 */
export const dynamic = "force-dynamic";

function authorised(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const now = new Date();
  const soon = new Date(now.getTime() + 3 * 86_400_000);
  const { data: ending, error } = await admin
    .from("entitlements")
    .select("id, profile_id, tier, ends_at")
    .eq("source", "subscription")
    .gt("ends_at", now.toISOString())
    .lte("ends_at", soon.toISOString());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  for (const e of ending ?? []) {
    const [{ data: done }, { data: later }, { data: renewing }] = await Promise.all([
      admin.from("plan_reminders").select("entitlement_id").eq("entitlement_id", e.id).maybeSingle(),
      // Superseded by a later grant of the same plan (another pass, a renewal).
      admin.from("entitlements").select("id").eq("profile_id", e.profile_id).eq("tier", e.tier).gt("ends_at", e.ends_at).limit(1),
      admin.from("subscriptions").select("id").eq("profile_id", e.profile_id).eq("tier", e.tier).in("status", ["active", "past_due"]).limit(1),
    ]);
    if (done || later?.length || renewing?.length) continue;

    const { data: account } = await admin.auth.admin.getUserById(e.profile_id);
    const email = account?.user?.email;
    if (!email) continue;
    const ends = new Date(e.ends_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Africa/Lagos" });
    const result = await sendPlanEnding(email, { plan: TIER_LABELS[e.tier as Tier], ends });
    if (result.sent) {
      await admin.from("plan_reminders").insert({ entitlement_id: e.id });
      sent++;
    }
  }
  return NextResponse.json({ checked: ending?.length ?? 0, sent });
}

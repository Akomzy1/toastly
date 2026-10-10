import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronAuthorised } from "@/lib/cron-auth";
import { sendDigest } from "@/lib/support-alerts";

/**
 * Daily at 08:00 Lagos time (07:00 UTC in vercel.json; Nigeria has no
 * daylight saving; on Vercel Hobby it may run any time in that hour): every open Toastly Help ticket, oldest first, to the
 * support inbox. Ticket numbers, urgency and console links only.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!cronAuthorised(request)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const { data, error } = await admin.rpc("support_open_digest");
  if (error) return NextResponse.json({ error: error.code }, { status: 500 });
  const rows = (data ?? []) as { reference: string; urgency: "normal" | "urgent"; created_at: string }[];
  const sent = await sendDigest(rows);
  return NextResponse.json({ open: rows.length, sent });
}

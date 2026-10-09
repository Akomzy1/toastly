import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronAuthorised } from "@/lib/cron-auth";
import { alertTeam } from "@/lib/support-alerts";

/**
 * Every 10 minutes (vercel.json): an urgent ticket nobody has opened within
 * its reply time is alerted ONCE more — SMS to the on-call phone and email.
 * support_tickets_to_realert() stamps each ticket as it returns it, so a
 * second run never alerts the same ticket again.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!cronAuthorised(request)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const { data, error } = await admin.rpc("support_tickets_to_realert");
  if (error) return NextResponse.json({ error: error.code }, { status: 500 });
  const due = (data ?? []) as { reference: string; urgency: "normal" | "urgent" }[];
  for (const t of due) await alertTeam({ reference: t.reference, urgency: t.urgency }, { realert: true });
  return NextResponse.json({ realerted: due.length });
}

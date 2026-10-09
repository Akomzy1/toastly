import { NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { capture } from "@/lib/analytics";
import { isCategory, isSafety, slaLine, type HelpCategory } from "@/lib/help-escalation";
import { fileTicket } from "@/lib/support-alerts";

export const dynamic = "force-dynamic";

/**
 * "Talk to a person" — the member's tap. Always honoured, whether or not the
 * AI is available, so a person is always reachable. Files a NORMAL ticket
 * (or returns the one already open for this conversation).
 *
 * A tap never pages the on-call phone: urgent tickets come only from the
 * server's own decision in /api/help, so a safety category sent from the
 * browser is filed as normal "other" and the server's decision stands.
 */
export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!isSupabaseConfigured() || !admin) {
    return NextResponse.json({ error: "We couldn't pass this on right now. Email support@trytoastly.com." }, { status: 503 });
  }

  let body: { conversation_id?: unknown; category?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 400 });
  }
  const category: HelpCategory = isCategory(body.category) && !isSafety(body.category) ? body.category : "other";
  const trigger = body.reason === "not_resolved" ? "not_resolved" : "member_asked";

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  let conversationId: string | null = null;
  if (typeof body.conversation_id === "string") {
    const { data: own } = await admin
      .from("support_conversations")
      .select("id")
      .eq("id", body.conversation_id)
      .eq("profile_id", user.id)
      .maybeSingle();
    if (own) conversationId = own.id as string;
  }

  const ticket = await fileTicket(admin, { profileId: user.id, conversationId, category, handoff: "normal", trigger });
  if (!ticket) {
    return NextResponse.json({ error: "We couldn't pass this on right now. Email support@trytoastly.com." }, { status: 503 });
  }
  await capture("agent_help_handoff", user.id, { trigger });
  return NextResponse.json(
    { reference: ticket.reference, sla: slaLine(ticket.slaMinutes) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

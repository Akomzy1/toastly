import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { capture } from "@/lib/analytics";
import { sendSupportTicketNotice } from "@/lib/email";
import { TICKET_CATEGORIES } from "@/lib/concierge/tools";

export const dynamic = "force-dynamic";

/**
 * "Pass this to our team" — the member's tap files the hand-off. The
 * assistant can only offer one. Works whether or not the AI is available,
 * so a person is always reachable.
 *
 * The summary is the member's own words from this conversation, not a model
 * rewrite. It's cleared with the transcript at the end of the retention
 * period; the reference, category and status stay for the team.
 */
export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!isSupabaseConfigured() || !admin) {
    return NextResponse.json({ error: "We couldn't pass this on right now. Email support@trytoastly.com." }, { status: 503 });
  }

  let body: { conversation_id?: unknown; category?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 400 });
  }
  const category = [...TICKET_CATEGORIES, "safety"].includes(body.category as string)
    ? (body.category as string)
    : "other";

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  let conversationId: string | null = null;
  let summary: string | null = null;
  if (typeof body.conversation_id === "string") {
    const { data: own } = await admin
      .from("support_conversations")
      .select("id")
      .eq("id", body.conversation_id)
      .eq("profile_id", user.id)
      .maybeSingle();
    if (own) {
      conversationId = own.id as string;
      const { data: said } = await admin
        .from("support_messages")
        .select("content")
        .eq("conversation_id", conversationId)
        .eq("role", "member")
        .order("created_at", { ascending: true })
        .limit(10);
      summary = (said ?? []).map((m) => m.content as string).join("\n---\n").slice(0, 2000) || null;
    }
  }

  // Short, readable, unique. Retried on the rare collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = `TH-${randomInt(10000, 100000)}`;
    const { error } = await admin.from("support_tickets").insert({
      reference,
      profile_id: user.id,
      conversation_id: conversationId,
      category,
      summary,
    });
    if (!error) {
      await Promise.all([
        capture("agent_help_handoff", user.id, { category }),
        sendSupportTicketNotice(reference, category),
      ]);
      return NextResponse.json({ reference }, { headers: { "Cache-Control": "no-store" } });
    }
    if (error.code !== "23505") break;
  }
  return NextResponse.json({ error: "We couldn't pass this on right now. Email support@trytoastly.com." }, { status: 503 });
}

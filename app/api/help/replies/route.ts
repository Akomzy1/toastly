import { NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { TeamReply } from "@/lib/help-answer";

export const dynamic = "force-dynamic";

/**
 * Replies from the team, in Toastly Help. Read as the member (RLS: their own
 * rows only), and only the columns a member may read — never which staff
 * member wrote a reply.
 *
 * GET: the replies, newest ticket first. POST {ticket_id}: mark them read
 * (which also clears the in-app notice).
 */
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json({ replies: [] }, { headers });
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401, headers });

  const [{ data: replies }, { data: tickets }] = await Promise.all([
    supabase
      .from("support_ticket_replies")
      .select("id, ticket_id, body, created_at, read_at")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: true })
      .limit(100),
    supabase.from("support_tickets").select("id, reference").eq("profile_id", user.id),
  ]);
  const ref = new Map((tickets ?? []).map((t) => [t.id as string, t.reference as string]));
  const out: TeamReply[] = (replies ?? []).map((r) => ({
    id: r.id as string,
    ticket_id: r.ticket_id as string,
    reference: ref.get(r.ticket_id as string) ?? "",
    body: r.body as string,
    created_at: r.created_at as string,
    read: Boolean(r.read_at),
  }));
  return NextResponse.json({ replies: out }, { headers });
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: false }, { status: 503, headers });
  let body: { ticket_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400, headers });
  }
  if (typeof body.ticket_id !== "string") return NextResponse.json({ ok: false }, { status: 400, headers });
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401, headers });
  const { error } = await supabase.rpc("mark_support_replies_read", { p_ticket: body.ticket_id });
  return NextResponse.json({ ok: !error }, { headers });
}

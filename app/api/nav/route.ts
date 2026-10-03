import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { INVITE_DAYS } from "@/lib/gist-invites";

export const dynamic = "force-dynamic";

/**
 * Tab-bar markers (nav-today / nav-gists): the inbox's bare unread count —
 * a number, never a name or preview, the same count the locked Starter inbox
 * shows — and whether a Gist invite has arrived since Gists was last opened.
 */
export async function GET() {
  const none = { inbox: 0, invite: false };
  if (!isSupabaseConfigured()) return NextResponse.json(none);
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json(none, { status: 401 });

  const seen = Number(cookies().get("gists_seen")?.value ?? 0);
  const since = new Date(Math.max(seen, Date.now() - INVITE_DAYS * 86_400_000)).toISOString();

  const [{ data: unread }, { count }] = await Promise.all([
    supabase.rpc("unread_count"),
    supabase
      .from("gist_sessions")
      .select("id", { count: "exact", head: true })
      .eq("invitee_id", user.id)
      .eq("status", "proposed")
      .gt("created_at", since),
  ]);

  return NextResponse.json(
    { inbox: typeof unread === "number" ? unread : 0, invite: (count ?? 0) > 0 },
    { headers: { "Cache-Control": "no-store" } },
  );
}

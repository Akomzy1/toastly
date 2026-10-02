import { NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * The browser reports that the hosted flow handed its capture to Smile ID.
 *
 * UX ONLY. This moves a session from "started" to "submitted" so the screen
 * can say "being checked". It can never record an outcome, and a forged call
 * gains nothing: the verdict comes only from the signed callback.
 */
export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!isSupabaseConfigured() || !admin) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  let sessionId: unknown;
  try {
    ({ session_id: sessionId } = (await req.json()) as { session_id?: unknown });
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (typeof sessionId !== "string" || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sign in" }, { status: 401 });

  await admin
    .from("verification_sessions")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("profile_id", user.id)
    .eq("status", "started");

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

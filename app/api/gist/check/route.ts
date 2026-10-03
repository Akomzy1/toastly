import { NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { checkLiveKit } from "@/lib/livekit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Signed-in diagnostic for Gist calls: is LiveKit configured on this
 * deployment, reachable, and does it accept this deployment's key and
 * secret? Facts only — no secrets, no tokens.
 */
export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  return NextResponse.json(await checkLiveKit(), { headers: { "Cache-Control": "no-store" } });
}

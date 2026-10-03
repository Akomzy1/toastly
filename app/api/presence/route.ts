import { NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Presence heartbeat — "online now" in the Gist invite screens (0020).
 * Records only a last-seen time for the member themself. Nobody can read it
 * back: gist_partner_online() answers yes/no, and only inside an accepted
 * Gist between the two people.
 */
export async function POST() {
  if (!isSupabaseConfigured()) return new NextResponse(null, { status: 204 });
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await supabase.rpc("touch_presence");
  return new NextResponse(null, { status: 204 });
}

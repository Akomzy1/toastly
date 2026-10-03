import { json, memberSession, readClock } from "@/lib/gist-clock";

export const dynamic = "force-dynamic";

/**
 * Ask for the one extension. It happens only when BOTH people ask — the same
 * mutual opt-in as starting the call. Either can still leave at any time.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { supabase, user } = await memberSession();
  if (!supabase) return json({ error: "unavailable" }, 503);
  if (!user) return json({ error: "Please sign in again." }, 401);

  const { error } = await supabase.rpc("gist_extend", { p_session_id: params.id });
  if (error) return json({ error: error.message }, 409);
  const clock = await readClock(supabase, params.id, user.id);
  return json({ clock });
}

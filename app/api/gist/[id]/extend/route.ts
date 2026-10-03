import { json, memberSession, readClock } from "@/lib/gist-clock";

export const dynamic = "force-dynamic";

/**
 * The one extension: either person can add 18 minutes, once
 * (both-clocks.slim.html). Either can still leave at any time.
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

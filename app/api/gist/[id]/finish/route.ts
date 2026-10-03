import { closeGistRoom, gistRoomName } from "@/lib/livekit";
import { json, memberSession } from "@/lib/gist-clock";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Time's up: close the room for both people.
 *
 * gist_finish refuses until the server's clock has actually run out, so a
 * client can't end someone else's Gist early through this route (leaving is
 * a plain disconnect). Called by either browser when its timer ends, so one
 * honest client is enough to enforce the box for both.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { supabase, user } = await memberSession();
  if (!supabase) return json({ error: "unavailable" }, 503);
  if (!user) return json({ error: "Please sign in again." }, 401);

  const { data: finished, error } = await supabase.rpc("gist_finish", { p_session_id: params.id });
  if (error) return json({ error: error.message }, 409);
  if (finished !== true) return json({ finished: false });

  const closed = await closeGistRoom(gistRoomName(params.id));
  return json({ finished: true, closed });
}

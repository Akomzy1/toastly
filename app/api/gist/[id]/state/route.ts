import { json, memberSession, readClock } from "@/lib/gist-clock";

export const dynamic = "force-dynamic";

/** The server's clock for this Gist. The browser's timer only displays it. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { supabase, user } = await memberSession();
  if (!supabase) return json({ error: "unavailable" }, 503);
  if (!user) return json({ error: "Please sign in again." }, 401);
  const clock = await readClock(supabase, params.id, user.id);
  return clock ? json({ clock }) : json({ error: "not found" }, 404);
}

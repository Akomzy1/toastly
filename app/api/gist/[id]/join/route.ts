import { createGistToken, gistRoomName, isLiveKitConfigured, livekitUrl } from "@/lib/livekit";
import { json, memberSession, readClock } from "@/lib/gist-clock";
import { notLiveError, requireLiveProfile } from "@/lib/live-profile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Join a Gist: start (or read) the server's clock, then mint a LiveKit token.
 *
 * Mutual opt-in gates the hardware: gist_join refuses until BOTH people have
 * said they're ready, so no token — and no microphone — exists before that.
 *
 * VOICE ONLY in Phase 1. Live video transport is Phase 2 (P2-D), so the token
 * withholds camera publish rights for every session and every plan here.
 * The identity is the profile UUID: never a name, never a phone number.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  if (!isLiveKitConfigured()) return json({ error: "Calling isn't connected yet." }, 503);
  const { supabase, user } = await memberSession();
  if (!supabase) return json({ error: "Calling isn't available right now." }, 503);
  if (!user) return json({ error: "Please sign in again." }, 401);

  // No live profile, no access (PRD §5.1.2); gist_join refuses too (0029).
  const live = await requireLiveProfile(supabase);
  if (!live.live) return json({ error: notLiveError(live) }, 403);

  const { data: endsAt, error } = await supabase.rpc("gist_join", { p_session_id: params.id });
  if (error || typeof endsAt !== "string") {
    return json({ error: error?.message ?? "You can't join this Gist right now." }, 409);
  }

  // The token outlives the box only by a minute; the room is closed by the
  // server when the time is up regardless.
  const secondsLeft = Math.max(60, Math.ceil((Date.parse(endsAt) - Date.now()) / 1000) + 60);
  const token = createGistToken({
    roomName: gistRoomName(params.id),
    identity: user.id,
    ttlSeconds: Math.min(secondsLeft, 40 * 60),
    canPublishVideo: false,
  });

  const clock = await readClock(supabase, params.id, user.id);
  return json({ url: livekitUrl(), token, clock });
}

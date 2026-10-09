import { json, memberSession, readClock } from "@/lib/gist-clock";
import { featureFlags } from "@/lib/features";
import { gistRoomName, setGistCamera } from "@/lib/livekit";
import { applyVideoAction, isVideoAction, type VideoOffReason } from "@/lib/gist-video";
import { notLiveError, requireLiveProfile } from "@/lib/live-profile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Video in a Gist (Phase 2; 0040). One action per call — request, cancel,
 * accept, decline, off — decided by the database, then mirrored in LiveKit:
 * camera rights for both only while video is on. Refused entirely while
 * VIDEO_GIST_ENABLED is off.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!featureFlags().videoGist) return json({ error: "Video isn't available yet." }, 404);
  const { supabase, user } = await memberSession();
  if (!supabase) return json({ error: "unavailable" }, 503);
  if (!user) return json({ error: "Please sign in again." }, 401);
  const live = await requireLiveProfile(supabase);
  if (!live.live) return json({ error: notLiveError(live) }, 403);

  let body: { action?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad request" }, 400);
  }
  if (!isVideoAction(body.action)) return json({ error: "bad request" }, 400);
  const reason: VideoOffReason =
    body.reason === "weak_connection" || body.reason === "camera_unavailable" ? body.reason : "turned_off";

  const result = await applyVideoAction(params.id, body.action, reason, {
    rpc: (fn, args) => supabase.rpc(fn, args),
    session: async (id) => {
      const { data } = await supabase.from("gist_sessions").select("proposer_id, invitee_id, video_state").eq("id", id).maybeSingle();
      return data;
    },
    setCamera: setGistCamera,
    roomName: gistRoomName,
  });
  if (result.error) return json({ error: result.error }, 409);
  return json({ state: result.state, clock: await readClock(supabase, params.id, user.id) });
}

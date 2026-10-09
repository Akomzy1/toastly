/**
 * Video in a Gist (Phase 2; 0040; PRD §5.4). The database decides every rule
 * — either person's Premium Plus or Diaspora Plus unlocks it, asking opens
 * after 3 minutes, both must accept, either can turn it off for both, a
 * decline blocks further requests. This module turns a member's action into
 * that database call and then keeps LiveKit in step: camera rights for both
 * while video is on, for neither otherwise.
 *
 * Pure apart from the injected database and LiveKit call, so it is tested
 * without either (scripts/gist-video-actions.test.mjs). The route that uses
 * it (app/api/gist/[id]/video) refuses everything while VIDEO_GIST_ENABLED
 * is off.
 */

export type VideoAction = "request" | "cancel" | "accept" | "decline" | "off";
export type VideoOffReason = "turned_off" | "weak_connection" | "camera_unavailable";

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
type Select = (sessionId: string) => PromiseLike<{ proposer_id: string; invitee_id: string; video_state: string } | null>;

export type VideoDeps = {
  rpc: Rpc;
  /** The session's two participants and its video state, as the member sees the row. */
  session: Select;
  /** lib/livekit.ts setGistCamera. */
  setCamera: (roomName: string, identities: string[], allowed: boolean) => Promise<boolean>;
  roomName: (sessionId: string) => string;
};

const ACTIONS: Record<VideoAction, (s: string, reason: VideoOffReason) => [string, Record<string, unknown>]> = {
  request: (s) => ["gist_video_request", { p_session_id: s }],
  cancel: (s) => ["gist_video_cancel", { p_session_id: s }],
  accept: (s) => ["gist_video_answer", { p_session_id: s, p_accept: true }],
  decline: (s) => ["gist_video_answer", { p_session_id: s, p_accept: false }],
  off: (s, reason) => ["gist_video_off", { p_session_id: s, p_reason: reason }],
};

export function isVideoAction(a: unknown): a is VideoAction {
  return typeof a === "string" && a in ACTIONS;
}

/**
 * Run one action. Returns the video state afterwards, or the database's own
 * message when it refuses. LiveKit is synced after every action that
 * reached the database — granting cameras only when the state is 'on'.
 */
export async function applyVideoAction(
  sessionId: string,
  action: VideoAction,
  reason: VideoOffReason,
  deps: VideoDeps,
): Promise<{ state?: string; error?: string }> {
  const [fn, args] = ACTIONS[action](sessionId, reason);
  const { data, error } = await deps.rpc(fn, args);
  if (error) return { error: error.message };
  const s = await deps.session(sessionId);
  if (!s) return { error: "That session doesn't exist." };
  await deps.setCamera(deps.roomName(sessionId), [s.proposer_id, s.invitee_id], s.video_state === "on");
  return { state: typeof data === "string" ? data : s.video_state };
}

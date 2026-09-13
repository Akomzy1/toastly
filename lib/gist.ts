import type { Tier } from "@/lib/types/profile";

/**
 * Gist session rules.
 *
 * DURATION IS UNRESOLVED — flagged, not silently decided.
 *
 * build-prompts.md (Prompt 5) specifies a "5-7 minute time-box". The approved
 * prototypes say something different and more specific: an 18-minute default,
 * extendable once — and that figure is already shipped in public copy on
 * Home, How It Works and Features.
 *
 * PRD.md says nothing about duration at all, so the usual "PRD wins on
 * content" tie-break does not apply here. Rather than quietly contradict
 * live marketing copy, the default below matches what is shipped, and both
 * candidate values are named so changing it is one line and one deploy.
 */
export const GIST_DEFAULT_MINUTES = 18;
export const GIST_EXTENSION_MINUTES = 18;
/** The alternative from build-prompts.md, kept visible for the decision. */
export const GIST_SHORT_TIMEBOX_MINUTES = 7;

/** Starter's monthly voice allowance. Not 5, 8 or 10 — those are superseded. */
export const STARTER_VOICE_GISTS_PER_MONTH = 2;

export type GistMedium = "voice" | "video";

export type GistStatus =
  | "proposed"
  | "accepted"
  | "live"
  | "completed"
  | "declined"
  | "cancelled"
  | "expired";

/**
 * Live video is Premium Plus and Diaspora Plus only.
 *
 * Mirrors can_use_video_gist() in SQL. The database is the control; this
 * exists so the UI can explain the rule before the member hits it.
 */
export function canUseVideo(tier: Tier): boolean {
  return tier === "premium_plus" || tier === "diaspora_plus";
}

/** null means unlimited. */
export function voiceAllowance(tier: Tier): number | null {
  return tier === "starter" ? STARTER_VOICE_GISTS_PER_MONTH : null;
}

export function voiceRemaining(tier: Tier, usedThisMonth: number): number | null {
  const allowance = voiceAllowance(tier);
  return allowance === null ? null : Math.max(0, allowance - usedThisMonth);
}

/**
 * A session is joinable only once BOTH people have opted in. No microphone
 * or camera may be requested before this returns true — mutual opt-in is a
 * precondition of the hardware, not a UI nicety.
 */
export function isJoinable(session: {
  status: GistStatus;
  proposer_ready_at: string | null;
  invitee_ready_at: string | null;
}): boolean {
  return (
    (session.status === "accepted" || session.status === "live") &&
    Boolean(session.proposer_ready_at) &&
    Boolean(session.invitee_ready_at)
  );
}

import { capabilities } from "@/lib/entitlements";
import type { Tier } from "@/lib/types/profile";

/**
 * Gist session rules.
 *
 * DURATION IS SETTLED: 18 minutes, extendable once (PRD §5.4, CLAUDE.md).
 *
 * The 5–7 minute figure that appeared in earlier drafts is superseded and is
 * deliberately NOT defined here, so it cannot be reintroduced by autocomplete
 * or by someone reading an old draft. It was calibrated before Starter
 * dropped to a handful of sessions a month (one, from 8 October 2026): at 7
 * minutes a free member would get a few minutes of conversation a month against ~180 possible matches, which
 * cannot carry the question deck's subject matter.
 */
export const GIST_DEFAULT_MINUTES = 18;
export const GIST_EXTENSION_MINUTES = 18;

/**
 * Questions per Gist (decided 8 October 2026; PRD §5.4). Mirrors
 * gist_config.deck_size (0039) — a constraint check keeps the two equal. Every
 * "Question X of N" reads this. The extension adds time, never cards.
 */
export const GIST_DECK_SIZE = 6;

/** Starter's monthly allowance lives in lib/plan-numbers.ts (and plan_config, 0035). */
export { STARTER_MONTHLY_GISTS } from "@/lib/plan-numbers";

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
  return capabilities(tier).liveVideoGist;
}

/** null means unlimited. */
export function voiceAllowance(tier: Tier): number | null {
  return capabilities(tier).voiceGistsPerMonth;
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

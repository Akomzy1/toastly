import type { Tier } from "@/lib/types/profile";

/**
 * Six. Everywhere, every tier.
 *
 * This constant exists so the number is written once and can be read by the
 * UI, but it is NOT the source of truth — `daily_match_count()` in the
 * database is, and the feed is built there. Nothing may derive this from a
 * tier, an entitlement or a setting.
 */
export const DAILY_MATCH_COUNT = 6;

export type FeedCandidate = {
  id: string;
  display_name: string;
  city: string | null;
  stage: "verified_real" | "id_confirmed";
  /** Prompt answers sit ABOVE the photos on the card. */
  answers: { id: string; prompt: string; answer: string }[];
  /** Optional, display-only, shown only if this member chose to show it. */
  tags: string[];
};

/**
 * What a member may send as an opening reply.
 *
 * Starter cannot send free text at all. Its only outbound move is proposing
 * one of its 2 monthly Gist sessions — inbound messages arrive as a bare
 * locked count instead (CLAUDE.md, PRD §7.1). This is an entitlement
 * question, so it is answered from the tier and enforced server-side.
 */
export function canSendText(tier: Tier): boolean {
  return tier !== "starter";
}

export function replyKindFor(tier: Tier): "text" | "gist_invite" {
  return canSendText(tier) ? "text" : "gist_invite";
}

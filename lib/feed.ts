import type { GenotypeValue } from "@/lib/genotype";
import { capabilities } from "@/lib/entitlements";
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

/**
 * Fewer than six qualified today (PRD §5.2.5). Said plainly; the rules —
 * a man and a woman, each inside the other's age range — are never relaxed to
 * fill the six.
 */
export function fewFitLine(n: number): string {
  return n === 1
    ? "Only 1 person fits today — Lagos is still growing."
    : `Only ${n} people fit today — Lagos is still growing.`;
}

export type FeedCandidate = {
  id: string;
  display_name: string;
  city: string | null;
  stage: "verified_real" | "id_confirmed";
  /** Prompt answers sit ABOVE the photos on the card. */
  answers: { id: string; prompt: string; answer: string }[];
  /** Optional, display-only, shown only if this member chose to show it. */
  tags: string[];
  /** Present only when both have chosen to share (0014). Never a placeholder. */
  genotype?: GenotypeValue | null;
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
  return capabilities(tier).sendText;
}

import type { Tier } from "@/lib/types/profile";

/**
 * THE entitlement table. One source of truth for "what can this member do".
 *
 * Prompt 7 requires this to be centralised rather than scattered as
 * per-feature conditionals, and the reason is concrete: the Starter rules are
 * asymmetric and easy to get subtly wrong in isolation. Written out as one
 * table, an inconsistency is visible by reading down a column.
 *
 * The database is still the enforcement point — triggers and RLS — because a
 * client-side table is documentation, not a control. This is what the UI
 * consults so it can explain a rule before someone hits it.
 *
 * Sources: PRD §7.1 (tier package), CLAUDE.md (the constraints that are also
 * engineering constraints).
 */
export type Capabilities = {
  /** Fixed at 6 for everyone. Never tier-dependent — see lib/feed.ts. */
  dailyMatches: 6;
  /** null = unlimited. Starter's 2 is its ONLY outbound channel. */
  voiceGistsPerMonth: number | null;
  liveVideoGist: boolean;
  /** Starter cannot send free text; it can receive, locked to a bare count. */
  sendText: boolean;
  readInbox: boolean;
  advancedFilters: boolean;
  incognito: boolean;
  prioritySupport: boolean;
  /**
   * Diaspora-to-diaspora matching (decision (b)). A free member abroad
   * matches into the back-home pool — where the liquidity is — and the paid
   * Diaspora tiers unlock matching within a diaspora city, on top of the
   * per-city opening from 0010. This changes WHICH pool, never the six.
   */
  diasporaPools: boolean;
  /** Free on EVERY tier, including Starter. Never gate this. */
  coupleMode: true;
  ariyaHandoff: true;
  /** Never paywalled, on any tier, ever. */
  verification: true;
  safetyTools: true;
};

const TABLE: Record<Tier, Capabilities> = {
  starter: {
    dailyMatches: 6,
    voiceGistsPerMonth: 2,
    liveVideoGist: false,
    sendText: false,
    readInbox: false,
    advancedFilters: false,
    incognito: false,
    prioritySupport: false,
    // A free member abroad is a Starter member: back-home pool only.
    diasporaPools: false,
    coupleMode: true,
    ariyaHandoff: true,
    verification: true,
    safetyTools: true,
  },
  premium: {
    dailyMatches: 6,
    voiceGistsPerMonth: null,
    liveVideoGist: false,
    sendText: true,
    readInbox: true,
    advancedFilters: true,
    incognito: false,
    prioritySupport: false,
    // The domestic tiers are Nigeria-based; diaspora pools aren't theirs.
    diasporaPools: false,
    coupleMode: true,
    ariyaHandoff: true,
    verification: true,
    safetyTools: true,
  },
  premium_plus: {
    dailyMatches: 6,
    voiceGistsPerMonth: null,
    liveVideoGist: true,
    sendText: true,
    readInbox: true,
    advancedFilters: true,
    incognito: true,
    prioritySupport: true,
    diasporaPools: false,
    coupleMode: true,
    ariyaHandoff: true,
    verification: true,
    safetyTools: true,
  },
  diaspora: {
    dailyMatches: 6,
    // Parity with domestic Premium, deliberately: Diaspora at $15 is priced
    // far above ₦3,500, so capping its Gist allowance below Premium's would
    // charge more for less (PRD §7.1 rationale).
    voiceGistsPerMonth: null,
    liveVideoGist: false,
    sendText: true,
    readInbox: true,
    advancedFilters: true,
    incognito: false,
    prioritySupport: false,
    // What the paid Diaspora tier buys, on top of the per-city opening.
    diasporaPools: true,
    coupleMode: true,
    ariyaHandoff: true,
    verification: true,
    safetyTools: true,
  },
  diaspora_plus: {
    dailyMatches: 6,
    voiceGistsPerMonth: null,
    liveVideoGist: true,
    sendText: true,
    readInbox: true,
    advancedFilters: true,
    incognito: false,
    prioritySupport: true,
    diasporaPools: true,
    coupleMode: true,
    ariyaHandoff: true,
    verification: true,
    safetyTools: true,
  },
};

export function capabilities(tier: Tier): Capabilities {
  return TABLE[tier];
}

export const TIER_LABELS: Record<Tier, string> = {
  starter: "Starter",
  premium: "Premium",
  premium_plus: "Premium Plus",
  diaspora: "Diaspora",
  diaspora_plus: "Diaspora Plus",
};


/** NGN goes to Paystack, USD to Stripe. Never converted, never crossed. */
export function providerFor(currency: "NGN" | "USD"): "paystack" | "stripe" {
  return currency === "NGN" ? "paystack" : "stripe";
}

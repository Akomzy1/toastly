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

/**
 * Coin packs. Prices are the shipped Pricing page's.
 *
 * Coins buy exactly four things (PRD §7.2): date stakes, inbox unlocks,
 * additional Gist sessions, and see-who-liked-you. Nothing here raises a
 * member's visibility to anyone else — there is no Boost and no Super Like.
 */
export const COIN_PACKS = [
  { id: "ng-10", coins: 10, price: "₦1,000", currency: "NGN" as const, note: "Two date commitments, roughly" },
  { id: "ng-30", coins: 30, price: "₦2,700", currency: "NGN" as const, note: "Most-used pack" },
  { id: "us-30", coins: 30, price: "$6", currency: "USD" as const, note: "Billed in USD" },
];

/** NGN goes to Paystack, USD to Stripe. Never converted, never crossed. */
export function providerFor(currency: "NGN" | "USD"): "paystack" | "stripe" {
  return currency === "NGN" ? "paystack" : "stripe";
}

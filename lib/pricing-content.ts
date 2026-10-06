/**
 * Pricing content.
 *
 * Layout and copy come from design/prototype/pricing-offer.slim.html (which
 * replaced pricing.slim.html; the only change is the women's offer); tier
 * CONTENTS come from PRD.md §7.1, which is authoritative and supersedes the
 * generated design output where they disagree. Every place they disagreed is
 * marked CORRECTED below and reported to the user, never silently resolved.
 */

export type Tier = {
  name: string;
  price: string;
  per: string;
  for: string;
  features: string[];
  cta: string;
  flag?: string;
  tone: "light" | "dark" | "glass";
};

export const ngTiers: Tier[] = [
  {
    name: "Starter",
    price: "Free",
    per: " forever",
    for: "A real first look — upgrade when you're ready to talk.",
    features: [
      "Verified Real profile",
      "Six matches a day",
      "2 Gist sessions a month",
      "Receive messages (unlock to read with Premium)",
      "Coin-deposit dates",
      "Couple Mode + AriyaPlanner handoff",
    ],
    cta: "Start free",
    tone: "light",
  },
  {
    name: "Premium",
    price: "₦3,500",
    per: " /month",
    for: "For when you're actively looking and want the pace to match.",
    features: [
      "Everything in Starter, plus:",
      "Unlimited Gist sessions",
      "Priority match feed — still 6 a day, just better matched",
      "Advanced filters — city, language, intentions",
    ],
    cta: "Choose Premium",
    flag: "Most chosen",
    tone: "dark",
  },
  {
    name: "Premium Plus",
    price: "₦7,000",
    per: " /month",
    for: "For the marriage track, all the way to the wedding.",
    features: [
      "Everything in Premium, plus:",
      "Live-video Gist sessions",
      // CORRECTED: the prototype's Premium Plus card omitted incognito, which
      // PRD §7.1 lists as a Premium Plus feature — and it is half the reason
      // the women's 30-day offer is Premium Plus rather than base Premium.
      "Incognito mode",
      // REMOVED (decided 6 October 2026): "Unlimited voice notes" — the
      // prototype lists it, but the feature doesn't exist.
      "Priority support from Lagos",
    ],
    cta: "Choose Premium Plus",
    tone: "light",
  },
];

export const dpTiers: Tier[] = [
  {
    name: "Diaspora",
    price: "$15",
    per: " /month",
    for: "For Nigerians abroad matching back home or within their community.",
    features: [
      "Verified Real profile",
      "Both matching pools",
      "Unlimited Gist sessions",
      "Time-zone aware scheduling",
      // CORRECTED: PRD §7.1 gives advanced filters to Diaspora at $15. The
      // prototype reserved them for Diaspora Plus.
      "Advanced filters",
      "Couple Mode + AriyaPlanner handoff",
    ],
    cta: "Join the diaspora track",
    tone: "glass",
  },
  {
    name: "Diaspora Plus",
    price: "$30",
    per: " /month",
    for: "For diaspora couples heading toward a Nigerian wedding abroad.",
    features: [
      "Everything in Diaspora, plus:",
      "Live-video Gist sessions",
      "Priority support",
    ],
    cta: "Join Diaspora Plus",
    flag: "Marriage track",
    tone: "dark",
  },
];

export const trackLabels = ["Nigeria (₦)", "Diaspora ($)"];

export const tableCaptions = [
  "Nigeria track — billed in Naira by card, bank or USSD.",
  "Diaspora track — billed in USD by card or Apple Pay.",
];

export const compareCols = [
  ["Starter", "Premium", "Premium Plus"],
  ["Diaspora", "Diaspora Plus"],
];

export const compareRows: [string, string[]][][] = [
  [
    ["Verified Real (phone + liveness)", ["Included", "Included", "Included"]],
    ["Daily match feed", ["6 a day", "6 a day, priority", "6 a day, priority"]],
    // ADDED: the prototype's table had no chat row at all, leaving out the
    // single most important difference on Starter (CLAUDE.md). Bare count
    // only — no sender name, no photo, no preview.
    [
      "Text chat",
      [
        "Receive only — a bare count until you upgrade",
        "Unlimited send + receive",
        "Unlimited send + receive",
      ],
    ],
    ["Gist sessions (audio)", ["2 a month", "Unlimited", "Unlimited"]],
    ["Live-video Gist", ["—", "—", "Included"]],
    [
      "Advanced filters",
      ["—", "City, language, intentions", "City, language, intentions"],
    ],
    // ADDED: PRD §7.1 lists incognito as Premium Plus only.
    ["Incognito mode", ["—", "—", "Included"]],
    ["Couple Mode", ["Included", "Included", "Included"]],
    ["AriyaPlanner handoff", ["Included", "Included", "Included"]],
    // CORRECTED: the prototype gave Premium "48 hours" priority support.
    // PRD §7.1 has priority support on Premium Plus only.
    ["Priority support", ["—", "—", "Same day, from Lagos"]],
    ["Data-light PWA", ["Included", "Included", "Included"]],
  ],
  [
    ["Verified Real (phone + liveness)", ["Included", "Included"]],
    ["Matching pools", ["Back home + diaspora", "Back home + diaspora"]],
    ["Gist sessions (audio)", ["Unlimited", "Unlimited"]],
    ["Live-video Gist", ["—", "Included"]],
    ["Time-zone smart scheduling", ["Included", "Included"]],
    // CORRECTED: PRD §7.1 gives advanced filters to both diaspora tiers.
    [
      "Advanced filters",
      ["City, language, intentions", "City, language, intentions"],
    ],
    ["Couple Mode", ["Included", "Included"]],
    [
      "AriyaPlanner handoff",
      ["Included", "Included, incl. weddings abroad"],
    ],
    // CORRECTED: the prototype gave Diaspora "72 hours". PRD §7.1 has
    // priority support on Diaspora Plus only.
    ["Priority support", ["—", "Same day"]],
  ],
];

/**
 * CORRECTED. The prototype ends "Somebody's plans change and they say so —
 * everything comes back". Only a cancellation before the cut-off (default 12
 * hours) is free (PRD §5.5), so "in good time" stays.
 */
export const coinIntro =
  "Coins are not a subscription and they are not a fee. When a date is confirmed, you each stake a few. You both turn up, you both get them straight back. Somebody's plans change and they say so in good time — everything comes back, no questions.";

/**
 * CORRECTED. The prototype reads: "On a genuine no-show, the coins that were
 * staked go to a charity the other person chooses. Toastly does not keep a
 * single kobo of it." The charity mechanic is rejected (PRD §5.5): the absent
 * member's stake moves to the member who showed up, Toastly keeps none. "Kobo"
 * became "coin" — coins are closed-loop, never money. The safety override
 * (a safety cancellation always returns the stake) is added so the line can
 * never read as pressure to meet.
 */
export const coinNoShow = {
  lead: "On a genuine no-show, the coins that were staked go to ",
  emphasis: "the person who showed up",
  rest: ". Toastly does not keep a single coin of it. If you cancel because you feel unsafe, your coins always come back to you. This is a mutual promise about each other's time, not a penalty system.",
};

/**
 * CORRECTED. The prototype reads "Refundable to your original payment method
 * on request." Coins are never refunded or paid out as cash (PRD §5.5).
 */
export const coinTerms =
  "Unused coins never expire. Coins are never refunded or paid out as cash.";

export const coinPacks = [
  { name: "10 coins", note: "Two date commitments, roughly", price: "₦1,000" },
  { name: "30 coins", note: "Most-used pack", price: "₦2,700" },
  { name: "Diaspora packs — 5 to 50 coins", note: "Billed in USD, by card or Apple Pay", price: "from $1" },
];

export const whyPay = [
  {
    title: "Premium buys pace",
    body: "Unlimited Gist sessions and a priority feed, for the months when you are genuinely looking.",
  },
  {
    // CORRECTED: the prototype read "Live video, Couple Mode and the
    // AriyaPlanner handoff — the part no other app has", which sells Couple
    // Mode as a Premium Plus feature. It is free on every tier including
    // Starter (CLAUDE.md, PRD §6) and must never be presented as paid.
    title: "Premium Plus buys the whole track",
    body: "Live-video Gist and incognito mode. Couple Mode and the AriyaPlanner handoff are already yours on every tier, including free.",
  },
  {
    title: "Nobody buys your place in the six",
    body: "The feed is six people a day on every tier. Paying can improve how well those six are matched to you — it never buys you more of them.",
  },
];

/**
 * The line under the Why-pay cards. The prototype's reads: "No tier buys you
 * visibility, boosts your position in anybody's feed, or unlocks a person.
 * Every member is verified on every tier — that part is never for sale."
 * "Boosts" became "raises": Boosts are cut from the product (PRD §7.2) and the
 * word stays out of copy. The safety sentence is the one the page carried
 * before (CLAUDE.md: safety is never paywalled), now inside the prototype's
 * paragraph instead of a separate card the prototype doesn't draw.
 */
export const whyPayNote =
  "No tier buys you visibility, raises your position in anybody's feed, or unlocks a person. Every member is verified on every tier — that part is never for sale, and neither is anything about safety: reporting, blocking, photo-reveal control or sharing your date plans.";

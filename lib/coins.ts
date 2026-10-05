/**
 * The coin balance and date attendance (PRD §5.5, Prompt 17, 0019).
 *
 * HELD FROM PRODUCTION until the legal check in PRD §11 confirms a
 * closed-loop coin balance falls outside CBN e-money licensing. Until
 * COINS_LEGAL_CLEARED=true, every action that moves coins refuses in
 * production; the balance can still be seen.
 *
 * Words that never appear in product copy (PRD §5.5 rule 1, CLAUDE.md):
 * "wallet", "escrow", "transfer", "cash out" — and the stake is never
 * framed as a "forfeit", "penalty" or "fine". scripts/check-constraints.mjs
 * enforces both.
 */

export function coinsOpen(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.COINS_LEGAL_CLEARED === "true";
}

export const COINS_HELD =
  "Coins and date stakes aren't open yet. Your balance is safe, and nothing has been taken.";

/**
 * Packs, per the in-app prototypes (coins-get, coins-get-usd): ₦100 or
 * $0.20 a coin, in the member's own currency — nobody abroad is quoted in
 * naira (PRD §5.5 rule 3).
 *
 * CONFLICT, flagged: the public Pricing page (and its newest prototype)
 * lists 10 / 30 coin packs at ₦1,000 / ₦2,700 and 30 at $6. These follow
 * the in-app design until that is settled.
 */
export const PACKS = {
  NGN: [
    { id: "ng-5", coins: 5, price: "₦500", minor: 50_000 },
    { id: "ng-10", coins: 10, price: "₦1,000", minor: 100_000 },
    { id: "ng-25", coins: 25, price: "₦2,500", minor: 250_000 },
    { id: "ng-50", coins: 50, price: "₦5,000", minor: 500_000 },
  ],
  USD: [
    { id: "us-5", coins: 5, price: "$1", minor: 100 },
    { id: "us-10", coins: 10, price: "$2", minor: 200 },
    { id: "us-25", coins: 25, price: "$5", minor: 500 },
    { id: "us-50", coins: 50, price: "$10", minor: 1000 },
  ],
} as const;

export const PAY_METHODS = {
  // "Bank transfer" names a way of paying Paystack, not coins moving
  // between members — the one approved use of the word (flagged).
  NGN: [
    { id: "card", label: "Card", sub: "Visa, Mastercard or Verve" },
    { id: "bank", label: "Bank transfer", sub: "From any Nigerian bank" },
    { id: "ussd", label: "USSD", sub: "Dial a code from any phone" },
  ],
  USD: [
    { id: "card", label: "Card", sub: "Visa, Mastercard or Amex" },
    { id: "apple", label: "Apple Pay", sub: "Confirm with Face ID or Touch ID" },
  ],
} as const;

export const NO_REFUND = "Coins can be spent on Toastly. They can't be refunded or exchanged for money.";

export const PLANS = {
  premium: { name: "Premium", track: "Nigeria (₦)", price: "₦3,500", naira: 3500, for: "For when you're actively looking and want the pace to match." },
  premium_plus: { name: "Premium Plus", track: "Nigeria (₦)", price: "₦7,000", naira: 7000, for: "For the marriage track, all the way to the wedding." },
  diaspora: { name: "Diaspora", track: "Diaspora ($)", price: "$15", naira: null, for: "For Nigerians abroad matching back home or within their community." },
} as const;
export type PlanKey = keyof typeof PLANS;

/** History lines, in the coins-balance prototype's words. */
export function historyLine(e: { kind: string; delta: number; bucket: string; note: string | null; other?: string | null }) {
  const n = Math.abs(e.delta);
  const withWho = e.other ? ` with ${e.other}` : "";
  switch (e.kind) {
    case "purchase":
      return `Bought ${n} coins`;
    case "promotional_grant":
      return "Bonus coins added";
    case "stake_hold":
      return `Staked ${n} coins for a date${withWho}`;
    case "stake_return":
      return `Your ${n} coins came back`;
    case "stake_from_absent":
      return `${n} coins from ${e.other ?? "your date"} — they didn't make it`;
    case "plan_spend":
      return e.note ?? `Used ${n} coins`;
    default:
      return e.note ?? `${e.delta > 0 ? "+" : "−"}${n} coins`;
  }
}

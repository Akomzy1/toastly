import { notFound } from "next/navigation";
import { PlanPage, type Grant, type Sub } from "@/components/plan/plan-page";

/** Mobile-audit harness: the plan page in each state (gated by the layout). */
const END = "2026-11-03T12:00:00.000Z";
const base = {
  tierLabel: "Starter",
  track: "ngn" as "ngn" | "usd",
  grants: [] as Grant[],
  subs: [] as Sub[],
  coins: 0,
  premiumCoins: 35,
  premiumPlusCoins: 70,
  coinNaira: 100,
  paystackOn: true,
  stripeOn: true,
  paid: null as string | null,
};
const STATES: Record<string, Partial<typeof base>> = {
  "ngn-starter": { coins: 20 },
  "ngn-coins": { coins: 40 },
  "ngn-renewing": {
    tierLabel: "Premium",
    grants: [{ tier: "premium", source: "subscription", ends_at: END }],
    subs: [{ id: "s1", provider: "paystack", tier: "premium", status: "active", current_period_end: END }],
    paid: "1",
  },
  "ngn-stopped": {
    tierLabel: "Premium Plus",
    grants: [
      { tier: "premium_plus", source: "womens_launch_offer", ends_at: END },
      { tier: "premium", source: "subscription", ends_at: END },
    ],
    subs: [{ id: "s1", provider: "paystack", tier: "premium", status: "non_renewing", current_period_end: END }],
  },
  "ngn-off": { paystackOn: false, coins: 10 },
  usd: { track: "usd" },
  "usd-renewing": {
    track: "usd",
    tierLabel: "Diaspora",
    grants: [{ tier: "diaspora", source: "subscription", ends_at: END }],
    subs: [{ id: "s2", provider: "stripe", tier: "diaspora", status: "past_due", current_period_end: END }],
  },
};

export default function AuditPlan({ params }: { params: { state: string } }) {
  const s = STATES[params.state];
  if (!s) notFound();
  return <PlanPage {...base} {...s} />;
}

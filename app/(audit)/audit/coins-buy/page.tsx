import type { Metadata } from "next";
import { requireAuditHarness } from "@/lib/audit-harness";
import { CoinBalance, type LedgerRow } from "@/components/coins/coin-balance";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Audit · coins abroad", robots: { index: false, follow: false } };

const DAY = 86400_000;
const at = (d: number) => new Date(Date.UTC(2026, 9, 1) - d * DAY).toISOString();
const HISTORY: LedgerRow[] = [
  { id: "1", delta: 10, kind: "stake_award", bucket: "purchased", note: null, created_at: at(0) },
  { id: "2", delta: 10, kind: "stake_return", bucket: "purchased", note: null, created_at: at(1) },
  { id: "3", delta: -10, kind: "stake_hold", bucket: "purchased", note: null, created_at: at(3) },
  { id: "4", delta: -35, kind: "subscription_spend", bucket: "purchased", note: "premium", created_at: at(9) },
  { id: "5", delta: 20, kind: "promo_grant", bucket: "promotional", note: "Launch week", created_at: at(12) },
  { id: "6", delta: 30, kind: "purchase", bucket: "purchased", note: null, created_at: at(14) },
];

/** Mobile-audit harness: the coin balance page with a full history. */
export default function AuditCoinsBuy() {
  requireAuditHarness();
  return (
    <CoinBalance
      total={58}
      stakeable={38}
      promo={20}
      tierLabel="Diaspora"
      abroad={true}
      premiumCoins={35}
      premiumPlusCoins={70}
      history={HISTORY}
      paid="1"
    />
  );
}

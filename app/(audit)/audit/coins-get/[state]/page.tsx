import { notFound } from "next/navigation";
import { ScreenBand } from "@/components/app/screen-band";
import { GetCoins } from "@/components/coins/get-coins";

/** Mobile-audit harness: Get coins (gated by the layout). */
const USD = [
  { sku: "us-5", coins: 5, price: "$1" },
  { sku: "us-10", coins: 10, price: "$2" },
  { sku: "us-25", coins: 25, price: "$5" },
  { sku: "us-50", coins: 50, price: "$10" },
];
const NGN = [
  { sku: "ng-10", coins: 10, price: "₦1,000" },
  { sku: "ng-30", coins: 30, price: "₦2,700" },
];

export default function AuditGetCoins({ params }: { params: { state: string } }) {
  const s = params.state;
  if (!["usd", "ngn", "usd-done"].includes(s)) notFound();
  const usd = s !== "ngn";
  return (
    <div className="min-h-screen bg-paper">
      <ScreenBand title="Get coins" sub={`Coin balance · 60 · Prices in ${usd ? "USD" : "naira"}`} back="/coins" />
      <GetCoins currency={usd ? "USD" : "NGN"} packs={usd ? USD : NGN} balance={s === "usd-done" ? 70 : 60} enabled added={s === "usd-done" ? 10 : null} paid={null} />
    </div>
  );
}

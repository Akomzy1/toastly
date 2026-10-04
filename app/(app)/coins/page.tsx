import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScreenBand } from "@/components/app/screen-band";
import { HelpButton } from "@/components/help/help-button";
import { CoinBalance, type LedgerRow } from "@/components/coins/coin-balance";
import { COIN_PACKS, TIER_LABELS } from "@/lib/entitlements";
import type { Tier } from "@/lib/types/profile";
import { paymentsConfigured } from "@/lib/payments/config";

export const metadata: Metadata = { title: "Coins", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Your coin balance (PRD §5.5; 0023). Closed-loop: never a cash balance. */
export default async function CoinsPage({ searchParams }: { searchParams: { paid?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: tierRow }, { data: total }, { data: stakeable }, { data: promo }, { data: cfg }, { data: rows }] = await Promise.all([
    supabase.rpc("current_tier", { p_profile_id: user.id }),
    supabase.rpc("coin_balance", { p_profile_id: user.id }),
    supabase.rpc("purchased_balance", { p_profile_id: user.id }),
    supabase.rpc("promo_balance", { p_profile_id: user.id }),
    supabase.from("coin_config").select("premium_coins, premium_plus_coins").maybeSingle(),
    supabase.from("coin_ledger").select("id, delta, kind, bucket, note, created_at").order("created_at", { ascending: false }).limit(30),
  ]);
  const tier = (tierRow as Tier | null) ?? "starter";

  return (
    <>
      <ScreenBand title="Coins" sub="Your balance and date stakes" />
      <CoinBalance
        total={(total as number | null) ?? 0}
        stakeable={Math.max(0, (stakeable as number | null) ?? 0)}
        promo={Math.max(0, (promo as number | null) ?? 0)}
        tierLabel={TIER_LABELS[tier]}
        diaspora={tier === "diaspora" || tier === "diaspora_plus"}
        premiumCoins={cfg?.premium_coins ?? 35}
        premiumPlusCoins={cfg?.premium_plus_coins ?? 70}
        packs={COIN_PACKS.map((p) => ({ id: p.id, coins: p.coins, price: p.price, note: p.note, currency: p.currency }))}
        history={(rows ?? []) as LedgerRow[]}
        buy={{ NGN: paymentsConfigured("paystack"), USD: paymentsConfigured("stripe") }}
        paid={searchParams.paid ?? null}
      />
      <div className="mx-auto w-full max-w-[680px] px-3.5 pb-8">
        <HelpButton />
      </div>
    </>
  );
}

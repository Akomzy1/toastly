import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScreenBand } from "@/components/app/screen-band";
import { GetCoins, type StorePack } from "@/components/coins/get-coins";
import { paymentsConfigured } from "@/lib/payments/config";
import { requireLiveProfile } from "@/lib/live-profile";
import { ProfileNotLive } from "@/components/app/profile-not-live";
import { paymentsOpenFor } from "@/lib/launch";

export const metadata: Metadata = { title: "Get coins", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Get coins (coins-get-usd.slim.html). Members abroad see dollar packs only
 * (card or Apple Pay); members in Nigeria see naira packs — nobody abroad is
 * quoted in naira (PRD §5.5). Prices come from price_list on the server.
 */
export default async function GetCoinsPage({ searchParams }: { searchParams: { paid?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // No payment UI before going live (PRD §7.3).
  const live = await requireLiveProfile(supabase);
  if (!live.live) return <ProfileNotLive status={live} />;
  const open = await paymentsOpenFor(supabase, user);

  const { data: profile } = await supabase.from("profiles").select("country_code").eq("id", user.id).maybeSingle();
  const currency: "NGN" | "USD" = (profile?.country_code ?? "NG") === "NG" ? "NGN" : "USD";

  const [{ data: packs }, { data: balance }] = await Promise.all([
    supabase.from("price_list").select("sku, coins, amount_minor").eq("kind", "coin_pack").eq("currency", currency).eq("active", true).order("coins"),
    supabase.rpc("coin_balance", { p_profile_id: user.id }),
  ]);

  // Back from checkout: the pack that just went through, if it has.
  let added: number | null = null;
  if (searchParams.paid === "1") {
    const since = new Date(Date.now() - 30 * 60_000).toISOString();
    const { data: last } = await supabase
      .from("payments")
      .select("coins")
      .eq("kind", "coin_pack")
      .eq("status", "succeeded")
      .gte("paid_at", since)
      .order("paid_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    added = last?.coins ?? null;
  }

  const fmt = (minor: number) =>
    currency === "USD" ? `$${(minor / 100).toFixed(minor % 100 ? 2 : 0)}` : `₦${(minor / 100).toLocaleString("en-NG")}`;
  const store: StorePack[] = (packs ?? []).map((p) => ({ sku: p.sku, coins: p.coins as number, price: fmt(p.amount_minor) }));
  const bal = Math.max(0, (balance as number | null) ?? 0);

  return (
    <>
      <ScreenBand title="Get coins" sub={`Coin balance · ${bal} · Prices in ${currency === "USD" ? "USD" : "naira"}`} back="/coins" />
      <GetCoins
        currency={currency}
        packs={store}
        balance={bal}
        enabled={open && paymentsConfigured(currency === "USD" ? "stripe" : "paystack")}
        closed={!open}
        added={added}
        paid={searchParams.paid ?? null}
      />
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Notice } from "@/components/ui/notice";
import { AppBand, AppColumn } from "@/components/app/app-band";
import { coinsOpen, COINS_HELD, historyLine, NO_REFUND } from "@/lib/coins";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Coin balance",
  robots: { index: false, follow: false },
};

/**
 * Coin balance — design/prototype/coins-balance.slim.html (Prompt 17).
 *
 * Never called a "wallet", in copy or in the URL. Coins are a closed loop:
 * spent on Toastly, staked on dates, never refunded or exchanged for money.
 *
 * ALWAYS OPEN: the balance is viewable and coins and plans can be bought
 * whatever the member's live status (decided 2026-10-05). Stakes and dates
 * are the parts that stay behind the live guard.
 */
export default async function CoinsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: own }, { data: bonus }, { data: entries }] = await Promise.all([
    supabase.rpc("stakeable_balance", { p_profile_id: user.id }),
    supabase.rpc("promotional_balance", { p_profile_id: user.id }),
    supabase
      .from("coin_ledger")
      .select("id, delta, kind, bucket, note, created_at, commitment_id")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  // Deliberately no date or member lookups: this page stays open whatever
  // the member's live status, so it reads only their own ledger. History
  // lines say "a date" rather than naming the other person (a deviation
  // from coins-balance, which names them).

  const ownN = Math.max(Number(own ?? 0), 0);
  const bonusN = Math.max(Number(bonus ?? 0), 0);
  const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(iso));
  const open = coinsOpen();

  return (
    <>
      <AppBand title="Coin balance" sub="Profile" backHref="/profile" />
      <AppColumn gap="gap-[18px]">
        {!open ? <Notice tone="info">{COINS_HELD}</Notice> : null}

        <div className="grid gap-3.5 rounded-xl bg-green-800 px-4 pb-1.5 pt-[18px] text-white">
          <div className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="12 12 24 24" fill="none" aria-hidden="true">
              <circle cx="24" cy="24" r="9.5" stroke="#FFB300" strokeWidth="3" />
            </svg>
            <p className="text-chip font-semibold uppercase tracking-[0.12em] text-champagne">Your coin balance</p>
          </div>
          <p className="flex items-baseline gap-2">
            <span className="font-serif text-[44px] font-bold leading-none tabular-nums">{ownN + bonusN}</span>
            <span className="text-ui text-white/[.76]">coins</span>
          </p>
          <div className="grid">
            {[
              ["Your coins", "Can be staked", ownN],
              ["Bonus coins", "Can't be staked", bonusN],
            ].map(([label, sub, n]) => (
              <div key={String(label)} className="flex items-center justify-between gap-3 border-t border-champagne/20 py-3">
                <span className="grid min-w-0 gap-0.5">
                  <span className="text-ui font-semibold">{label}</span>
                  <span className="text-[13px] text-white/70">{sub}</span>
                </span>
                <span className="text-[18px] font-semibold tabular-nums">{n}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-2.5">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(128px,1fr))] gap-2.5">
            <Link
              href="/coins/get"
              className="grid min-h-12 place-items-center rounded-lg bg-gold-500 px-2.5 py-3 text-center text-button text-green-800 no-underline hover:bg-gold-300"
            >
              Get coins
            </Link>
            <Link
              href="/coins/checkout?plan=premium"
              className="grid min-h-12 place-items-center rounded-lg border border-ink-900/20 px-2.5 py-3 text-center text-button text-ink-900 no-underline hover:border-green-500"
            >
              Use for Premium
            </Link>
          </div>
          <p className="px-0.5 text-[13px] leading-[1.55] text-grey-600">{NO_REFUND}</p>
        </div>

        <div className="grid gap-2.5">
          <p className="px-0.5 text-chip font-semibold uppercase tracking-[0.12em] text-grey-600">History</p>
          {entries?.length ? (
            <ul className="grid list-none overflow-hidden rounded-xl border border-ink-900/[.12] bg-white p-0">
              {entries.map((e, i) => (
                <li key={e.id} className={cn("flex items-center gap-3 px-3.5 py-3", i && "border-t border-ink-900/10")}>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="text-[14.5px] font-medium leading-[1.4] text-ink-900">
                      {historyLine(e)}
                    </span>
                    <span className="text-[12.5px] text-grey-400">
                      {day(e.created_at)}
                      {e.bucket === "promotional" && e.delta > 0 ? " · Bonus, can't be staked" : ""}
                    </span>
                  </span>
                  <span className={cn("flex-shrink-0 text-ui font-semibold tabular-nums", e.delta > 0 ? "text-green-500" : "text-grey-600")}>
                    {e.delta > 0 ? `+${e.delta}` : `−${Math.abs(e.delta)}`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-[14px] border border-ink-900/10 bg-white p-3.5 text-nav leading-[1.55] text-grey-600">
              Nothing here yet. When you get coins, stake them for a date, or they come back to you, each one shows up here.
            </p>
          )}
        </div>
      </AppColumn>
    </>
  );
}

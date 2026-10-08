"use client";

import { PAYMENTS_CLOSED } from "@/lib/launch";
import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { payWithCoins } from "@/app/(app)/coins/actions";
import { Notice } from "@/components/ui/notice";

/**
 * Your coin balance — PRD §5.5 (closed-loop: never withdrawn, refunded as
 * cash, or sent to another member by choice).
 *
 * NOT IN A PROTOTYPE — flagged (Prompt 17). Built from the in-app cards and
 * buttons until the coins design (Toastly-Coins-Attendance-Design-Prompt.md)
 * is exported. Buying a pack goes to Paystack (₦) or Stripe ($) hosted
 * checkout; the amount comes from price_list on the server.
 *
 * Copy rules: never "wallet", "escrow", "transfer" or "cash out" (a
 * constraint check enforces it), never "forfeit", "penalty" or "fine".
 */

export type LedgerRow = { id: string; delta: number; kind: string; bucket: string; note: string | null; created_at: string };

const LABEL: Record<string, string> = {
  purchase: "Bought coins",
  stake_hold: "Staked on a date",
  stake_return: "Your stake came back",
  stake_award: "They didn't make it — their coins are now in your balance.",
  stake_credit: "Date credit",
  subscription_spend: "Paid for your plan",
  promo_grant: "Gift coins",
  safety_restore: "Your stake came back after your report",
  award_reversal: "Coins returned after a safety report",
  refund: "Payment reversed",
  gist_top_up: "Extra Gist",
};

function labelFor(r: LedgerRow) {
  if (r.kind === "subscription_spend") return r.note === "premium_plus" ? "Paid for Premium Plus" : "Paid for Premium";
  if (r.kind === "promo_grant" && r.note) return `Gift coins · ${r.note}`;
  return LABEL[r.kind] ?? "Coins";
}

const CARD = "grid gap-3 rounded-xl border border-ink-900/[.12] bg-white px-[15px] py-4";
const LABEL_CAPS = "m-0 font-sans text-chip font-semibold uppercase tracking-[0.12em] text-grey-600";

function PayButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-12 w-full rounded-lg bg-gold-500 px-5 py-3.5 text-button text-green-800 transition-colors duration-200 hover:bg-gold-300 disabled:bg-grey-200 disabled:text-grey-600"
    >
      {pending ? "Paying…" : label}
    </button>
  );
}

const PAID: Record<string, { tone: "success" | "info"; text: string }> = {
  "1": { tone: "success", text: "Payment received. Your coins are in." },
  pending: { tone: "info", text: "Payment received — your coins can take a minute to show. Refresh shortly." },
  cancelled: { tone: "info", text: "No payment was taken." },
};

function PlanOffer({ tier, name, coins }: { tier: "premium" | "premium_plus"; name: string; coins: number }) {
  const [state, action] = useFormState(payWithCoins, null);
  return (
    <form action={action} className="grid gap-2.5 rounded-lg border border-ink-900/[.12] p-3.5">
      <input type="hidden" name="tier" value={tier} />
      <div className="flex items-baseline justify-between gap-3">
        <p className="m-0 text-ui font-semibold text-ink-900">{name}</p>
        <p className="m-0 text-ui text-grey-600">{coins} coins · 30 days</p>
      </div>
      {state?.ok ? <Notice tone="success">{state.ok}</Notice> : null}
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state?.shortfallCoins ? (
        <Notice tone="info">
          You need {state.shortfallCoins} more coins (₦{state.shortfallNaira?.toLocaleString("en-NG")}). Nothing was taken
          from your balance.
          <Link href="/profile/plan" className="mt-1 flex min-h-11 items-center font-semibold underline">
            Use your coins and pay the rest
          </Link>
        </Notice>
      ) : null}
      <PayButton label={`Use ${coins} coins`} />
    </form>
  );
}

export function CoinBalance({
  total,
  stakeable,
  promo,
  tierLabel,
  abroad,
  premiumCoins,
  premiumPlusCoins,
  history,
  paid = null,
  paymentsOpen = true,
}: {
  total: number;
  stakeable: number;
  promo: number;
  tierLabel: string;
  /** Lives outside Nigeria: dollar track. */
  abroad: boolean;
  premiumCoins: number;
  premiumPlusCoins: number;
  history: LedgerRow[];
  paid?: string | null;
  /** Before launch only the allow-list can buy (lib/launch.ts). */
  paymentsOpen?: boolean;
}) {
  const notice = paid ? PAID[paid] : null;
  return (
    <div className="mx-auto grid w-full max-w-[680px] content-start gap-4 px-3.5 pb-6 pt-4">
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      <div className={CARD}>
        <p className={LABEL_CAPS}>Your balance · {tierLabel}</p>
        <div className="flex items-baseline gap-2">
          <span className="font-serif text-[44px] font-bold leading-none text-ink-900">{total}</span>
          <span className="text-ui text-grey-600">coins</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="grid gap-0.5 rounded-lg bg-paper px-3 py-2.5">
            <span className="text-chip font-semibold uppercase tracking-[0.08em] text-grey-600">Can stake</span>
            <span className="font-serif text-[22px] font-bold text-ink-900">{stakeable}</span>
          </div>
          <div className="grid gap-0.5 rounded-lg bg-paper px-3 py-2.5">
            <span className="text-chip font-semibold uppercase tracking-[0.08em] text-grey-600">Gift coins</span>
            <span className="font-serif text-[22px] font-bold text-ink-900">{promo}</span>
          </div>
        </div>
        <p className="m-0 text-nav leading-[1.55] text-grey-600">
          You stake coins you bought when a date is confirmed. You both show up, you both get them back. If they
          don&rsquo;t make it, their coins come to you. Gift coins can be spent, but not staked.
        </p>
      </div>

      {/* Coins pay naira plans only, and members abroad are never quoted naira
          (CLAUDE.md, PRD §5.5) — so this card is for members in Nigeria. */}
      {!paymentsOpen ? <Notice tone="locked">{PAYMENTS_CLOSED}</Notice> : null}
      {paymentsOpen && !abroad ? (
        <div className={CARD}>
          <p className={LABEL_CAPS}>Pay for a plan with coins</p>
          <PlanOffer tier="premium" name="Premium" coins={premiumCoins} />
          <PlanOffer tier="premium_plus" name="Premium Plus" coins={premiumPlusCoins} />
          <p className="m-0 text-nav leading-[1.55] text-grey-600">Gift coins are used first. One coin counts as ₦100.</p>
        </div>
      ) : null}

      {paymentsOpen ? (
      <div className={CARD}>
        <p className={LABEL_CAPS}>Get coins</p>
        <p className="m-0 text-nav leading-[1.55] text-grey-600">
          {abroad ? "Packs priced in US dollars, by card or Apple Pay." : "Packs priced in naira, by card, bank or USSD."}
        </p>
        <Link
          href="/coins/get"
          className="grid min-h-12 place-items-center rounded-lg bg-gold-500 px-5 py-3.5 text-button text-green-800 no-underline hover:bg-gold-300"
        >
          Get coins
        </Link>
      </div>
      ) : null}

      <div className="grid gap-2.5">
        <p className={`${LABEL_CAPS} px-0.5`}>History</p>
        {history.length === 0 ? (
          <p className="m-0 rounded-[14px] border border-ink-900/10 bg-white p-3.5 text-nav text-grey-600">No coins yet.</p>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0">
            {history.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 rounded-[14px] border border-ink-900/10 bg-white px-3.5 py-3">
                <span className="grid min-w-0 gap-0.5">
                  <span className="text-nav leading-[1.45] text-ink-900">{labelFor(r)}</span>
                  <span className="text-chip text-grey-400">
                    {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    {r.bucket === "promotional" ? " · gift" : ""}
                  </span>
                </span>
                <span className={`flex-shrink-0 text-ui font-semibold ${r.delta > 0 ? "text-success" : "text-ink-900"}`}>
                  {r.delta > 0 ? `+${r.delta}` : r.delta}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

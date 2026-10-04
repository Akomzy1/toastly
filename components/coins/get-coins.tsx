"use client";

import * as React from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { checkout, type PlanState } from "@/app/(app)/profile/plan/actions";
import { Notice } from "@/components/ui/notice";

/**
 * Get coins — built against design/prototype/coins-get-usd.slim.html.
 *
 * Members abroad: dollar packs, card or Apple Pay. Nothing preselected, no
 * badges, and the no-refund line directly above the pay button. Both methods
 * open Stripe's hosted checkout, where Apple Pay appears on devices that
 * support it.
 *
 * Adapted, flagged: members in Nigeria get the same screen with naira packs
 * and "Card" / "Bank or USSD" (Paystack) — the prototype draws the USD store
 * only. The pack list is the price list's, so the naira store shows the two
 * naira packs that exist.
 */

export type StorePack = { sku: string; coins: number; price: string };

function sel(on: boolean) {
  return on ? "border-green-500 bg-green-50" : "border-ink-900/[.14] bg-white";
}

function Dot({ on }: { on: boolean }) {
  return (
    <span className={`grid h-5 w-5 flex-shrink-0 place-items-center rounded-pill border ${on ? "border-green-500 bg-green-500" : "border-ink-900/[.22]"}`}>
      {on ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </span>
  );
}

function Coin({ size = 20, color = "#CC8F00" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth="2.7" />
    </svg>
  );
}

function Pay({ ready, label }: { ready: boolean; label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={!ready || pending}
      className={`min-h-12 rounded-xl border-0 px-5 py-3.5 text-button ${
        ready ? "bg-gold-500 text-green-800 hover:bg-gold-300" : "cursor-not-allowed bg-grey-200 text-grey-600"
      }`}
    >
      {pending ? "Opening checkout…" : label}
    </button>
  );
}

export function GetCoins({
  currency,
  packs,
  balance,
  enabled,
  added,
  paid,
}: {
  currency: "NGN" | "USD";
  packs: StorePack[];
  balance: number;
  enabled: boolean;
  added: number | null;
  paid: string | null;
}) {
  const [state, action] = useFormState<PlanState, FormData>(checkout, null);
  const [pack, setPack] = React.useState<number | null>(null);
  const [method, setMethod] = React.useState<number | null>(null);

  const methods =
    currency === "USD"
      ? [
          { key: "card", label: "Card", sub: "Visa, Mastercard or Amex" },
          { key: "apple", label: "Apple Pay", sub: "Confirm with Face ID or Touch ID" },
        ]
      : [
          { key: "card", label: "Card", sub: "Visa, Mastercard or Verve" },
          { key: "bank", label: "Bank or USSD", sub: "Pay from your bank app or with a USSD code" },
        ];

  if (added !== null) {
    return (
      <div className="mx-auto grid w-full max-w-[680px] content-start gap-3.5 px-3.5 pb-6 pt-[18px]">
        <div className="grid justify-items-start gap-3 rounded-2xl border border-ink-900/[.12] bg-white px-4 py-[22px]">
          <span className="grid h-12 w-12 place-items-center rounded-pill bg-gold-50">
            <Coin size={26} />
          </span>
          <h2 className="m-0 font-serif text-[22px] font-bold leading-[1.25] text-ink-900">{added} coins added</h2>
          <p className="m-0 text-ui leading-[1.6] text-grey-600 [text-wrap:pretty]">
            They&rsquo;re in Your coins, ready to stake on a date or spend on Toastly.
          </p>
          <div className="flex w-full justify-between gap-2.5 rounded-xl bg-paper p-3">
            <span className="text-[13.5px] text-grey-600">Coin balance</span>
            <span className="text-[14px] font-semibold tabular-nums text-ink-900">{balance} coins</span>
          </div>
        </div>
        <Link
          href="/coins"
          className="grid min-h-12 place-items-center rounded-xl bg-gold-500 px-5 py-3.5 text-button text-green-800 no-underline hover:bg-gold-300"
        >
          Back to coin balance
        </Link>
      </div>
    );
  }

  const ready = pack !== null && method !== null && enabled;
  const payLabel = !enabled ? "Not available yet" : pack === null ? "Choose a pack" : method === null ? "Choose how to pay" : `Pay ${packs[pack].price}`;

  return (
    <form action={action} className="mx-auto grid w-full max-w-[680px] content-start gap-5 px-3.5 pb-6 pt-[18px]">
      <input type="hidden" name="mode" value="pack" />
      <input type="hidden" name="sku" value={pack !== null ? packs[pack].sku : ""} />
      <input type="hidden" name="method" value={method !== null ? methods[method].key : ""} />

      {paid === "pending" ? <Notice tone="info">Payment received — your coins can take a minute to show. Refresh shortly.</Notice> : null}
      {paid === "cancelled" ? <Notice tone="info">No payment was taken.</Notice> : null}
      {!enabled ? (
        <Notice tone="locked">
          {currency === "USD" ? "Dollar payments aren’t connected here yet." : "Naira payments aren’t connected here yet."}
        </Notice>
      ) : null}

      <div role="radiogroup" aria-label="Choose a pack" className="grid gap-2.5">
        <p className="m-0 px-0.5 text-chip font-semibold uppercase tracking-[0.12em] text-grey-600">Choose a pack</p>
        <div className="grid grid-cols-2 gap-2.5">
          {packs.map((p, i) => (
            <button
              key={p.sku}
              type="button"
              role="radio"
              aria-checked={pack === i}
              onClick={() => setPack(i)}
              className={`grid min-h-[104px] cursor-pointer content-center justify-items-start gap-2 rounded-[14px] border px-3 py-3.5 text-left ${sel(pack === i)}`}
            >
              <span className="flex items-baseline gap-1.5">
                <span className="font-serif text-[26px] font-bold leading-none tabular-nums text-ink-900">{p.coins}</span>
                <span className="text-[14px] text-grey-600">coins</span>
              </span>
              <span className="text-[16px] font-semibold tabular-nums text-ink-900">{p.price}</span>
            </button>
          ))}
        </div>
        <p className="m-0 px-0.5 text-nav leading-[1.55] text-grey-600">Coins you buy go into Your coins, so they can be staked.</p>
      </div>

      <div role="radiogroup" aria-label="Pay with" className="grid gap-2.5">
        <p className="m-0 px-0.5 text-chip font-semibold uppercase tracking-[0.12em] text-grey-600">Pay with</p>
        {methods.map((m, i) => (
          <button
            key={m.key}
            type="button"
            role="radio"
            aria-checked={method === i}
            onClick={() => setMethod(i)}
            className={`flex min-h-[60px] w-full cursor-pointer items-center gap-3 rounded-[14px] border px-[13px] py-3 text-left ${sel(method === i)}`}
          >
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="text-ui font-semibold text-ink-900">{m.label}</span>
              <span className="text-nav leading-[1.45] text-grey-600">{m.sub}</span>
            </span>
            <Dot on={method === i} />
          </button>
        ))}
      </div>

      <div className="grid gap-2.5">
        {/* PRD §5.5: the no-refund terms, before payment, every time. */}
        <div className="flex items-start gap-3 rounded-[14px] border border-gold-600/[.32] bg-gold-50 p-3.5">
          <span className="mt-px flex-shrink-0">
            <Coin />
          </span>
          <span className="grid gap-[3px]">
            <span className="text-[14px] font-semibold text-ink-900">Before you pay</span>
            <span className="text-[14px] leading-[1.55] text-ink-800 [text-wrap:pretty]">
              Coins can be spent on Toastly. They can&rsquo;t be refunded or exchanged for money.
            </span>
          </span>
        </div>
        {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
        <Pay ready={ready} label={payLabel} />
      </div>
    </form>
  );
}

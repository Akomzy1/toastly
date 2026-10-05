"use client";

import * as React from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { buyCoins } from "../actions";
import { Choice } from "../choice";
import { Notice } from "@/components/ui/notice";
import { AppBand, AppColumn } from "@/components/app/app-band";
import { NO_REFUND, PACKS, PAY_METHODS } from "@/lib/coins";
import { cn } from "@/lib/utils";

function Pay({ label, ready }: { label: string; ready: boolean }) {
  const { pending } = useFormStatus();
  const on = ready && !pending;
  return (
    <button
      type="submit"
      disabled={!on}
      className={cn("min-h-12 w-full rounded-lg px-5 py-3.5 text-button", on ? "bg-green-500 text-white hover:bg-green-600" : "cursor-not-allowed bg-grey-200 text-grey-600")}
    >
      {pending ? "Paying…" : label}
    </button>
  );
}

export function GetCoins({ currency, balance }: { currency: "NGN" | "USD"; balance: number }) {
  const [state, action] = useFormState(buyCoins, null);
  const [pack, setPack] = React.useState<string | null>(null);
  const [method, setMethod] = React.useState<string | null>(null);
  const p = PACKS[currency].find((x) => x.id === pack);

  if (state?.ok === "added") {
    return (
      <>
        <AppBand title="Get coins" sub={`Coin balance · ${balance}`} backHref="/coins" />
        <AppColumn>
          <div role="status" className="grid justify-items-start gap-2.5 rounded-xl border border-ink-900/[.12] bg-white p-4">
            <h2 className="font-serif text-[24px] font-bold leading-[1.2] text-ink-900">{state.coins} coins added</h2>
            <p className="text-ui leading-[1.6] text-ink-800">They&rsquo;re in Your coins, ready to stake on a date or spend on Toastly.</p>
            <div className="flex w-full items-baseline justify-between border-t border-ink-900/10 pt-3">
              <span className="text-nav text-grey-600">Coin balance</span>
              <span className="text-ui font-semibold tabular-nums">{balance} coins</span>
            </div>
          </div>
          <Link href="/coins" className="grid min-h-12 place-items-center rounded-lg border border-ink-900/20 text-button text-ink-900 no-underline">
            Back to coin balance
          </Link>
        </AppColumn>
      </>
    );
  }

  return (
    <>
      <AppBand title="Get coins" sub={`Coin balance · ${balance}`} backHref="/coins" />
      <AppColumn>
        <form action={action} className="grid gap-6">
          <div className="grid gap-2.5">
            <Choice
              label="Choose a pack"
              name="pack"
              value={pack}
              onChange={setPack}
              options={PACKS[currency].map((x) => ({ id: x.id, title: `${x.coins} coins`, aside: x.price }))}
            />
            <p className="px-0.5 text-[13px] text-grey-600">Coins you buy go into Your coins, so they can be staked.</p>
          </div>
          <Choice
            label="Pay with"
            name="method"
            value={method}
            onChange={setMethod}
            options={PAY_METHODS[currency].map((m) => ({ id: m.id, title: m.label, sub: m.sub }))}
          />
          <div className="grid gap-3">
            <div className="grid gap-0.5 rounded-lg border border-ink-900/[.12] bg-white px-[13px] py-3">
              <span className="text-nav font-semibold text-ink-900">Before you pay</span>
              <span className="text-[13px] leading-[1.5] text-grey-600">{NO_REFUND}</span>
            </div>
            {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
            <Pay
              ready={Boolean(pack && method)}
              label={pack && method && p ? `Pay ${p.price}` : !pack ? "Choose a pack" : "Choose how to pay"}
            />
          </div>
        </form>
      </AppColumn>
    </>
  );
}

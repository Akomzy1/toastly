"use client";

import * as React from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { payPlanWithCoins } from "../actions";
import { Choice } from "../choice";
import { Notice } from "@/components/ui/notice";
import { AppBand, AppColumn } from "@/components/app/app-band";
import { PAY_METHODS, PLANS, type PlanKey } from "@/lib/coins";
import { cn } from "@/lib/utils";

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

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

export function Checkout({ plan, coinsUsed, nairaLeft }: { plan: PlanKey; coinsUsed: number; nairaLeft: number | null }) {
  const [state, action] = useFormState(payPlanWithCoins, null);
  const [method, setMethod] = React.useState<string | null>(null);
  const p = PLANS[plan];
  const dollar = plan === "diaspora";
  const left = dollar ? p.price : naira(nairaLeft ?? p.naira ?? 0);
  const fullyCovered = !dollar && nairaLeft === 0;
  const ready = fullyCovered || Boolean(method);
  const renews = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(
    new Date(Date.now() + 30 * 86400e3),
  );

  if (state?.ok === "paid") {
    return (
      <>
        <AppBand title="Checkout" sub={`${p.name} · ${p.track}`} />
        <AppColumn>
          <div role="status" className="grid gap-2.5 rounded-xl border border-ink-900/[.12] bg-white p-4">
            <p className="text-nav font-semibold text-green-550">{p.name} is on</p>
            <h2 className="font-serif text-[24px] font-bold leading-[1.2] text-ink-900">
              {coinsUsed > 0 ? `${coinsUsed} coins used${fullyCovered ? "." : ` and ${left} paid.`}` : `${left} paid.`}
            </h2>
            <p className="text-ui leading-[1.6] text-ink-800">It renews on {renews}. You can cancel from Profile at any time.</p>
          </div>
          <Link href="/coins" className="grid min-h-12 place-items-center rounded-lg border border-ink-900/20 text-button text-ink-900 no-underline">
            See coin balance
          </Link>
          <Link href="/feed" className="grid min-h-12 place-items-center rounded-lg text-button text-green-500 no-underline">
            Back to today&rsquo;s six
          </Link>
        </AppColumn>
      </>
    );
  }

  return (
    <>
      <AppBand title="Checkout" sub={`${p.name} · ${p.track}`} backHref="/coins" />
      <AppColumn>
        <form action={action} className="grid gap-6">
          <input type="hidden" name="plan" value={plan} />
          <div className="grid gap-3 rounded-xl border border-ink-900/[.12] bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-[24px] font-bold leading-[1.2] text-ink-900">{p.name}</h2>
              <p className="text-ui text-grey-600">
                <span className="font-semibold text-ink-900">{p.price}</span> /month
              </p>
            </div>
            <p className="text-nav leading-[1.55] text-grey-600">{p.for}</p>
            <div className="grid gap-2 border-t border-ink-900/10 pt-3 text-ui">
              <div className="flex justify-between gap-3">
                <span>{p.name} · 1 month</span>
                <span className="tabular-nums">{p.price}</span>
              </div>
              {!dollar ? (
                <div className="flex justify-between gap-3 text-green-550">
                  <span>Coins applied</span>
                  <span className="tabular-nums">{coinsUsed} coins</span>
                </div>
              ) : null}
              <div className="flex justify-between gap-3 border-t border-ink-900/10 pt-2 font-semibold">
                <span>Left to pay</span>
                <span className="tabular-nums">{left}</span>
              </div>
            </div>
          </div>

          {!dollar && coinsUsed > 0 ? (
            <div className="grid gap-0.5 rounded-lg border border-green-500/[.24] bg-green-50 px-[13px] py-3">
              <span className="text-nav font-semibold text-ink-900">
                {coinsUsed} coins applied · {left} left to pay.
              </span>
              <span className="text-[13px] text-grey-600">Your whole coin balance of {coinsUsed} is used first.</span>
            </div>
          ) : null}

          {!fullyCovered ? (
            <Choice
              label={dollar ? "Choose how to pay" : "Pay the rest with"}
              name="method"
              value={method}
              onChange={setMethod}
              options={PAY_METHODS[dollar ? "USD" : "NGN"].map((m) => ({ id: m.id, title: m.label, sub: m.sub }))}
            />
          ) : null}

          <div className="grid gap-2.5">
            {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
            <Pay ready={ready && !dollar} label={fullyCovered ? "Use my coins" : ready ? `Pay ${left}` : "Choose how to pay"} />
            {dollar ? (
              <p className="text-[13px] text-grey-600">
                Coins can be used on Naira plans. Diaspora plans are billed in USD.
              </p>
            ) : null}
          </div>
        </form>
      </AppColumn>
    </>
  );
}

"use client";

import { DIASPORA_USD, usd } from "@/lib/plan-numbers";
import * as React from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { savePool, type PoolState } from "@/app/(app)/profile/pool/actions";
import { Notice } from "@/components/ui/notice";

/**
 * Your match pool — built against design/prototype/pool-choice.slim.html.
 *
 * Back home is open on every plan. On a Diaspora plan all three options are
 * selectable, and if the city isn't open the diaspora option carries a quiet
 * note. On a free or naira plan the two diaspora options stay visible at full
 * strength, tagged "Diaspora plans", with one line and one button underneath.
 * No pop-up, no red. The rule itself is the database's (set_match_pool and
 * build_daily_feed, 0026).
 *
 * One addition, flagged: a member abroad with no diaspora city chosen yet is
 * told where to choose it (the prototype assumes a city).
 */

type Pool = "back_home" | "diaspora" | "both";

function Save({ changed }: { changed: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={!changed || pending}
      className={`min-h-12 rounded-xl border-0 px-5 py-3.5 text-button transition-colors duration-200 ${
        changed ? "bg-gold-500 text-green-800 hover:bg-gold-300" : "cursor-default bg-grey-200 text-grey-600"
      }`}
    >
      {pending ? "Saving…" : changed ? "Save" : "Saved"}
    </button>
  );
}

function Dot({ on }: { on: boolean }) {
  return (
    <span
      className={`grid h-5 w-5 flex-shrink-0 place-items-center rounded-pill border ${
        on ? "border-green-500 bg-green-500" : "border-ink-900/[.22] bg-transparent"
      }`}
    >
      {on ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </span>
  );
}

export function PoolChoice({
  city,
  hasCity,
  diasporaPlan,
  cityOpen,
  current,
  live = true,
}: {
  city: string;
  hasCity: boolean;
  diasporaPlan: boolean;
  cityOpen: boolean;
  current: Pool;
  /** Not live yet: no plan offer (PRD §7.3). */
  live?: boolean;
}) {
  const [state, action] = useFormState<PoolState, FormData>(savePool, null);
  const [pool, setPool] = React.useState<Pool>(current);
  const [saved, setSaved] = React.useState<Pool>(current);
  const [toast, setToast] = React.useState(false);

  React.useEffect(() => {
    if (state?.ok) {
      setSaved(pool);
      setToast(true);
      const t = setTimeout(() => setToast(false), 4000);
      return () => clearTimeout(t);
    }
    // Only when a save completes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const options: { key: Pool; label: string; sub: string }[] = [
    { key: "back_home", label: "Back home", sub: "Verified singles in Nigeria. Open on every plan." },
    { key: "diaspora", label: "My diaspora community", sub: `Nigerians living in ${city}.` },
    { key: "both", label: "Both", sub: `Back home and ${city}, mixed into your six a day.` },
  ];

  return (
    <form action={action} className="mx-auto grid w-full max-w-[680px] content-start gap-[18px] px-3.5 pb-6 pt-[18px]">
      <input type="hidden" name="pool" value={pool} />
      <p className="m-0 px-0.5 text-ui leading-[1.6] text-ink-800 [text-wrap:pretty]">
        Choose who shows up in your six a day. You can change this any time.
      </p>

      <div role="radiogroup" aria-label="Match pool" className="grid gap-2.5">
        {options.map((o) => {
          const planOnly = !diasporaPlan && o.key !== "back_home";
          const on = pool === o.key && !planOnly;
          return (
            <div
              key={o.key}
              className={`grid overflow-hidden rounded-[14px] border ${on ? "border-green-500 bg-green-50" : "border-ink-900/[.14] bg-white"}`}
            >
              {planOnly ? (
                <div role="radio" aria-checked="false" aria-disabled="true" className="flex min-h-[68px] items-center gap-3 p-[13px]">
                  <span className="grid min-w-0 flex-1 gap-[3px]">
                    <span className="text-ui font-semibold text-ink-900">{o.label}</span>
                    <span className="text-nav leading-[1.5] text-grey-600 [text-wrap:pretty]">{o.sub}</span>
                  </span>
                  <span className="flex-shrink-0 whitespace-nowrap rounded-pill border border-gold-600/35 bg-gold-50 px-2.5 py-[5px] text-chip font-semibold text-gold-800">
                    Diaspora plans
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setPool(o.key)}
                  className="flex min-h-[68px] w-full cursor-pointer items-center gap-3 border-0 bg-transparent p-[13px] text-left"
                >
                  <span className="grid min-w-0 flex-1 gap-[3px]">
                    <span className="text-ui font-semibold text-ink-900">{o.label}</span>
                    <span className="text-nav leading-[1.5] text-grey-600 [text-wrap:pretty]">{o.sub}</span>
                  </span>
                  <Dot on={on} />
                </button>
              )}
              {diasporaPlan && o.key === "diaspora" && (!cityOpen || !hasCity) ? (
                <div className="mx-[13px] mb-[13px] flex items-start gap-[9px] rounded-[10px] bg-green-50 px-[11px] py-2.5">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-0.5 flex-shrink-0">
                    <circle cx="12" cy="12" r="8.6" stroke="#00695C" strokeWidth="1.5" />
                    <path d="M12 7.5V12l3 2" stroke="#00695C" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <span className="text-nav leading-[1.55] text-green-550 [text-wrap:pretty]">
                    {hasCity ? (
                      <>Opening in {city} soon — you&rsquo;ll get back-home matches until then.</>
                    ) : (
                      <>
                        Choose your city to match within it — you&rsquo;ll get back-home matches until then.
                        <Link href="/profile/edit" className="mt-1 flex min-h-11 items-center font-semibold underline">
                          Choose your city in Edit profile
                        </Link>
                      </>
                    )}
                  </span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {!diasporaPlan && !live ? null : !diasporaPlan ? (
        <div className="grid gap-3 rounded-[14px] border border-ink-900/[.12] bg-white px-3.5 py-[15px]">
          <p className="m-0 text-[14.5px] leading-[1.6] text-ink-800 [text-wrap:pretty]">
            Match with Nigerians in your city on a Diaspora plan, from {usd(DIASPORA_USD)} a month.
          </p>
          <Link
            href="/profile/plan"
            className="grid min-h-12 place-items-center rounded-xl border border-ink-900/20 px-[18px] py-3 text-button text-ink-900 no-underline hover:border-green-500 hover:bg-green-50"
          >
            See Diaspora plans
          </Link>
        </div>
      ) : (
        <div className="grid gap-2.5">
          {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
          <Save changed={pool !== saved} />
        </div>
      )}

      {toast ? (
        <div
          role="status"
          className="fixed inset-x-3.5 bottom-[calc(72px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-[652px] rounded-xl bg-green-800 px-4 py-3.5 text-nav font-medium text-white lg:bottom-6"
        >
          Pool saved. Tomorrow&rsquo;s six will reflect it.
        </div>
      ) : null}
    </form>
  );
}

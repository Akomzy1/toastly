"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { MatchPool } from "@/lib/types/profile";
import { savePool } from "./actions";

/**
 * Choose your pool — members abroad. Built against
 * design/prototype/pool-choice.slim.html.
 *
 * Back home is open on every plan. On a Diaspora plan all three are
 * selectable, and if the city isn't open yet the diaspora option carries a
 * quiet note. Without a Diaspora plan the two diaspora options stay visible
 * at full strength, tagged as Diaspora-plan options, with one line and one
 * button underneath. No pop-up, no red.
 */
export function PoolChoice({
  initial,
  city,
  cityChosen,
  diasporaPlan,
  cityOpen,
}: {
  initial: MatchPool;
  city: string;
  cityChosen: boolean;
  diasporaPlan: boolean;
  cityOpen: boolean;
}) {
  const start: MatchPool = diasporaPlan ? initial : "back_home";
  const [pool, setPool] = useState<MatchPool>(start);
  const [savedPool, setSavedPool] = useState<MatchPool>(start);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const options: { key: MatchPool; label: string; sub: string }[] = [
    { key: "back_home", label: "Back home", sub: "Verified singles in Nigeria. Open on every plan." },
    { key: "diaspora", label: "My diaspora community", sub: `Nigerians living in ${city}.` },
    { key: "both", label: "Both", sub: `Back home and ${city}, mixed into your six a day.` },
  ];

  const changed = pool !== savedPool;

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await savePool(pool);
      if (r.error) {
        setError(r.error);
        return;
      }
      setSavedPool(pool);
      setSaved(true);
    });
  }

  return (
    <div className="relative grid content-start gap-[18px]">
      <p className="px-0.5 text-ui leading-[1.6] text-ink-800">
        Choose who shows up in your six a day. You can change this any time.
      </p>

      <div role="radiogroup" aria-label="Match pool" className="grid gap-2.5">
        {options.map((o) => {
          const planOnly = !diasporaPlan && o.key !== "back_home";
          const on = pool === o.key && !planOnly;
          // No city chosen yet: nothing can open, so say what's missing
          // rather than promising a city "soon". Not in the prototype.
          const note = diasporaPlan && o.key === "diaspora" && (!cityChosen || !cityOpen);
          return (
            <div
              key={o.key}
              className={`grid overflow-hidden rounded-[14px] border ${on ? "border-green-500 bg-green-50" : "border-ink-900/[.14] bg-white"}`}
            >
              {planOnly ? (
                <div role="radio" aria-checked="false" aria-disabled="true" className="flex min-h-[68px] items-center gap-3 p-[13px]">
                  <span className="grid min-w-0 flex-1 gap-[3px]">
                    <span className="text-ui font-semibold text-ink-900">{o.label}</span>
                    <span className="text-[13px] leading-[1.5] text-grey-600">{o.sub}</span>
                  </span>
                  <span className="flex-shrink-0 whitespace-nowrap rounded-pill border border-gold-600/35 bg-gold-50 px-2.5 py-[5px] text-[12px] font-semibold text-gold-800">
                    Diaspora plans
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    setPool(o.key);
                    setSaved(false);
                  }}
                  className="flex min-h-[68px] w-full items-center gap-3 border-0 bg-transparent p-[13px] text-left"
                >
                  <span className="grid min-w-0 flex-1 gap-[3px]">
                    <span className="text-ui font-semibold text-ink-900">{o.label}</span>
                    <span className="text-[13px] leading-[1.5] text-grey-600">{o.sub}</span>
                  </span>
                  <span
                    className={`grid h-5 w-5 flex-shrink-0 place-items-center rounded-pill border ${on ? "border-green-500 bg-green-500" : "border-ink-900/[.22] bg-transparent"}`}
                  >
                    {on ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M5 12.5l4.5 4.5L19 7" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : null}
                  </span>
                </button>
              )}
              {note ? (
                <div className="mx-[13px] mb-[13px] flex items-start gap-[9px] rounded-[10px] bg-green-50 px-[11px] py-2.5">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-0.5 flex-shrink-0">
                    <circle cx="12" cy="12" r="8.6" stroke="#00695C" strokeWidth="1.5" />
                    <path d="M12 7.5V12l3 2" stroke="#00695C" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <span className="text-[13px] leading-[1.55] text-green-700">
                    {cityChosen ? (
                      <>Opening in {city} soon — you&rsquo;ll get back-home matches until then.</>
                    ) : (
                      <>
                        Choose your city in <Link href="/profile">your profile</Link> first — you&rsquo;ll get
                        back-home matches until then.
                      </>
                    )}
                  </span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {diasporaPlan ? (
        <div className="grid gap-2.5">
          <button
            type="button"
            onClick={save}
            disabled={!changed || pending}
            className={`min-h-12 rounded-lg border-0 px-5 py-3.5 text-ui font-semibold ${changed ? "cursor-pointer bg-gold-500 text-green-800" : "cursor-default bg-grey-200 text-grey-600"}`}
          >
            {changed ? "Save" : "Saved"}
          </button>
          {error ? (
            <p role="alert" className="text-[13px] text-grey-600">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-3 rounded-[14px] border border-ink-900/[.12] bg-white px-3.5 py-[15px]">
          <p className="text-[14.5px] leading-[1.6] text-ink-800">
            Match with Nigerians in your city on a Diaspora plan, from $15 a month.
          </p>
          <Link
            href="/pricing"
            className="grid min-h-12 place-items-center rounded-lg border border-ink-900/20 px-[18px] py-3 text-ui font-semibold text-ink-900 no-underline transition-colors hover:border-green-500 hover:bg-green-50 hover:text-ink-900"
          >
            See Diaspora plans
          </Link>
        </div>
      )}

      {saved ? (
        <div role="status" className="rounded-lg bg-green-800 px-4 py-3.5 text-[14px] font-medium text-white">
          Pool saved. Tomorrow&rsquo;s six will reflect it.
        </div>
      ) : null}
    </div>
  );
}

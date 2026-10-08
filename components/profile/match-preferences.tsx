"use client";

import * as React from "react";
import Link from "next/link";
import { setAgeRange, setOpenToAbroad } from "@/app/(app)/profile/preferences/actions";
import { Notice } from "@/components/ui/notice";

/**
 * Match preferences — built against design/prototype/match-preferences.slim.html.
 *
 * Age range: a two-handle slider, set in place, free on every plan with no
 * lock or badge. 18 to 70+, starting from a range around the member's own
 * age (match_config, 0027). Handles are 44px targets and move a year per
 * arrow key. It filters the member's own six only.
 *
 * "Open to people living abroad" keeps its approved switch; its explanation
 * now says it works both ways (decided 5 October 2026). Members in Nigeria
 * only.
 *
 * Addition, flagged: the prototype draws the Nigeria version. Members abroad
 * see the same age range and City, and a "Your match pool" row in place of
 * the switch, leading to the pool-choice screen.
 */
export function MatchPreferences({
  city,
  openToAbroad,
  abroad,
  age,
}: {
  city: string | null;
  openToAbroad: boolean;
  abroad: boolean;
  age: { lo: number; hi: number; floor: number; cap: number };
}) {
  const [on, setOn] = React.useState(openToAbroad);
  const [error, setError] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();

  function toggle() {
    const next = !on;
    setOn(next);
    setError(null);
    startTransition(async () => {
      const r = await setOpenToAbroad(next);
      if (r.error) {
        setOn(!next);
        setError(r.error);
      }
    });
  }

  const rowRule = "border-t border-ink-900/10";
  return (
    <div className="mx-auto grid w-full max-w-[680px] content-start gap-2.5 px-3.5 pb-6 pt-[18px]">
      <p className="m-0 mx-0.5 text-chip font-semibold uppercase tracking-[0.12em] text-grey-600">Who you see</p>
      <div className="grid rounded-2xl border border-ink-900/[.12] bg-white">
        <AgeRange initial={age} onError={setError} />
        <Link
          href="/profile/edit"
          className={`flex min-h-14 items-center justify-between gap-3 px-[15px] py-3 text-inherit no-underline ${rowRule}`}
        >
          <span className="text-ui font-medium text-ink-900">City</span>
          <span className="flex min-w-0 items-center gap-2 text-[14px] text-grey-600">
            {city || "Add your city"}{" "}
            <span aria-hidden="true" className="text-[16px] text-grey-400">
              ›
            </span>
          </span>
        </Link>
        {abroad ? (
          <Link
            href="/profile/pool"
            className={`flex min-h-14 items-center justify-between gap-3 rounded-b-2xl px-[15px] py-3 text-inherit no-underline ${rowRule}`}
          >
            <span className="text-ui font-medium text-ink-900">Your match pool</span>
            <span aria-hidden="true" className="text-[16px] text-grey-400">
              ›
            </span>
          </Link>
        ) : (
          <button
            type="button"
            role="switch"
            aria-checked={on}
            onClick={toggle}
            className={`flex min-h-16 w-full cursor-pointer items-center gap-3.5 rounded-b-2xl border-0 bg-transparent px-[15px] py-3.5 text-left ${rowRule}`}
          >
            <span className="grid min-w-0 flex-1 gap-[3px]">
              <span className="text-ui font-medium text-ink-900">Open to people living abroad</span>
              <span className="text-[13.5px] leading-[1.5] text-grey-600 [text-wrap:pretty]">
                When this is off, you won&apos;t see Nigerians living abroad — and they won&apos;t see you.
              </span>
            </span>
            <span
              aria-hidden="true"
              className={`relative h-7 w-12 flex-shrink-0 rounded-pill transition-colors duration-200 ${on ? "bg-green-500" : "bg-grey-400"}`}
            >
              <span
                className={`absolute top-[3px] h-[22px] w-[22px] rounded-pill bg-white shadow-[0_1px_3px_rgba(5,3,9,0.3)] transition-[left] duration-200 ${
                  on ? "left-[23px]" : "left-[3px]"
                }`}
              />
            </span>
          </button>
        )}
      </div>
      {/* Addition, flagged: the way into Filters (premium-filters.slim.html;
          PRD §5.2.4) — a row in this card's own pattern. */}
      <div className="grid rounded-xl border border-ink-900/[.12] bg-white">
        {/* Addition, flagged (0036): who you'd like to meet, in the same row pattern. */}
        <Link href="/profile/about-you" className="flex min-h-14 items-center justify-between gap-3 border-b border-ink-900/10 px-[15px] py-3 text-inherit no-underline">
          <span className="grid min-w-0 gap-[3px]">
            <span className="text-ui font-medium text-ink-900">Who you&rsquo;d like to meet</span>
            <span className="text-[13.5px] leading-[1.5] text-grey-600">You only meet people who&rsquo;d like to meet you too</span>
          </span>
          <span aria-hidden="true" className="text-[16px] text-grey-400">
            ›
          </span>
        </Link>
        <Link href="/profile/filters" className="flex min-h-14 items-center justify-between gap-3 px-[15px] py-3 text-inherit no-underline">
          <span className="grid min-w-0 gap-[3px]">
            <span className="text-ui font-medium text-ink-900">Filters</span>
            <span className="text-[13.5px] leading-[1.5] text-grey-600">Religion and tribe, on your own six</span>
          </span>
          <span aria-hidden="true" className="text-[16px] text-grey-400">
            ›
          </span>
        </Link>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </div>
  );
}

const KEYS: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -5, PageUp: 5 };

function AgeRange({
  initial,
  onError,
}: {
  initial: { lo: number; hi: number; floor: number; cap: number };
  onError: (e: string | null) => void;
}) {
  const { floor: MIN, cap: MAX } = initial;
  const [lo, setLo] = React.useState(initial.lo);
  const [hi, setHi] = React.useState(initial.hi);
  const track = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<"lo" | "hi" | null>(null);
  const saved = React.useRef({ lo: initial.lo, hi: initial.hi });
  const timer = React.useRef<number>();
  const latest = React.useRef({ lo, hi });
  latest.current = { lo, hi };

  // Saved in place a moment after the member stops moving a handle.
  const save = React.useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const { lo: l, hi: h } = latest.current;
      if (l === saved.current.lo && h === saved.current.hi) return;
      const r = await setAgeRange(l, h);
      if (r.error) onError(r.error);
      else {
        saved.current = { lo: l, hi: h };
        onError(null);
      }
    }, 600);
  }, [onError]);

  const clampLo = (v: number) => Math.max(MIN, Math.min(latest.current.hi - 1, v));
  const clampHi = (v: number) => Math.min(MAX, Math.max(latest.current.lo + 1, v));
  const valAt = (x: number) => {
    const r = track.current!.getBoundingClientRect();
    return Math.round(MIN + Math.min(1, Math.max(0, (x - r.left) / r.width)) * (MAX - MIN));
  };
  const apply = (v: number) => (drag.current === "lo" ? setLo(clampLo(v)) : setHi(clampHi(v)));
  const pct = (v: number) => `${(((v - MIN) / (MAX - MIN)) * 100).toFixed(3)}%`;
  const hiText = hi === MAX ? `${MAX}+` : String(hi);

  const key = (which: "lo" | "hi") => (e: React.KeyboardEvent) => {
    const cur = which === "lo" ? lo : hi;
    let v: number | null = null;
    if (e.key in KEYS) v = cur + KEYS[e.key];
    else if (e.key === "Home") v = MIN;
    else if (e.key === "End") v = MAX;
    if (v === null) return;
    e.preventDefault();
    if (which === "lo") setLo(clampLo(v));
    else setHi(clampHi(v));
    save();
  };

  const handle =
    "absolute top-0 -ml-[22px] grid h-11 w-11 cursor-grab touch-none place-items-center rounded-pill border-0 bg-transparent p-0 focus:shadow-[0_0_0_3px_rgba(0,105,92,0.22)] focus:outline-none";
  const knob = <span className="h-[26px] w-[26px] rounded-pill border-2 border-green-500 bg-white shadow-[0_1px_4px_rgba(5,3,9,0.25)]" />;

  return (
    <div role="group" aria-labelledby="age-label" className="grid gap-1.5 px-[15px] py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <span id="age-label" className="text-ui font-medium text-ink-900">
          Age range
        </span>
        <span aria-live="polite" className="font-serif text-[22px] font-bold leading-[1.2] text-ink-900 [font-variant-numeric:tabular-nums]">
          {lo} – {hiText}
        </span>
      </div>
      <div
        ref={track}
        className="relative mx-[13px] h-11 cursor-pointer touch-none"
        onPointerDown={(e) => {
          const v = valAt(e.clientX);
          drag.current = v <= lo ? "lo" : v >= hi ? "hi" : v - lo <= hi - v ? "lo" : "hi";
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* capture is a nicety */
          }
          apply(v);
        }}
        onPointerMove={(e) => {
          if (drag.current) apply(valAt(e.clientX));
        }}
        onPointerUp={() => {
          drag.current = null;
          save();
        }}
        onPointerCancel={() => {
          drag.current = null;
          save();
        }}
      >
        <span className="absolute -left-[13px] -right-[13px] top-[19px] h-1.5 rounded-pill bg-grey-200" />
        <span className="absolute top-[19px] h-1.5 rounded-pill bg-green-500" style={{ left: pct(lo), width: `${(((hi - lo) / (MAX - MIN)) * 100).toFixed(3)}%` }} />
        <button
          type="button"
          role="slider"
          aria-label="Youngest age"
          aria-valuemin={MIN}
          aria-valuemax={hi - 1}
          aria-valuenow={lo}
          onKeyDown={key("lo")}
          className={handle}
          style={{ left: pct(lo) }}
        >
          {knob}
        </button>
        <button
          type="button"
          role="slider"
          aria-label="Oldest age"
          aria-valuemin={lo + 1}
          aria-valuemax={MAX}
          aria-valuenow={hi}
          aria-valuetext={hiText}
          onKeyDown={key("hi")}
          className={handle}
          style={{ left: pct(hi) }}
        >
          {knob}
        </button>
      </div>
      <div aria-hidden="true" className="-mt-1 flex justify-between text-[12px] text-grey-400">
        <span>{MIN}</span>
        <span>{MAX}+</span>
      </div>
      <p className="m-0 mt-1 text-[13.5px] leading-[1.5] text-grey-600 [text-wrap:pretty]">Your six will be people in this age range.</p>
    </div>
  );
}

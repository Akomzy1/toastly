"use client";

import * as React from "react";
import { proposeTime } from "@/app/(app)/gist/actions";
import { Notice } from "@/components/ui/notice";
import { AMBER, Band, ClockIcon } from "./invite-parts";

/**
 * Pick a time — both-clocks.slim.html, now with its window-selection half.
 *
 * Every proposed window shows two local times side by side, with the match's
 * city named. Windows sit inside 08:00–22:00 for both people; when none does,
 * the screen offers tomorrow instead of a 3 am slot. Whole rows are tappable.
 * The other person confirms before anything is set (gist_confirm_time).
 *
 * Deviation, flagged: for a pair in the same time zone each row shows one
 * clock (gist-accepted.slim.html: "one clock is all you need").
 */

export type WindowOption = { iso: string; date: string; mine: string; theirs: string };

export function WindowPicker({
  sessionId,
  name,
  city,
  myCity,
  crossZone,
  today,
  tomorrow,
  todayLabel,
  tomorrowLabel,
  nowMine,
  nowTheirs,
}: {
  sessionId: string;
  name: string;
  city: string | null;
  myCity: string | null;
  crossZone: boolean;
  today: WindowOption[];
  tomorrow: WindowOption[];
  todayLabel: string;
  tomorrowLabel: string;
  nowMine: string;
  nowTheirs: string;
}) {
  const first = name.split(" ")[0];
  const [day, setDay] = React.useState<"today" | "tomorrow">(today.length ? "today" : "tomorrow");
  const [showNone, setShowNone] = React.useState(today.length === 0);
  const [sel, setSel] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const list = day === "today" ? today : tomorrow;
  const chosen = list.find((w) => w.iso === sel) ?? null;

  async function propose() {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    const r = await proposeTime(sessionId, chosen.iso);
    setBusy(false);
    if (r?.error) setError(r.error);
  }

  return (
    <div className="mx-auto grid w-full max-w-[680px]">
      <Band title="Propose a Gist" sub={`with ${first}${city ? ` · ${city}` : ""}`} back={`/gist/${sessionId}`} />
      <div className="grid content-start gap-3 p-3.5">
        <div className="flex items-start gap-2.5 rounded-lg border border-champagne/90 bg-gold-50 px-3 py-[13px]">
          <span className="mt-px flex-shrink-0">
            <ClockIcon color="#CC8F00" />
          </span>
          <p className="m-0 text-[13.5px] leading-[1.55] text-gold-800">
            <strong className="font-semibold">18 minutes.</strong> Either of you can extend it once, by 18 minutes. After
            that the Gist closes on its own.
          </p>
        </div>

        <div className="flex items-center justify-between gap-2.5 px-0.5 pt-0.5">
          <p className="m-0 font-sans text-chip font-semibold uppercase tracking-[0.12em] text-grey-600">
            {showNone ? "Nothing fits today" : "Windows that work for both"}
          </p>
          <p className="m-0 text-[12.5px] text-grey-400">{day === "today" ? todayLabel : tomorrowLabel}</p>
        </div>

        {showNone ? (
          <div className="grid gap-3">
            <div className="grid gap-2 rounded-[14px] border border-ink-900/[.12] bg-white px-3.5 py-4">
              <p className="m-0 text-[14.5px] font-semibold leading-[1.55] text-ink-900">
                No window left today keeps you both between 8 am and 10 pm.
              </p>
              <p className="m-0 text-[13.5px] leading-[1.6] text-grey-600">
                It&rsquo;s {nowMine} for you
                {crossZone ? (
                  <>
                    {" "}
                    and {nowTheirs} for {first}
                    {city ? ` in ${city}` : ""}
                  </>
                ) : null}
                .{" "}
                {tomorrow[0] ? (
                  <>
                    The first window tomorrow is{" "}
                    <strong className="font-semibold text-ink-900">
                      {tomorrow[0].mine} for you{crossZone ? ` · ${tomorrow[0].theirs} for ${first}` : ""}
                    </strong>
                    .
                  </>
                ) : (
                  "There's no window tomorrow either — your time zones don't overlap in daytime."
                )}
              </p>
            </div>
            {tomorrow.length ? (
              <button
                type="button"
                onClick={() => {
                  setShowNone(false);
                  setDay("tomorrow");
                  setSel(null);
                }}
                className={AMBER}
              >
                See tomorrow&rsquo;s windows
              </button>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-2.5">
            {list.map((w) => {
              const selected = w.iso === sel;
              return (
                <button
                  key={w.iso}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSel(selected ? null : w.iso)}
                  className={`grid w-full gap-[11px] rounded-[14px] border px-[13px] py-3.5 text-left font-sans ${
                    selected ? "border-gold-500 bg-gold-50" : "border-ink-900/[.12] bg-white"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2.5">
                    <span className="text-[12.5px] font-semibold text-grey-600">{w.date}</span>
                    <span
                      className={`grid h-5 w-5 place-items-center rounded-pill border ${
                        selected ? "border-gold-500 bg-gold-500" : "border-ink-900/[.22] bg-transparent"
                      }`}
                    >
                      {selected ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M5 12.5l4.5 4.5L19 7" stroke="#001F1B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : null}
                    </span>
                  </span>
                  <span className={crossZone ? "grid grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] items-stretch gap-3" : "grid"}>
                    <span className="grid min-w-0 gap-[3px]">
                      <span className="text-chip font-semibold uppercase tracking-[0.08em] text-grey-400">
                        You{myCity ? ` · ${myCity}` : ""}
                      </span>
                      <span className="font-serif text-[22px] font-bold tabular-nums text-ink-900">{w.mine}</span>
                    </span>
                    {crossZone ? (
                      <>
                        <span className="bg-ink-900/10" />
                        <span className="grid min-w-0 gap-[3px]">
                          <span className="text-chip font-semibold uppercase tracking-[0.08em] text-grey-400">
                            {first}
                            {city ? ` · ${city}` : ""}
                          </span>
                          <span className="font-serif text-[22px] font-bold tabular-nums text-ink-900">{w.theirs}</span>
                        </span>
                      </>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-[7px] text-[12.5px] text-success">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <circle cx="8" cy="8" r="7" stroke="#2F8F5B" strokeWidth="1.3" />
                      <path d="m5 8.2 2 2 4-4.4" stroke="#2F8F5B" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    Daytime for both of you
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {error ? <Notice tone="error">{error}</Notice> : null}

        {chosen ? (
          <div className="grid gap-2.5 pt-0.5">
            <button type="button" disabled={busy} onClick={propose} className={AMBER}>
              {busy ? "Sending…" : `Propose ${chosen.mine} your time`}
            </button>
            <p className="m-0 text-center text-[13px] leading-[1.55] text-grey-600">
              {first} sees {crossZone ? `${chosen.theirs} their time` : "it"} and confirms before anything is set.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

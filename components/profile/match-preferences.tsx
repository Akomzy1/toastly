"use client";

import * as React from "react";
import Link from "next/link";
import { setOpenToAbroad } from "@/app/(app)/profile/preferences/actions";
import { Notice } from "@/components/ui/notice";

/**
 * Match preferences — built against design/prototype/open-to-abroad.slim.html.
 *
 * One switch, on by default; the whole row is the target. Turning it off
 * takes effect straight away, with no confirmation and no explanation asked
 * for. It filters the member's own six only (PRD §5.6).
 *
 * Deviation, flagged: the prototype's card also has an "Age range" row.
 * Toastly has no age-range setting, so the row is omitted rather than shown
 * doing nothing. "City" links to Edit profile, where city lives.
 */
export function MatchPreferences({ city, openToAbroad }: { city: string | null; openToAbroad: boolean }) {
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

  return (
    <div className="mx-auto grid w-full max-w-[680px] content-start gap-2.5 px-3.5 pb-6 pt-[18px]">
      <p className="m-0 mx-0.5 text-chip font-semibold uppercase tracking-[0.12em] text-grey-600">Who you see</p>
      <div className="grid rounded-2xl border border-ink-900/[.12] bg-white">
        <Link
          href="/profile/edit"
          className="flex min-h-14 items-center justify-between gap-3 px-[15px] py-3 text-inherit no-underline"
        >
          <span className="text-ui font-medium text-ink-900">City</span>
          <span className="flex min-w-0 items-center gap-2 text-[14px] text-grey-600">
            {city || "Add your city"}{" "}
            <span aria-hidden="true" className="text-[16px] text-grey-400">
              ›
            </span>
          </span>
        </Link>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={toggle}
          className="flex min-h-16 w-full cursor-pointer items-center gap-3.5 rounded-b-2xl border-0 border-t border-ink-900/10 bg-transparent px-[15px] py-3.5 text-left"
        >
          <span className="grid min-w-0 flex-1 gap-[3px]">
            <span className="text-ui font-medium text-ink-900">Open to people living abroad</span>
            <span className="text-[13.5px] leading-[1.5] text-grey-600 [text-wrap:pretty]">
              Include Nigerians living abroad who want to match back home.
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
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { setOpenToAbroad } from "./actions";

/**
 * The switch row, built against design/prototype/open-to-abroad.slim.html:
 * the whole row is the target, it saves the moment it's tapped, and nothing
 * asks why.
 */
export function OpenToAbroadSwitch({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

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
    <>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={toggle}
        className="flex min-h-16 w-full items-center gap-3.5 rounded-b-xl border-0 border-t border-ink-900/10 bg-transparent px-[15px] py-3.5 text-left"
      >
        <span className="grid min-w-0 flex-1 gap-[3px]">
          <span className="text-ui font-medium text-ink-900">Open to people living abroad</span>
          <span className="text-[13.5px] leading-[1.5] text-grey-600">
            Include Nigerians living abroad who want to match back home.
          </span>
        </span>
        <span
          aria-hidden="true"
          className={`relative h-7 w-12 flex-shrink-0 rounded-pill transition-colors duration-200 ${on ? "bg-green-500" : "bg-grey-400"}`}
        >
          <span
            className={`absolute top-[3px] h-[22px] w-[22px] rounded-pill bg-white shadow-[0_1px_3px_rgba(5,3,9,0.3)] transition-[left] duration-200 ${on ? "left-[23px]" : "left-[3px]"}`}
          />
        </span>
      </button>
      {error ? (
        <p role="alert" className="border-t border-ink-900/10 px-[15px] py-2.5 text-[13px] text-grey-600">
          {error}
        </p>
      ) : null}
    </>
  );
}

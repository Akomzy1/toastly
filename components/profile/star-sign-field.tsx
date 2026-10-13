"use client";

import * as React from "react";

/**
 * "Show my star sign" (PRD §5.2): a switch, off by default, and a chip with the
 * member's own sign when it is on. Built from design/prototype/profile-fields.html.
 *
 * The sign is worked out from the date of birth in the database (my_star_sign);
 * it is never typed in, and only the sign — never the date of birth — is shown.
 * Display only: never a filter, never a score term.
 */
export function StarSignField({ defaultOn, sign }: { defaultOn: boolean; sign: string | null }) {
  const [on, setOn] = React.useState(defaultOn);
  const article = sign && /^[AEIOU]/i.test(sign) ? "an" : "a";
  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => setOn((v) => !v)}
        className="flex min-h-16 w-full items-center gap-3.5 border-0 border-t border-ink-900/10 bg-transparent px-[15px] py-3.5 text-left"
      >
        <span className="grid min-w-0 flex-1 gap-[3px]">
          <span className="text-[15px] font-medium text-ink-900">Show my star sign</span>
          <span className="text-[13.5px] leading-normal text-grey-600 [text-wrap:pretty]">Worked out from your date of birth.</span>
        </span>
        <span aria-hidden="true" className={`relative h-7 w-12 flex-shrink-0 rounded-pill transition-colors duration-200 motion-reduce:transition-none ${on ? "bg-green-500" : "bg-grey-400"}`}>
          <span className={`absolute top-[3px] h-[22px] w-[22px] rounded-pill bg-white shadow-[0_1px_3px_rgba(5,3,9,0.3)] transition-[left] duration-200 motion-reduce:transition-none ${on ? "left-[23px]" : "left-[3px]"}`} />
        </span>
      </button>
      {on && sign ? (
        <div aria-live="polite" className="flex px-[15px] pb-3.5">
          <span className="rounded-pill bg-gold-100 px-3 py-1.5 text-[13.5px] font-semibold text-gold-800">
            You&rsquo;re {article} {sign}
          </span>
        </div>
      ) : null}
      {/* Only sent when on: no field means off. */}
      {on ? <input type="hidden" name="show_star_sign" value="on" /> : null}
    </>
  );
}

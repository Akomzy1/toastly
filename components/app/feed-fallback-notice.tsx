"use client";

import * as React from "react";
import Link from "next/link";

/**
 * Feed fallback band — built against
 * design/prototype/feed-fallback-notice.slim.html.
 *
 * Shown above the six when the member's chosen city pool isn't open yet. The
 * six are still there and the band says so: the substitution is never silent
 * (PRD §5.6).
 *
 * Behaviour unchanged — this is presentation only. It does not decide the
 * pool, it does not change the count, and dismissing it changes neither.
 *
 * Deviations, flagged: the prototype's two text colours (#00332C, #0A4A42)
 * are not steps in the approved ramp, so this uses green-550. Dismissal is
 * remembered per browser via localStorage, which is a per-viewer convenience
 * and deliberately not stored on the profile.
 */
export function FeedFallbackNotice({ city }: { city: string }) {
  const key = `toastly:feed-fallback:${city}`;
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    try {
      if (window.localStorage.getItem(key) === "1") setDismissed(true);
    } catch {
      // Private window or blocked storage: the band simply shows every time.
    }
  }, [key]);

  if (dismissed) return null;

  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-green-500/[.24] bg-green-50 px-3 pb-3.5 pt-3">
      <span aria-hidden="true" className="mt-0.5 flex-shrink-0">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8.6" stroke="#00695C" strokeWidth="1.5" />
          <path
            d="M3.6 12h16.8M12 3.4c2.2 2.4 3.3 5.3 3.3 8.6s-1.1 6.2-3.3 8.6c-2.2-2.4-3.3-5.3-3.3-8.6S9.8 5.8 12 3.4Z"
            stroke="#00695C"
            strokeWidth="1.3"
          />
        </svg>
      </span>

      <div className="grid min-w-0 flex-1 gap-[5px]">
        <p className="text-nav font-semibold leading-relaxed text-green-550">
          Matching within {city} isn&rsquo;t open yet — here are your back-home
          matches for now.
        </p>
        <p className="text-nav leading-relaxed text-green-550">
          You still get six people a day. When the {city} pool opens we&rsquo;ll
          start mixing them in here.{" "}
          {/* py-[13.5px] takes the 17px inline box to 44px. Vertical padding
              on a display:inline element extends the hit area without moving
              the line, and with no background it is invisible — the
              prototype's inline link, unchanged to the eye, meets the bar. */}
          <Link
            href="/profile"
            className="py-[13.5px] font-semibold text-green-550 underline underline-offset-2"
          >
            Change your city
          </Link>
        </p>
      </div>

      <button
        type="button"
        aria-label="Dismiss notice"
        onClick={() => {
          setDismissed(true);
          try {
            window.localStorage.setItem(key, "1");
          } catch {
            // Nothing to do: it reappears next load, which is the safe way to fail.
          }
        }}
        className="-mb-2 -mr-1.5 -mt-2 grid h-11 w-11 flex-shrink-0 place-items-center border-0 bg-transparent text-ui text-green-550"
      >
        ✕
      </button>
    </div>
  );
}

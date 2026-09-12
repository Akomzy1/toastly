"use client";

import * as React from "react";
import Link from "next/link";

/**
 * The women's launch offer bar, from home.slim.html.
 *
 * 30 days of full Premium Plus — video Gist and incognito, not base Premium
 * — granted at signup with no card (CLAUDE.md). Earlier drafts said 90 days;
 * 30 is current. The copy here must not drift from the entitlement actually
 * granted in Prompt 3.
 *
 * Dismissal is per-browser only. localStorage can throw in a private window,
 * so every access is guarded; failing to read it just shows the bar.
 */
const KEY = "toastly-women-announce-dismissed";

export function AnnounceBar() {
  const [dismissed, setDismissed] = React.useState(true);

  React.useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (dismissed) return null;

  return (
    <div className="relative bg-green-700 px-10 py-2.5">
      <p className="text-center text-caption leading-normal tracking-normal text-champagne">
        Women get <strong className="font-semibold">30 days free Premium Plus</strong>{" "}
        at signup — no card needed.{" "}
        <Link
          href="/pricing#women"
          className="border-b border-champagne/40 text-champagne no-underline"
        >
          Learn more
        </Link>
      </p>
      <button
        type="button"
        aria-label="Dismiss announcement"
        onClick={() => {
          setDismissed(true);
          try {
            window.localStorage.setItem(KEY, "1");
          } catch {
            /* Private window — dismissal just won't persist. */
          }
        }}
        className="absolute right-3.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-pill text-champagne transition-colors duration-200 hover:bg-white/10"
      >
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
          <path
            d="M1 1l10 10M11 1L1 11"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

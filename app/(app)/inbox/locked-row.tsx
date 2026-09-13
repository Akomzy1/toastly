"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LOCKED_COPY } from "@/lib/inbox";

/**
 * The locked inbox row and its upgrade panel.
 *
 * This component receives a COUNT and nothing else — by construction there is
 * no sender, no avatar, no initial and no snippet available to render, even
 * by mistake. That is the point: the lock is in the payload, and this is what
 * honest presentation of it looks like.
 *
 * Prompt 6 rules visible here:
 *   - never an error, a broken state, or an unexplained blank;
 *   - no countdown timers, no "expires in", no fabricated scarcity;
 *   - a one-tap path to upgrade, and a plain way to dismiss.
 */
export function LockedRow({ label }: { label: string }) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Card interactive className="overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="flex w-full items-center gap-3.5 p-[22px] text-left"
        >
          {/* Deep-green disc with a lock. Deliberately not a person shape:
              an avatar silhouette would imply an identity we won't show. */}
          <span
            aria-hidden="true"
            className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-pill bg-green-800"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect
                x="3"
                y="7"
                width="10"
                height="7"
                rx="1.5"
                stroke="#EBD9AE"
                strokeWidth="1.4"
              />
              <path
                d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"
                stroke="#EBD9AE"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </span>

          <span className="grid gap-0.5">
            <span className="text-ui font-semibold text-ink-900">{label}</span>
            <span className="text-nav text-grey-600">
              {LOCKED_COPY.rowLabel}
            </span>
          </span>

          <span aria-hidden="true" className="ml-auto text-ui text-grey-400">
            ›
          </span>
        </button>
      </Card>

      {open ? (
        <Card
          role="dialog"
          aria-label="Unlock your inbox"
          className="grid gap-4 border-green-500/40 bg-green-800 p-[26px] text-white"
        >
          <span
            aria-hidden="true"
            className="grid h-[60px] w-[60px] place-items-center rounded-pill border border-champagne/40"
          >
            <svg width="24" height="24" viewBox="0 0 16 16" fill="none">
              <rect
                x="3"
                y="7"
                width="10"
                height="7"
                rx="1.5"
                stroke="#EBD9AE"
                strokeWidth="1.2"
              />
              <path
                d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"
                stroke="#EBD9AE"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          </span>

          <h2 className="text-h5 text-white">{LOCKED_COPY.title}</h2>
          <p className="text-ui text-white/[.78]">{LOCKED_COPY.body}</p>

          <div className="flex flex-wrap items-center gap-4">
            <Button variant="onDarkPrimary" asChild>
              <Link href="/pricing">{LOCKED_COPY.cta}</Link>
            </Button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-ui text-champagne underline underline-offset-4"
            >
              {LOCKED_COPY.dismiss}
            </button>
          </div>
        </Card>
      ) : null}
    </>
  );
}

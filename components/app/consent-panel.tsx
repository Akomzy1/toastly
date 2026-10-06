"use client";

import * as React from "react";
import Link from "next/link";
import { boldRuns, CONSENT, type ConsentKind } from "@/lib/consent";
import { cn } from "@/lib/utils";

/**
 * A verification consent — the wording from lib/consent.ts, laid out as
 * design/prototype/photo-replace-main.slim.html lays out its consent: the
 * title, the paragraphs, a checkbox, then the primary action and an equal
 * exit. The primary stays disabled until the box is ticked, and the exit is
 * a real choice, never a faded link.
 *
 * The box's value travels with the form as `agreed`, and the server records
 * the consent — with the version it holds, not one the browser sends.
 */
export function ConsentPanel(props: {
  kind: ConsentKind;
  busy?: boolean;
  /** Rendered inside the form, above the actions (e.g. the ID-number field). */
  children?: React.ReactNode;
  onSecondary?: () => void;
  secondaryHref?: string;
}) {
  const c = CONSENT[props.kind];
  const [agreed, setAgreed] = React.useState(false);
  const id = React.useId();

  const secondary =
    "grid min-h-12 w-full place-items-center rounded-lg border border-ink-900/20 bg-transparent px-5 py-3.5 text-button text-ink-900 no-underline transition-colors hover:border-green-500 hover:bg-green-50";

  return (
    <div className="grid gap-5">
      <div className="grid gap-2.5 px-0.5">
        <h2 className="font-serif text-[24px] font-bold leading-[1.2] text-ink-900">{c.title}</h2>
        {c.body.map((p, i) => (
          <p
            key={i}
            className={cn(
              "leading-[1.6]",
              i === 0 ? "text-ui text-ink-800" : "text-nav text-grey-600",
            )}
          >
            {boldRuns(p).map((r, j) =>
              r.bold ? (
                <strong key={j} className="font-semibold text-ink-900">
                  {r.text}
                </strong>
              ) : (
                <React.Fragment key={j}>{r.text}</React.Fragment>
              ),
            )}
          </p>
        ))}
      </div>

      <label
        htmlFor={id}
        className={cn(
          "relative flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-[13px] py-3.5",
          agreed ? "border-green-500 bg-green-50" : "border-ink-900/20 bg-white",
        )}
      >
        <input
          id={id}
          type="checkbox"
          name="agreed"
          value="on"
          checked={agreed}
          onChange={() => setAgreed((a) => !a)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className={cn(
            "mt-px grid h-6 w-6 flex-shrink-0 place-items-center rounded-sm border-[1.5px] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-green-500",
            agreed ? "border-green-500 bg-green-500" : "border-grey-400 bg-white",
          )}
        >
          {agreed ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="m3.5 8.4 3 3 6-6.6" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : null}
        </span>
        <span className="text-[14.5px] leading-[1.55] text-ink-900">{c.checkbox}</span>
      </label>

      {props.children}

      <div className="grid gap-2.5">
        <button
          type="submit"
          disabled={!agreed || props.busy}
          aria-disabled={!agreed || props.busy}
          className={cn(
            "min-h-12 rounded-lg px-5 py-3.5 text-button",
            agreed && !props.busy
              ? "bg-green-500 text-white hover:bg-green-600"
              : "cursor-not-allowed bg-grey-200 text-grey-600",
          )}
        >
          {props.busy ? "Starting…" : c.primary}
        </button>
        {props.secondaryHref ? (
          <Link href={props.secondaryHref} className={secondary}>
            {c.secondary}
          </Link>
        ) : (
          <button type="button" onClick={props.onSecondary} className={secondary}>
            {c.secondary}
          </button>
        )}
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Pricing track switcher — transcribed from pricing.slim.html.
 *
 * Deliberately NOT a generic tabs component. The prototype implements this
 * one control: a two-item tablist on a paper ground that swaps which tier
 * columns and which caption the comparison table shows.
 *
 * It exists because the Naira and Diaspora-USD tracks must stay visually
 * separate (SKILL.md) — one blended table showing both currencies is the
 * thing this control was built to prevent. Do not generalise it into a
 * reusable Tabs primitive and do not use it to merge the tracks.
 *
 * Active tab is deep green on white; inactive is transparent on grey-600.
 */
export function TrackTabs({
  labels,
  value,
  onValueChange,
  panelId,
  label = "Pricing track",
  className,
}: {
  labels: string[];
  value: number;
  onValueChange: (index: number) => void;
  /** id of the region the tabs control, for aria-controls. */
  panelId?: string;
  label?: string;
  className?: string;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  // Roving arrow-key navigation, as the tablist role requires.
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const last = labels.length - 1;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = value === last ? 0 : value + 1;
    else if (e.key === "ArrowLeft") next = value === 0 ? last : value - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next === null) return;
    e.preventDefault();
    onValueChange(next);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        "flex gap-1.5 rounded-lg border border-ink-900/[.14] bg-paper p-[5px]",
        className,
      )}
    >
      {labels.map((l, i) => {
        const selected = i === value;
        return (
          <button
            key={l}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(i)}
            className={cn(
              "rounded-nested border-0 px-5 py-[11px] font-sans text-nav font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-green-500/[.16]",
              selected
                ? "bg-green-800 text-white"
                : "bg-transparent text-grey-600 hover:text-ink-900",
            )}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}

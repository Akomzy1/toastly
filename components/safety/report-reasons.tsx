"use client";

import { REPORT_REASONS, type ReportReason } from "@/lib/safety";

/**
 * The one list of report reasons (decided 7 October 2026), built on the
 * full-profile prototype's report rows. Every report surface renders this —
 * the card and Gist report form, the locked inbox, the full profile — and no
 * surface may offer a shorter list. It deliberately takes no prop that could
 * narrow, reorder or relabel the reasons (scripts/report-surfaces.test.mjs).
 *
 * Free on every plan; it reads no plan.
 */
export function ReportReasons({
  onPick,
  disabled,
  selected,
}: {
  onPick: (reason: ReportReason, label: string) => void;
  disabled?: boolean;
  /** For a two-step form: the reason already picked. */
  selected?: ReportReason | null;
}) {
  return (
    <div className="grid">
      {REPORT_REASONS.map((r) => (
        <button
          key={r.value}
          type="button"
          disabled={disabled}
          aria-pressed={selected === undefined ? undefined : selected === r.value}
          onClick={() => onPick(r.value, r.label)}
          className="flex min-h-[52px] items-center justify-between gap-3 border-0 border-t border-ink-900/10 bg-transparent px-4 py-3 text-left text-[15px] font-medium text-ink-900 hover:bg-paper disabled:opacity-60"
        >
          <span>{r.label}</span>
          <span aria-hidden="true" className="flex-shrink-0 text-[16px] text-grey-400">
            ›
          </span>
        </button>
      ))}
    </div>
  );
}

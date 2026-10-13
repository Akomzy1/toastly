"use client";

import * as React from "react";
import { VISIBILITY_LABELS, type FieldVisibility } from "@/lib/types/profile";

// The order drawn in design/prototype/profile-fields.html.
const ORDER: FieldVisibility[] = ["on_match", "public", "private"];

/**
 * "Who can see this" (PRD §5.2) — a row that opens three choices: Revealed when
 * we match / On my profile / Only me. Built from design/prototype/profile-fields.html.
 *
 * The choice is enforced in the database (profile_for), never here: "Only me"
 * means no other member ever sees the answer, and "Revealed when we match" means
 * only a match does. The row is disabled until there is an answer to show; a
 * disabled row still sends its saved choice, so nothing is lost.
 */
export function VisibilityRow({
  name,
  defaultValue,
  disabled,
  ariaLabel,
  note,
}: {
  name: string;
  defaultValue: FieldVisibility;
  disabled: boolean;
  ariaLabel: string;
  note?: string;
}) {
  const [value, setValue] = React.useState<FieldVisibility>(defaultValue);
  const [open, setOpen] = React.useState(false);
  const listId = `${name}-choices`;
  const isOpen = open && !disabled;

  return (
    <div className="grid">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`flex min-h-14 w-full items-center justify-between gap-3 border-0 bg-transparent px-[15px] py-3 text-left ${disabled ? "cursor-default opacity-50" : "cursor-pointer"}`}
      >
        <span className="text-[15px] font-medium text-ink-900">Who can see this</span>
        <span className="flex min-w-0 items-center gap-2 text-right text-[14px] text-grey-600">
          {VISIBILITY_LABELS[value]}
          <span aria-hidden="true" className={`inline-block text-[16px] text-grey-400 transition-transform duration-200 motion-reduce:transition-none ${isOpen ? "rotate-90" : ""}`}>
            ›
          </span>
        </span>
      </button>
      {isOpen ? (
        <div id={listId} role="radiogroup" aria-label={ariaLabel} className="grid gap-2 px-[15px] pb-[15px] pt-0.5">
          {ORDER.map((v) => {
            const on = value === v;
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setValue(v);
                  setOpen(false);
                }}
                className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-xl px-4 text-left text-[16px] font-semibold text-ink-900 hover:border-green-500 ${on ? "border-2 border-green-500 bg-green-50" : "border border-ink-900/[.18] bg-white"}`}
              >
                <span>{VISIBILITY_LABELS[v]}</span>
                <span aria-hidden="true" className={`grid h-[22px] w-[22px] flex-shrink-0 place-items-center rounded-pill border-[1.5px] ${on ? "border-green-500" : "border-grey-400"}`}>
                  <span className={`h-3 w-3 rounded-pill ${on ? "bg-green-500" : "bg-transparent"}`} />
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
      {note ? <p className="m-0 px-[15px] pb-3.5 text-[13.5px] leading-normal text-grey-600">{note}</p> : null}
      <input type="hidden" name={name} value={value} />
    </div>
  );
}

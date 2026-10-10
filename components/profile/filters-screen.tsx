"use client";

import * as React from "react";
import Link from "next/link";
import { Notice } from "@/components/ui/notice";
import { FILTER_RELIGIONS, FILTER_TRIBES, FILTER_WANTS_CHILDREN, type MemberFilters } from "@/lib/filters";
import { saveFilters } from "@/app/(app)/profile/filters/actions";

/**
 * Filters — built against design/prototype/premium-filters.slim.html
 * (PRD §5.2.4; decided 6 October 2026).
 *
 *   "Your search": Religion (multi-select, "Any" when none) with "Filters only
 *   change your own search. They never change who sees you." directly under
 *   it; then Tribe. There is no denomination filter, ever.
 *
 *   "Do you want children?" (0044) follows Tribe, built the same way —
 *   NOT IN THE PROTOTYPE, flagged; to follow the prototype when it arrives.
 *
 * Saves on each change. Additions, flagged: the Tribe row opens a
 * multi-select like Religion's (the prototype draws it closed, "Any ›"); each
 * filter carries an "Include people who don't say" switch, on by default, in
 * the match-preferences switch pattern; and the locked state for Starter.
 */

const CARD = "grid overflow-hidden rounded-xl border border-ink-900/[.12] bg-white";
const RULE = "border-t border-ink-900/10";

function Chevron({ open }: { open: boolean }) {
  return (
    <span aria-hidden="true" className={`inline-block text-[16px] text-grey-400 transition-transform duration-200 ${open ? "rotate-90" : ""}`}>
      ›
    </span>
  );
}

function Check({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <label
      className={`relative flex min-h-[52px] cursor-pointer items-center gap-3 rounded-lg border px-[13px] ${
        on ? "border-green-500 bg-green-50" : "border-ink-900/20 bg-white"
      }`}
    >
      <input type="checkbox" checked={on} onChange={onToggle} className="peer absolute h-px w-px opacity-0" />
      <span
        aria-hidden="true"
        className={`grid h-6 w-6 flex-shrink-0 place-items-center rounded-sm border-[1.5px] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-green-500 ${
          on ? "border-green-500 bg-green-500" : "border-grey-400 bg-white"
        }`}
      >
        {on ? (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="m3.5 8.4 3 3 6-6.6" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
      <span className="text-ui font-medium text-ink-900">{label}</span>
    </label>
  );
}

function Unsaid({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="flex min-h-14 w-full cursor-pointer items-center gap-3.5 rounded-lg border border-ink-900/[.12] bg-white px-[13px] py-3 text-left font-sans"
    >
      <span className="min-w-0 flex-1 text-ui font-medium text-ink-900">Include people who don&rsquo;t say</span>
      <span aria-hidden="true" className={`relative h-7 w-12 flex-shrink-0 rounded-pill transition-colors duration-200 ${on ? "bg-green-500" : "bg-grey-400"}`}>
        <span
          className={`absolute top-[3px] h-[22px] w-[22px] rounded-pill bg-white shadow-[0_1px_3px_rgba(5,3,9,0.3)] transition-[left] duration-200 ${
            on ? "left-[23px]" : "left-[3px]"
          }`}
        />
      </span>
    </button>
  );
}

function summary(chosen: string[]) {
  if (chosen.length === 0) return "Any";
  if (chosen.length === 1) return chosen[0];
  return `${chosen.length} chosen`;
}

type Section = "religion" | "tribe" | "wants";

export function FiltersScreen({ initial, preview }: { initial: MemberFilters; preview?: { open?: Section } }) {
  // A row saved before 0044 has no children answer yet.
  const [f, setF] = React.useState<MemberFilters>({
    ...initial,
    wants_children: initial.wants_children ?? [],
    wants_children_include_unsaid: initial.wants_children_include_unsaid ?? true,
  });
  const [open, setOpen] = React.useState<Section | null>(preview?.open ?? null);
  const wantsLabel = (v: string) => FILTER_WANTS_CHILDREN.find((w) => w.value === v)?.label ?? v;
  const [error, setError] = React.useState<string | null>(null);

  async function update(next: MemberFilters) {
    const before = f;
    setF(next);
    setError(null);
    const r = await saveFilters(next);
    if (r?.error) {
      setF(before);
      setError(r.error);
    }
  }
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className="grid gap-2.5">
      <p className="mx-0.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-grey-600">Your search</p>
      <div className={CARD}>
        <div className="grid">
          <button
            type="button"
            aria-expanded={open === "religion"}
            aria-controls="flt-rel-list"
            onClick={() => setOpen(open === "religion" ? null : "religion")}
            className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 border-0 bg-transparent px-[15px] pb-1 pt-3 text-left font-sans"
          >
            <span className="text-ui font-medium text-ink-900">Religion</span>
            <span className="flex min-w-0 items-center gap-2 text-right text-[14px] text-grey-600">
              {summary(f.religions)} <Chevron open={open === "religion"} />
            </span>
          </button>
          <p className="m-0 px-[15px] pb-3.5 text-[13.5px] leading-[1.5] text-grey-600 [text-wrap:pretty]">
            Filters only change your own search. They never change who sees you.
          </p>
          {open === "religion" ? (
            <div id="flt-rel-list" role="group" aria-label="Religion" className="grid gap-2 px-[15px] pb-[15px]">
              {FILTER_RELIGIONS.map((r) => (
                <Check key={r} label={r} on={f.religions.includes(r)} onToggle={() => update({ ...f, religions: toggle(f.religions, r) })} />
              ))}
              <Unsaid on={f.religion_include_unsaid} onToggle={() => update({ ...f, religion_include_unsaid: !f.religion_include_unsaid })} />
            </div>
          ) : null}
        </div>

        <div className={`grid ${RULE}`}>
          <button
            type="button"
            aria-expanded={open === "tribe"}
            aria-controls="flt-tribe-list"
            onClick={() => setOpen(open === "tribe" ? null : "tribe")}
            className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 border-0 bg-transparent px-[15px] py-3 text-left font-sans"
          >
            <span className="text-ui font-medium text-ink-900">Tribe</span>
            <span className="flex min-w-0 items-center gap-2 text-right text-[14px] text-grey-600">
              {summary(f.tribes)} <Chevron open={open === "tribe"} />
            </span>
          </button>
          {open === "tribe" ? (
            <div id="flt-tribe-list" role="group" aria-label="Tribe" className="grid gap-2 px-[15px] pb-[15px]">
              {FILTER_TRIBES.map((t) => (
                <Check key={t} label={t} on={f.tribes.includes(t)} onToggle={() => update({ ...f, tribes: toggle(f.tribes, t) })} />
              ))}
              <Unsaid on={f.tribe_include_unsaid} onToggle={() => update({ ...f, tribe_include_unsaid: !f.tribe_include_unsaid })} />
            </div>
          ) : null}
        </div>

        <div className={`grid ${RULE}`}>
          <button
            type="button"
            aria-expanded={open === "wants"}
            aria-controls="flt-wants-list"
            onClick={() => setOpen(open === "wants" ? null : "wants")}
            className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 border-0 bg-transparent px-[15px] py-3 text-left font-sans"
          >
            <span className="text-ui font-medium text-ink-900">Do you want children?</span>
            <span className="flex min-w-0 items-center gap-2 text-right text-[14px] text-grey-600">
              {summary(f.wants_children.map(wantsLabel))} <Chevron open={open === "wants"} />
            </span>
          </button>
          {open === "wants" ? (
            <div id="flt-wants-list" role="group" aria-label="Do you want children?" className="grid gap-2 px-[15px] pb-[15px]">
              {FILTER_WANTS_CHILDREN.map((w) => (
                <Check
                  key={w.value}
                  label={w.label}
                  on={f.wants_children.includes(w.value)}
                  onToggle={() => update({ ...f, wants_children: toggle(f.wants_children, w.value) })}
                />
              ))}
              <Unsaid
                on={f.wants_children_include_unsaid}
                onToggle={() => update({ ...f, wants_children_include_unsaid: !f.wants_children_include_unsaid })}
              />
            </div>
          ) : null}
        </div>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </div>
  );
}

/**
 * Starter: filters come with a paid plan. Names the plan and its price, with
 * "Not now" (decided 8 October 2026). NOT IN THE PROTOTYPE — flagged.
 */
export function FiltersLocked({ offer }: { offer: { plan: string; price: string } }) {
  return (
    <Notice tone="info" title="Filters come with a paid plan">
      {offer.plan} ({offer.price}) and the plans above it can filter their own six by religion, tribe and whether
      someone wants children. Filters only
      change your own search — they never change who sees you.
      <span className="mt-1 flex flex-wrap gap-x-4">
        <Link href="/profile/plan" className="flex min-h-11 items-center font-semibold underline">
          See {offer.plan} · {offer.price}
        </Link>
        <Link href="/profile/preferences" className="flex min-h-11 items-center underline">
          Not now
        </Link>
      </span>
    </Notice>
  );
}

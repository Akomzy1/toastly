"use client";

import * as React from "react";
import { cmToFtIn, HEIGHT_MAX_CM, HEIGHT_MIN_CM } from "@/lib/height";

const ROW = 44; // px per option
const DEFAULT_CM = 165; // where the picker starts when there is no height yet

type Unit = "cm" | "ft";
type Option = { cm: number; label: string };

function optionsFor(unit: Unit): Option[] {
  if (unit === "cm") {
    const out: Option[] = [];
    for (let cm = HEIGHT_MIN_CM; cm <= HEIGHT_MAX_CM; cm++) out.push({ cm, label: `${cm} cm` });
    return out;
  }
  const out: Option[] = [];
  for (let t = Math.round(HEIGHT_MIN_CM / 2.54); t <= Math.round(HEIGHT_MAX_CM / 2.54); t++) {
    out.push({
      cm: Math.min(HEIGHT_MAX_CM, Math.max(HEIGHT_MIN_CM, Math.round(t * 2.54))),
      label: `${Math.floor(t / 12)}′${t % 12}″`,
    });
  }
  return out;
}

function nearest(options: Option[], cm: number): number {
  let best = 0;
  options.forEach((o, i) => {
    if (Math.abs(o.cm - cm) < Math.abs(options[best].cm - cm)) best = i;
  });
  return best;
}

/**
 * Height (PRD §5.2): a row that opens a scroll-wheel picker, cm or ft-in, stored
 * in cm (120–220). Built from design/prototype/profile-fields.html.
 *
 * Optional, self-reported, never labelled verified; shown on the full profile
 * only, never on the card, never filterable and never a score term.
 */
export function HeightField({ defaultCm }: { defaultCm: number | null }) {
  const [open, setOpen] = React.useState(false);
  const [unit, setUnit] = React.useState<Unit>("cm");
  const [cm, setCm] = React.useState<number | null>(defaultCm);
  const list = React.useRef<HTMLDivElement>(null);
  const quietUntil = React.useRef(0);
  // The wheel is "ready" once it has been put on the current value; scroll events
  // before that (the browser settling a fresh list) are not choices.
  const ready = React.useRef(false);

  const options = React.useMemo(() => optionsFor(unit), [unit]);
  const selected = nearest(options, cm ?? DEFAULT_CM);

  const scrollTo = React.useCallback((index: number) => {
    const el = list.current;
    if (!el) return;
    quietUntil.current = Date.now() + 250; // a programmatic scroll is not a choice
    el.scrollTop = index * ROW;
  }, []);

  // Put the wheel on the current value when it opens or the unit changes.
  React.useEffect(() => {
    if (!open) return;
    ready.current = false;
    let settle = 0;
    const id = window.requestAnimationFrame(() => {
      scrollTo(nearest(optionsFor(unit), cm ?? DEFAULT_CM));
      settle = window.setTimeout(() => {
        ready.current = true;
      }, 300);
    });
    return () => {
      window.cancelAnimationFrame(id);
      window.clearTimeout(settle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open / unit change
  }, [open, unit]);

  function toggle() {
    if (!open && cm === null) setCm(DEFAULT_CM);
    setOpen((o) => !o);
  }
  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    if (!ready.current || Date.now() < quietUntil.current) return;
    const i = Math.min(options.length - 1, Math.max(0, Math.round(e.currentTarget.scrollTop / ROW)));
    if (options[i].cm !== cm) setCm(options[i].cm);
  }
  function choose(i: number) {
    setCm(options[i].cm);
    scrollTo(i);
  }
  function onKey(e: React.KeyboardEvent) {
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : e.key === "Home" ? -999 : e.key === "End" ? 999 : 0;
    if (!step) return;
    e.preventDefault();
    choose(Math.min(options.length - 1, Math.max(0, selected + step)));
  }

  const summary = cm === null ? "Not added" : unit === "cm" ? `${cm} cm` : `${cmToFtIn(cm).ft}′${cmToFtIn(cm).inch}″`;

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="height-picker"
        onClick={toggle}
        className="flex min-h-14 w-full items-center justify-between gap-3 border-0 bg-transparent px-[15px] py-3 text-left"
      >
        <span className="grid min-w-0 gap-[3px]">
          <span className="text-[15px] font-medium text-ink-900">Height</span>
          <span className="text-[13.5px] leading-normal text-grey-600">Optional.</span>
        </span>
        <span className="flex min-w-0 items-center gap-2 text-right text-[14px] text-grey-600">
          {summary}
          <span aria-hidden="true" className={`inline-block text-[16px] text-grey-400 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-90" : ""}`}>
            ›
          </span>
        </span>
      </button>

      {open ? (
        <div id="height-picker" className="grid gap-3 px-[15px] pb-[15px] pt-0.5">
          <div role="radiogroup" aria-label="Height unit" className="grid grid-cols-2 gap-1 rounded-xl bg-grey-100 p-1">
            {([["cm", "cm"], ["ft", "ft-in"]] as const).map(([k, l]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={unit === k}
                onClick={() => setUnit(k)}
                className={`min-h-11 rounded-[10px] text-[14px] font-semibold text-ink-900 ${unit === k ? "border border-ink-900/[.12] bg-white" : "border border-transparent bg-transparent text-grey-600"}`}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="relative h-[220px] overflow-hidden rounded-xl border border-ink-900/[.12]">
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-2 top-[88px] h-11 rounded-[10px] border-2 border-green-500 bg-green-50" />
            <div
              ref={list}
              id="height-listbox"
              role="listbox"
              aria-label="Height"
              tabIndex={0}
              onScroll={onScroll}
              onKeyDown={onKey}
              className="relative h-full snap-y snap-mandatory overflow-y-auto py-[88px] [scrollbar-width:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
            >
              {options.map((o, i) => (
                <div
                  key={`${unit}-${i}`}
                  role="option"
                  aria-selected={i === selected}
                  onClick={() => choose(i)}
                  className={`flex h-11 cursor-pointer snap-center items-center justify-center tabular-nums ${i === selected ? "text-[17px] font-semibold text-ink-900" : "text-[15px] text-grey-400"}`}
                >
                  {o.label}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setCm(null);
                setOpen(false);
              }}
              className="min-h-11 border-0 bg-transparent px-0.5 text-[14px] font-medium text-green-500 underline underline-offset-4"
            >
              Remove height
            </button>
            <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-[10px] border-0 bg-gold-500 px-[18px] py-2.5 text-[14px] font-semibold text-green-800 hover:bg-gold-300">
              Done
            </button>
          </div>
        </div>
      ) : null}

      {/* What is saved: always centimetres, 120–220, or nothing. */}
      <input type="hidden" name="height_cm" value={cm === null ? "" : String(cm)} />
    </>
  );
}

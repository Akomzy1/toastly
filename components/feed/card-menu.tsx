"use client";

import * as React from "react";
import { usePass } from "./pass-frame";
import { BlockButton } from "@/components/safety/block-button";
import { ReportForm } from "@/components/safety/report-form";

const ITEM =
  "flex min-h-12 w-full items-center border-0 bg-transparent px-4 py-3 text-left text-[15px] font-medium hover:bg-paper";

/**
 * The ⋯ on a card in Today's six (design/prototype/not-for-me.html, state B).
 *
 * "Not for me" is first and on its own, with a line saying the person isn't
 * told. Block and Report sit below a rule and open the existing flows, as
 * separate items: a pass is not a block and not a report. Block and Report are
 * free on every plan, and this component takes no plan.
 */
export function CardMenu({ memberId, name }: { memberId: string; name: string }) {
  const pass = usePass();
  const first = name.split(" ")[0];
  const [open, setOpen] = React.useState(false);
  const [panel, setPanel] = React.useState<null | "block" | "report">(null);
  const box = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <>
      <div ref={box} className="absolute right-1.5 top-1.5 z-20">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={`More options for ${first}`}
          aria-haspopup="menu"
          aria-expanded={open}
          className={`grid h-11 w-11 place-items-center rounded-pill border-0 hover:bg-grey-100 ${open ? "bg-grey-100" : "bg-transparent"}`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="5.5" cy="12" r="1.6" fill="#504E52" />
            <circle cx="12" cy="12" r="1.6" fill="#504E52" />
            <circle cx="18.5" cy="12" r="1.6" fill="#504E52" />
          </svg>
        </button>
        {open ? (
          <div role="menu" aria-label={`More options for ${first}`} className="absolute right-0 top-11 grid w-60 overflow-hidden rounded-xl border border-ink-900/[.12] bg-white shadow-[0_18px_40px_-20px_rgba(5,3,9,0.6)]">
            <button
              type="button"
              role="menuitem"
              disabled={pass?.busy}
              onClick={() => {
                setOpen(false);
                pass?.pass();
              }}
              className="grid min-h-[60px] gap-0.5 border-0 bg-transparent px-4 py-[11px] text-left hover:bg-paper"
            >
              <span className="text-[15px] font-medium text-ink-900">Not for me</span>
              <span className="text-[13px] text-grey-600">{first} isn&rsquo;t told.</span>
            </button>
            <div className="grid border-t border-ink-900/[.14]">
              <button type="button" role="menuitem" onClick={() => { setOpen(false); setPanel("block"); }} className={`${ITEM} text-error`}>
                Block
              </button>
              <button type="button" role="menuitem" onClick={() => { setOpen(false); setPanel("report"); }} className={`${ITEM} border-t border-ink-900/10 text-ink-900`}>
                Report
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {pass?.error ? (
        <p role="alert" className="m-0 text-nav text-error">
          {pass.error}
        </p>
      ) : null}
      {panel ? (
        <div className="grid gap-3 border-t border-ink-900/[.12] pt-3">
          {panel === "block" ? <BlockButton memberId={memberId} name={name} /> : <ReportForm memberId={memberId} name={name} />}
          <button type="button" onClick={() => setPanel(null)} className="min-h-11 justify-self-start text-nav text-grey-600 underline underline-offset-4">
            Close
          </button>
        </div>
      ) : null}
    </>
  );
}

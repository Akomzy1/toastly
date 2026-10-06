"use client";

import * as React from "react";
import { Notice } from "@/components/ui/notice";
import { FAITH_CONSENT } from "@/lib/consent";
import { DENOMINATIONS, FAITH_OTHER_MAX, RELIGIONS, isListedReligion, type Denomination, type FaithFields } from "@/lib/faith";
import { agreeToShowFaith, removeFaith, saveFaith, setFaithShown } from "@/app/(app)/profile/faith-actions";

/**
 * Edit profile — Faith, built against design/prototype/faith-editor.slim.html
 * (PRD §5.2.3; decided 6 October 2026).
 *
 *   - Religion is a row that opens the approved radio list in place.
 *   - Denomination slides in beneath it only for Christian or Muslim, and
 *     goes away if religion changes.
 *   - "Other" opens a 30-character field with a counter.
 *   - One switch, "Show on my profile", covers both.
 *   - The first time either field is added, the consent sheet comes up: "Add
 *     to my profile" stays disabled until the box is ticked, and "Not now"
 *     saves nothing.
 *   - "Remove faith from my profile" deletes both fields and the permission.
 *
 * Saves as the member picks (faith-actions.ts), apart from the profile form.
 * Addition, flagged: a religion stored before the option list (free text)
 * shows as the row's value until the member picks from the list.
 */

const CARD = "grid overflow-hidden rounded-xl border border-ink-900/[.12] bg-white";
const RULE = "border-t border-ink-900/10";
const ROW =
  "flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 border-0 bg-transparent px-[15px] py-3 text-left font-sans";

function Chevron({ open }: { open: boolean }) {
  return (
    <span aria-hidden="true" className={`inline-block text-[16px] text-grey-400 transition-transform duration-200 ${open ? "rotate-90" : ""}`}>
      ›
    </span>
  );
}

function Radio({ label, selected, onPick }: { label: string; selected: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPick}
      className={`flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-4 text-left font-sans text-[16px] font-semibold text-ink-900 hover:border-green-500 ${
        selected ? "border-2 border-green-500 bg-green-50" : "border border-ink-900/[.18] bg-white"
      }`}
    >
      <span>{label}</span>
      <span
        aria-hidden="true"
        className={`grid h-[22px] w-[22px] flex-shrink-0 place-items-center rounded-pill border-[1.5px] ${selected ? "border-green-500" : "border-grey-400"}`}
      >
        <span className={`h-3 w-3 rounded-pill ${selected ? "bg-green-500" : "bg-transparent"}`} />
      </span>
    </button>
  );
}

function OtherField({ id, label, value, onChange, onDone }: { id: string; label: string; value: string; onChange: (v: string) => void; onDone: () => void }) {
  return (
    <div className="grid gap-1.5 px-[15px] pb-[15px] pt-0.5">
      <label htmlFor={id} className="text-[13.5px] text-grey-600">
        {label}
      </label>
      <input
        id={id}
        type="text"
        maxLength={FAITH_OTHER_MAX}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, FAITH_OTHER_MAX))}
        onBlur={onDone}
        placeholder="Type it in your own words"
        className="min-h-12 w-full rounded-lg border border-ink-900/20 bg-white px-3.5 py-[13px] font-sans text-[15px] text-ink-900 focus:border-green-500 focus:outline-none focus:ring-[3px] focus:ring-green-500/[.16]"
      />
      <span aria-live="polite" className="justify-self-end text-[12px] tabular-nums text-grey-400">
        {value.length}/{FAITH_OTHER_MAX}
      </span>
    </div>
  );
}

export function FaithSection({
  initial,
  consented: initiallyConsented,
  preview,
}: {
  initial: FaithFields;
  consented: boolean;
  /** For the /audit harness only: open a list, or the consent sheet. */
  preview?: { open?: "rel" | "denom"; sheetFor?: string };
}) {
  const [religion, setReligion] = React.useState<string | null>(initial.religion);
  const [otherRel, setOtherRel] = React.useState(initial.religion_other ?? "");
  const [denomination, setDenomination] = React.useState<Denomination | null>(initial.denomination);
  const [otherDenom, setOtherDenom] = React.useState(initial.denomination_other ?? "");
  const [shown, setShown] = React.useState(initial.religion_visibility === "public");
  const [consented, setConsented] = React.useState(initiallyConsented);
  const [open, setOpen] = React.useState<"rel" | "denom" | null>(preview?.open ?? null);
  const [pending, setPending] = React.useState<string | null>(preview?.sheetFor ?? null);
  const [ticked, setTicked] = React.useState(false);
  const [toast, setToast] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const hasRel = religion !== null;
  const legacy = hasRel && !isListedReligion(religion) ? religion : null;
  const options = isListedReligion(religion) ? DENOMINATIONS[religion] : undefined;
  const relIsOther = religion === "Other";
  const denomIsOther = Boolean(options) && denomination === "other";
  const relValue = !hasRel ? "Not added" : relIsOther ? otherRel.trim() || "Other" : religion;
  const denomLabel = options?.find((d) => d.value === denomination)?.label;
  const denomValue = !denomination || !options ? "Not added" : denomIsOther ? otherDenom.trim() || "Other" : denomLabel ?? "Not added";

  async function save(next: { religion: string | null; religion_other: string; denomination: Denomination | null; denomination_other: string }) {
    setError(null);
    // "Other" waits for its text before saving.
    if (next.religion === "Other" && !next.religion_other.trim()) return;
    if (next.denomination === "other" && !next.denomination_other.trim()) return;
    const r = await saveFaith({
      religion: next.religion,
      religion_other: next.religion_other || null,
      denomination: next.denomination,
      denomination_other: next.denomination_other || null,
    });
    if (r?.needsConsent) {
      setConsented(false);
      setPending(next.religion);
      setTicked(false);
      return;
    }
    if (r?.error) setError(r.error);
  }

  function pickReligion(r: string) {
    setOpen(null);
    setToast(false);
    if (!consented) {
      setPending(r);
      setTicked(false);
      return;
    }
    const same = r === religion;
    const next = {
      religion: r,
      religion_other: r === "Other" ? otherRel : "",
      denomination: same ? denomination : null,
      denomination_other: same ? otherDenom : "",
    };
    setReligion(r);
    setOtherRel(next.religion_other);
    setDenomination(next.denomination);
    setOtherDenom(next.denomination_other);
    if (!hasRel) setShown(true);
    void save(next);
  }

  function pickDenomination(d: Denomination) {
    setOpen(null);
    const next = { religion, religion_other: otherRel, denomination: d, denomination_other: d === "other" ? otherDenom : "" };
    setDenomination(d);
    setOtherDenom(next.denomination_other);
    void save(next);
  }

  async function agree() {
    if (!ticked || pending === null) return;
    const r = await agreeToShowFaith();
    if (r?.error) return setError(r.error);
    setConsented(true);
    const picked = pending;
    setPending(null);
    setReligion(picked);
    setOtherRel("");
    setDenomination(null);
    setOtherDenom("");
    setShown(true);
    void save({ religion: picked, religion_other: "", denomination: null, denomination_other: "" });
  }

  async function toggleShown() {
    if (!hasRel) return;
    const next = !shown;
    setShown(next);
    const r = await setFaithShown(next);
    if (r?.error) {
      setShown(!next);
      setError(r.error);
    }
  }

  async function remove(e: React.MouseEvent) {
    e.preventDefault();
    const r = await removeFaith();
    if (r?.error) return setError(r.error);
    setReligion(null);
    setOtherRel("");
    setDenomination(null);
    setOtherDenom("");
    setShown(false);
    setConsented(false);
    setOpen(null);
    setToast(true);
  }

  return (
    <section aria-labelledby="faith-label" className="grid gap-2.5">
      <p id="faith-label" className="mx-0.5 mt-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-grey-600">
        Faith
      </p>
      <div className={CARD}>
        <button type="button" aria-expanded={open === "rel"} aria-controls="faith-rel-list" onClick={() => setOpen(open === "rel" ? null : "rel")} className={ROW}>
          <span className="text-ui font-medium text-ink-900">Religion</span>
          <span className="flex min-w-0 items-center gap-2 text-[14px] text-grey-600">
            {relValue} <Chevron open={open === "rel"} />
          </span>
        </button>
        {open === "rel" ? (
          <div id="faith-rel-list" role="radiogroup" aria-label="Religion" className="grid gap-2 px-[15px] pb-[15px] pt-0.5">
            {legacy ? <Radio label={legacy} selected onPick={() => setOpen(null)} /> : null}
            {RELIGIONS.map((r) => (
              <Radio key={r} label={r} selected={religion === r} onPick={() => pickReligion(r)} />
            ))}
          </div>
        ) : null}
        {relIsOther ? (
          <OtherField
            id="faith-rel-other"
            label="Your religion"
            value={otherRel}
            onChange={setOtherRel}
            onDone={() => void save({ religion, religion_other: otherRel, denomination: null, denomination_other: "" })}
          />
        ) : null}

        <div
          aria-hidden={!options}
          className={`grid transition-[grid-template-rows,opacity] duration-[260ms] ease-out ${options ? "visible grid-rows-[1fr] opacity-100" : "invisible grid-rows-[0fr] opacity-0"}`}
        >
          <div className="min-h-0 overflow-hidden">
            <div className={`grid ${RULE}`}>
              <button
                type="button"
                aria-expanded={open === "denom"}
                aria-controls="faith-denom-list"
                tabIndex={options ? 0 : -1}
                onClick={() => setOpen(open === "denom" ? null : "denom")}
                className={ROW}
              >
                <span className="grid min-w-0 gap-[3px]">
                  <span className="text-ui font-medium text-ink-900">Denomination</span>
                  <span className="text-[13.5px] leading-[1.5] text-grey-600">Optional</span>
                </span>
                <span className="flex min-w-0 items-center gap-2 text-right text-[14px] text-grey-600">
                  {denomValue} <Chevron open={open === "denom"} />
                </span>
              </button>
              {open === "denom" && options ? (
                <div id="faith-denom-list" role="radiogroup" aria-label="Denomination" className="grid gap-2 px-[15px] pb-[15px] pt-0.5">
                  {options.map((d) => (
                    <Radio key={d.value} label={d.label} selected={denomination === d.value} onPick={() => pickDenomination(d.value)} />
                  ))}
                </div>
              ) : null}
              {denomIsOther ? (
                <OtherField
                  id="faith-denom-other"
                  label="Your denomination"
                  value={otherDenom}
                  onChange={setOtherDenom}
                  onDone={() => void save({ religion, religion_other: otherRel, denomination: "other", denomination_other: otherDenom })}
                />
              ) : null}
            </div>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={hasRel && shown}
          disabled={!hasRel}
          onClick={toggleShown}
          className={`flex min-h-16 w-full items-center gap-3.5 border-0 bg-transparent px-[15px] py-3.5 text-left font-sans ${RULE} ${
            hasRel ? "cursor-pointer" : "cursor-default opacity-50"
          }`}
        >
          <span className="min-w-0 flex-1 text-ui font-medium text-ink-900">Show on my profile</span>
          <span aria-hidden="true" className={`relative h-7 w-12 flex-shrink-0 rounded-pill transition-colors duration-200 ${hasRel && shown ? "bg-green-500" : "bg-grey-400"}`}>
            <span
              className={`absolute top-[3px] h-[22px] w-[22px] rounded-pill bg-white shadow-[0_1px_3px_rgba(5,3,9,0.3)] transition-[left] duration-200 ${
                hasRel && shown ? "left-[23px]" : "left-[3px]"
              }`}
            />
          </span>
        </button>
      </div>

      <p className="mx-0.5 mt-0.5 text-[13.5px] leading-[1.55] text-grey-600 [text-wrap:pretty]">Optional. Toastly never uses it to decide who sees you.</p>

      {hasRel ? (
        <a
          href="#"
          onClick={remove}
          className="ml-0.5 inline-flex min-h-11 items-center justify-self-start text-[14px] font-medium text-green-500 underline underline-offset-4"
        >
          Remove faith from my profile
        </a>
      ) : null}

      {error ? <Notice tone="error">{error}</Notice> : null}

      {toast ? (
        <div role="status" className="fixed inset-x-3.5 bottom-[18px] z-40 mx-auto max-w-[680px] rounded-lg bg-green-800 px-4 py-3.5 text-[14px] font-medium text-white">
          Faith removed and deleted
        </div>
      ) : null}

      {pending !== null ? (
        <div className="fixed inset-0 z-50 flex items-end bg-green-800/[.55]">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="faith-consent-title"
            className="mx-auto grid w-full max-w-[680px] gap-3.5 rounded-t-[20px] bg-white px-4 pb-5 pt-2.5"
          >
            <span aria-hidden="true" className="h-1 w-9 justify-self-center rounded-pill bg-grey-200" />
            <h2 id="faith-consent-title" className="m-0 mt-1 font-serif text-[21px] font-bold leading-[1.25] text-ink-900">
              {FAITH_CONSENT.title}
            </h2>
            {FAITH_CONSENT.body.map((p) => (
              <p key={p} className="m-0 text-[14.5px] leading-[1.6] text-ink-800 [text-wrap:pretty]">
                {p}
              </p>
            ))}
            <label
              className={`relative flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-[13px] py-3.5 ${
                ticked ? "border-green-500 bg-green-50" : "border-ink-900/20 bg-white"
              }`}
            >
              <input type="checkbox" checked={ticked} onChange={() => setTicked((t) => !t)} className="peer absolute h-px w-px opacity-0" />
              <span
                aria-hidden="true"
                className={`mt-px grid h-6 w-6 flex-shrink-0 place-items-center rounded-sm border-[1.5px] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-green-500 ${
                  ticked ? "border-green-500 bg-green-500" : "border-grey-400 bg-white"
                }`}
              >
                {ticked ? (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="m3.5 8.4 3 3 6-6.6" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </span>
              <span className="text-[14.5px] leading-[1.55] text-ink-900 [text-wrap:pretty]">{FAITH_CONSENT.checkbox}</span>
            </label>
            <div className="mt-0.5 grid gap-2.5">
              <button
                type="button"
                disabled={!ticked}
                aria-disabled={!ticked}
                onClick={agree}
                className={`min-h-12 rounded-lg border-0 px-5 py-3.5 font-sans text-[15px] font-semibold ${
                  ticked ? "cursor-pointer bg-gold-500 text-green-800" : "cursor-not-allowed bg-grey-200 text-grey-600"
                }`}
              >
                {FAITH_CONSENT.primary}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPending(null);
                  setTicked(false);
                }}
                className="min-h-12 cursor-pointer rounded-lg border border-ink-900/20 bg-transparent px-5 py-3.5 font-sans text-[15px] font-semibold text-ink-900 hover:border-green-500 hover:bg-green-50"
              >
                {FAITH_CONSENT.secondary}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

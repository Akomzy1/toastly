"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  deleteGenotype,
  recordGenotypeConsent,
  saveGenotype,
} from "@/lib/genotype-actions";
import {
  GENOTYPE_CONSENT,
  GENOTYPE_INFO_URL,
  GENOTYPE_LABELS,
  GENOTYPE_PRIVACY_URL,
  GENOTYPE_VALUES,
  GENOTYPE_VISIBILITY_OPTIONS,
  type GenotypeValue,
  type GenotypeVisibility,
} from "@/lib/genotype";
import { Notice } from "@/components/ui/notice";

/**
 * Genotype settings — built against four prototypes:
 *   genotype-consent.slim.html     the permission step
 *   genotype-entry.slim.html       choosing a value
 *   genotype-visibility.slim.html  choosing who sees it
 *   genotype-settings.slim.html    the settings row, and delete
 *
 * The flow: row ("Not added" + Add) → consent → entry → visibility → row.
 * Editing re-enters at entry; if the member agreed to an older consent
 * wording, it re-enters at consent instead. Deleting is always available.
 *
 * Two deviations, flagged:
 *   - The prototypes are full screens with an app-bar back chevron. Inline on
 *     the profile page there is no app bar, so entry has a quiet "Cancel" and
 *     visibility a quiet "Back". Neither is in the prototype.
 *   - "What do genotypes mean?" renders only once GENOTYPE_INFO_URL is set,
 *     by decision; the prototype draws it as a link with no destination.
 *
 * Free on every tier: this component reads no plan.
 */

export type GenotypeStep = "row" | "consent" | "entry" | "visibility";

const CTA = "min-h-12 w-full rounded-lg px-5 py-3.5 text-button transition-colors duration-200";
const CTA_ON = "bg-gold-500 text-green-800 hover:bg-gold-300";
const CTA_OFF = "cursor-not-allowed bg-grey-200 text-grey-600";
const OUTLINE =
  "min-h-12 w-full rounded-lg border border-ink-900/20 bg-transparent px-5 py-3 text-button text-ink-900 transition-colors duration-200 hover:border-green-500 hover:bg-green-50";
const SMALL =
  "min-h-11 rounded-md border border-ink-900/20 bg-transparent px-3 py-2.5 text-[14px] font-semibold text-ink-900 transition-colors duration-200 hover:border-green-500 hover:bg-green-50";
// Not in the prototype (see the header note) — so it must at least meet the
// 44px bar on both axes; "Back" alone measured 41px wide.
const QUIET =
  "min-h-11 min-w-11 justify-self-start px-1 text-nav font-medium text-grey-600 underline underline-offset-4";

function Ring({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid h-[22px] w-[22px] flex-shrink-0 place-items-center rounded-pill border-[1.5px] ${
        on ? "border-green-500" : "border-grey-400"
      }`}
    >
      <span className={`h-3 w-3 rounded-pill ${on ? "bg-green-500" : "bg-transparent"}`} />
    </span>
  );
}

function SubmitCta({ label, enabled }: { label: string; enabled: boolean }) {
  const { pending } = useFormStatus();
  const on = enabled && !pending;
  return (
    <button
      type="submit"
      disabled={!on}
      aria-disabled={!on}
      className={`${CTA} ${on ? CTA_ON : CTA_OFF}`}
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

function ConfirmDelete() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={OUTLINE}>
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}

export function GenotypeSettings({
  consented,
  reconsent,
  value,
  visibility,
  initialStep = "row",
  initialSheetOpen = false,
}: {
  consented: boolean;
  reconsent: boolean;
  value: GenotypeValue | null;
  visibility: GenotypeVisibility;
  /** For the /audit harness only: the state to render first. */
  initialStep?: GenotypeStep;
  initialSheetOpen?: boolean;
}) {
  const [step, setStep] = React.useState<GenotypeStep>(initialStep);
  const [agreed, setAgreed] = React.useState(false);
  // Nothing is preselected when adding (genotype-entry.slim.html). Editing
  // starts from the member's current value.
  const [chosen, setChosen] = React.useState<GenotypeValue | null>(value);
  const [who, setWho] = React.useState<GenotypeVisibility>(visibility);
  const [sheet, setSheet] = React.useState(initialSheetOpen);
  const [toast, setToast] = React.useState(false);
  const [justDeleted, setJustDeleted] = React.useState(false);
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  const [consentState, consentAction] = useFormState(recordGenotypeConsent, null);
  const [saveState, saveAction] = useFormState(saveGenotype, null);
  const [deleteState, deleteAction] = useFormState(deleteGenotype, null);

  React.useEffect(() => {
    if (consentState?.ok) setStep("entry");
  }, [consentState]);

  React.useEffect(() => {
    if (saveState?.ok) setStep("row");
  }, [saveState]);

  React.useEffect(() => {
    if (!deleteState?.ok) return;
    setSheet(false);
    setStep("row");
    setJustDeleted(true);
    setChosen(null);
    setWho("private");
    setToast(true);
    const t = window.setTimeout(() => setToast(false), 4000);
    return () => window.clearTimeout(t);
  }, [deleteState]);

  // The sheet: focus lands on Cancel, and Escape closes it.
  React.useEffect(() => {
    if (!sheet) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheet(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet]);

  const hasValue = Boolean(value) && !justDeleted;
  // A consent to an older wording counts as none: read it again first.
  const begin = () => setStep(consented ? "entry" : "consent");
  const visibleTo =
    GENOTYPE_VISIBILITY_OPTIONS.find((o) => o.value === visibility)?.label ?? "Only me";

  return (
    <section aria-label="Genotype" className="grid gap-2.5">
      {/* ---- The settings row (genotype-settings.slim.html) ---- */}
      {step === "row" ? (
        <>
          <div className="rounded-xl border border-ink-900/[.12] bg-white px-[15px] pb-[15px] pt-3.5">
            {hasValue && value ? (
              <div className="grid gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="grid min-w-0 gap-[3px]">
                    <span className="text-ui font-medium text-ink-900">Genotype</span>
                    <span className="text-[13.5px] leading-normal text-grey-600">
                      Visible to: {visibleTo}
                    </span>
                  </div>
                  <span className="flex-shrink-0 text-ui font-semibold text-ink-900">
                    {GENOTYPE_LABELS[value]}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={begin} className={SMALL}>
                    Edit
                  </button>
                  <button type="button" onClick={() => setSheet(true)} className={SMALL}>
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="grid min-w-0 gap-[3px]">
                  <span className="text-ui font-medium text-ink-900">Genotype</span>
                  <span className="text-[13.5px] leading-normal text-grey-600">Not added</span>
                </div>
                <button type="button" onClick={begin} className={`flex-shrink-0 px-4 ${SMALL}`}>
                  Add
                </button>
              </div>
            )}
          </div>
          {justDeleted && !hasValue ? (
            <p className="mx-0.5 mt-1 text-[13px] leading-relaxed text-grey-600">
              Adding it again starts with the permission step.
            </p>
          ) : null}
          {reconsent && hasValue ? (
            <p className="mx-0.5 mt-1 text-[13px] leading-relaxed text-grey-600">
              We&rsquo;ve updated how we describe this, so editing starts with
              reading it again.
            </p>
          ) : null}
        </>
      ) : null}

      {/* ---- Consent (genotype-consent.slim.html) ---- */}
      {step === "consent" ? (
        <form action={consentAction} className="grid gap-5">
          <div className="grid gap-2.5">
            <h2 className="font-serif text-[24px] font-bold leading-[1.2] text-ink-900">
              {GENOTYPE_CONSENT.title}
            </h2>
            <p className="text-ui leading-relaxed text-ink-800">{GENOTYPE_CONSENT.intro}</p>
          </div>

          <div className="grid rounded-xl border border-ink-900/[.12] bg-white">
            {GENOTYPE_CONSENT.sections.map((s, i) => (
              <div
                key={s.heading}
                className={`grid gap-1.5 px-[15px] py-4 ${i ? "border-t border-ink-900/10" : ""}`}
              >
                <h3 className="text-chip font-semibold uppercase tracking-[0.12em] text-green-500">
                  {s.heading}
                </h3>
                {s.paragraphs.map((p) => (
                  <p key={p} className="text-[14.5px] leading-relaxed text-ink-800">
                    {p}
                  </p>
                ))}
                {i === GENOTYPE_CONSENT.sections.length - 1 && GENOTYPE_PRIVACY_URL ? (
                  <p className="text-[14.5px] leading-relaxed text-ink-800">
                    {GENOTYPE_CONSENT.privacyLine}{" "}
                    <a
                      href={GENOTYPE_PRIVACY_URL}
                      className="py-[13.5px] font-semibold text-green-500 underline underline-offset-2"
                    >
                      Privacy policy
                    </a>
                  </p>
                ) : null}
              </div>
            ))}
          </div>

          <div className="grid gap-1.5 rounded-lg border border-champagne/90 bg-gold-50 px-[13px] py-3.5">
            <p className="text-[14.5px] font-semibold leading-normal text-gold-800">
              {GENOTYPE_CONSENT.callout.title}
            </p>
            <p className="text-nav leading-relaxed text-gold-800">
              {GENOTYPE_CONSENT.callout.body}
            </p>
          </div>

          <label
            className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-[13px] py-3.5 ${
              agreed ? "border-green-500 bg-green-50" : "border-ink-900/20 bg-white"
            }`}
          >
            <input
              type="checkbox"
              name="agree"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className={`mt-px grid h-6 w-6 flex-shrink-0 place-items-center rounded-sm border-[1.5px] peer-focus-visible:ring-[3px] peer-focus-visible:ring-green-500/[.16] ${
                agreed ? "border-green-500 bg-green-500" : "border-grey-400 bg-white"
              }`}
            >
              {agreed ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path
                    d="m3.5 8.4 3 3 6-6.6"
                    stroke="#FFFFFF"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </span>
            <span className="text-[14.5px] leading-[1.55] text-ink-900">
              {GENOTYPE_CONSENT.checkbox}
            </span>
          </label>

          {consentState?.error ? <Notice tone="error">{consentState.error}</Notice> : null}

          {/* "Not now" is the same size and weight — a real exit. */}
          <div className="grid gap-2.5">
            <SubmitCta label={GENOTYPE_CONSENT.agree} enabled={agreed} />
            <button
              type="button"
              onClick={() => {
                setAgreed(false);
                setStep("row");
              }}
              className={OUTLINE}
            >
              {GENOTYPE_CONSENT.decline}
            </button>
          </div>
        </form>
      ) : null}

      {/* ---- Entry, then visibility: one form, two screens ---- */}
      {step === "entry" || step === "visibility" ? (
        <form action={saveAction} className="grid gap-[18px]">
          <input type="hidden" name="genotype" value={chosen ?? ""} />
          <input type="hidden" name="visibility" value={who} />

          {step === "entry" ? (
            <>
              <div className="grid gap-2">
                <h2 className="font-serif text-[24px] font-bold leading-[1.2] text-ink-900">
                  What&rsquo;s your genotype?
                </h2>
                <p className="text-[14.5px] leading-relaxed text-grey-600">
                  Choose one. You can change or delete it at any time.
                </p>
              </div>

              {/* Same size and style for every value; the selected outline is
                  identical whichever is picked. */}
              <div role="radiogroup" aria-label="Genotype" className="grid gap-2">
                {GENOTYPE_VALUES.map((g) => {
                  const on = chosen === g;
                  return (
                    <button
                      key={g}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setChosen(g)}
                      className={`flex min-h-[56px] w-full items-center justify-between gap-3 rounded-lg px-4 text-left text-[16px] font-semibold text-ink-900 hover:border-green-500 ${
                        on
                          ? "border-2 border-green-500 bg-green-50"
                          : "border border-ink-900/[.18] bg-white"
                      }`}
                    >
                      <span>{GENOTYPE_LABELS[g]}</span>
                      <Ring on={on} />
                    </button>
                  );
                })}
              </div>

              {GENOTYPE_INFO_URL ? (
                <a
                  href={GENOTYPE_INFO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center justify-self-start text-nav font-medium text-green-500 underline underline-offset-4"
                >
                  What do genotypes mean?
                </a>
              ) : null}

              <button
                type="button"
                disabled={!chosen}
                aria-disabled={!chosen}
                onClick={() => setStep("visibility")}
                className={`${CTA} ${chosen ? CTA_ON : CTA_OFF}`}
              >
                Continue
              </button>
              <button type="button" onClick={() => setStep("row")} className={QUIET}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <div className="grid gap-2">
                <h2 className="font-serif text-[24px] font-bold leading-[1.2] text-ink-900">
                  Who can see your genotype?
                </h2>
                <p className="text-[14.5px] leading-relaxed text-grey-600">
                  You can change this or stop sharing at any time.
                </p>
              </div>

              <div
                role="radiogroup"
                aria-label="Who can see your genotype"
                className="grid gap-2"
              >
                {GENOTYPE_VISIBILITY_OPTIONS.map((o, i) => {
                  const on = who === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setWho(o.value)}
                      className={`flex min-h-[64px] w-full items-start gap-3 rounded-lg px-[15px] py-3.5 text-left hover:border-green-500 ${
                        on
                          ? "border-2 border-green-500 bg-green-50"
                          : "border border-ink-900/[.18] bg-white"
                      }`}
                    >
                      <span className="mt-px">
                        <Ring on={on} />
                      </span>
                      <span className="grid min-w-0 flex-1 gap-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-[15.5px] font-semibold leading-[1.35] text-ink-900">
                            {o.label}
                          </span>
                          {/* "Only me" keeps its Default tag even when another
                              option is chosen. 11.5px is the prototype's size —
                              below the audit's 12px floor; see FINAL-REVIEW. */}
                          {i === 0 ? (
                            <span className="rounded-sm border border-green-500/30 bg-white px-2 py-[3px] text-[11.5px] font-semibold text-green-550">
                              Default
                            </span>
                          ) : null}
                        </span>
                        <span className="text-[13.5px] leading-normal text-grey-600">
                          {o.hint}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <p className="text-[13.5px] leading-relaxed text-grey-600">
                Whoever you choose sees your genotype only if they&rsquo;ve also
                chosen to share theirs with you.
              </p>

              {saveState?.error ? <Notice tone="error">{saveState.error}</Notice> : null}

              <SubmitCta label="Save" enabled={Boolean(chosen)} />
              <button type="button" onClick={() => setStep("entry")} className={QUIET}>
                Back
              </button>
            </>
          )}
        </form>
      ) : null}

      {/* ---- The delete sheet ---- */}
      {sheet ? (
        <div
          className="fixed inset-0 z-50 flex items-end bg-green-800/[.55]"
          onClick={() => setSheet(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="genotype-delete-title"
            onClick={(e) => e.stopPropagation()}
            className="mx-auto grid w-full max-w-[640px] gap-3.5 rounded-t-[20px] bg-white px-4 pb-5 pt-2.5"
          >
            <span aria-hidden="true" className="h-1 w-9 justify-self-center rounded-pill bg-grey-200" />
            <h2
              id="genotype-delete-title"
              className="mt-1 font-serif text-[21px] font-bold leading-[1.25] text-ink-900"
            >
              Delete your genotype?
            </h2>
            <p className="text-[14.5px] leading-relaxed text-ink-800">
              It&rsquo;s removed from Toastly straight away, along with your
              permission. You can add it again later.
            </p>
            {deleteState?.error ? <Notice tone="error">{deleteState.error}</Notice> : null}
            {/* Cancel and Delete: same size, same style, side by side. */}
            <form action={deleteAction} className="mt-1 grid grid-cols-2 gap-2.5">
              <input type="hidden" name="confirm" value="on" />
              <button
                ref={cancelRef}
                type="button"
                onClick={() => setSheet(false)}
                className={OUTLINE}
              >
                Cancel
              </button>
              <ConfirmDelete />
            </form>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div
          role="status"
          className="fixed inset-x-[14px] bottom-[18px] z-50 mx-auto max-w-[612px] rounded-lg bg-green-800 px-4 py-3.5 text-nav font-medium text-white"
        >
          Genotype deleted
        </div>
      ) : null}
    </section>
  );
}

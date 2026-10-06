"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { PickerCity } from "@/components/app/city-picker";
import { saveWhereYouLive } from "@/app/(app)/profile/country/actions";
import { countryInSentence } from "@/lib/countries";
import { CityStep, CountryOptions, CountrySearch, CountrySheet, hasCities } from "./parts";

const GOLD =
  "min-h-12 rounded-lg border-0 bg-gold-500 px-6 py-3.5 font-sans text-[15px] font-semibold text-green-800 hover:bg-gold-300 disabled:opacity-70";

function Toast({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="fixed inset-x-3.5 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[60] mx-auto max-w-[652px] rounded-lg bg-green-800 px-4 py-3.5 text-[14px] font-medium text-white [text-wrap:pretty] lg:bottom-6">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sign-up — where-you-live.slim.html. The second step, after the phone code.
// ---------------------------------------------------------------------------

const STEPS: [string, "done" | "current" | "todo"][] = [
  ["Phone", "done"],
  ["Where you live", "current"],
  ["Photos", "todo"],
  ["Selfie check", "todo"],
];

export function WhereYouLiveSignup({ guess, cities }: { guess: string; cities: PickerCity[] }) {
  const router = useRouter();
  const [sel, setSel] = React.useState(guess);
  const [touched, setTouched] = React.useState(false);
  const [sheet, setSheet] = React.useState(false);
  const [step, setStep] = React.useState<"choose" | "city">("choose");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save(city: string | null) {
    setBusy(true);
    setError(null);
    const r = await saveWhereYouLive("confirm", sel, city);
    setBusy(false);
    if (r.error) return setError(r.error);
    router.refresh();
  }

  if (step === "city") {
    return (
      <CityStep
        country={sel}
        cities={cities}
        defaultCity={null}
        onBack={() => setStep("choose")}
        onSave={save}
        saveLabel="Continue"
        busy={busy}
        error={error}
      />
    );
  }

  const abroad = sel !== "NG";
  return (
    <div className="mx-auto grid w-full max-w-[680px] content-start gap-[22px] px-3.5 pb-6 pt-[18px]">
      <ol aria-label="Sign-up progress" className="m-0 grid list-none grid-cols-4 gap-1.5 px-0.5">
        {STEPS.map(([label, k]) => (
          <li key={label} aria-current={k === "current" ? "step" : undefined} className="grid min-w-0 content-start gap-[7px]">
            <span className={`block h-1 rounded-pill ${k === "done" ? "bg-green-500" : k === "current" ? "bg-gold-500" : "bg-grey-200"}`} />
            <span className={`flex items-start gap-1 text-[12px] leading-[1.3] ${k === "current" ? "font-semibold text-ink-900" : "font-medium text-grey-600"}`}>
              <span>{label}</span>
              {k === "done" ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-label="done" className="mt-px flex-shrink-0">
                  <path d="M5 13l4 4 10-11" stroke="#00695C" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : null}
            </span>
          </li>
        ))}
      </ol>

      <div className="grid gap-2 px-0.5">
        <h2 id="wyl-h" className="m-0 font-serif text-[24px] font-bold leading-[1.2] text-ink-900 [text-wrap:balance]">
          Where do you live?
        </h2>
        <p className="m-0 text-[15px] leading-[1.6] text-ink-800 [text-wrap:pretty]">
          This sets your plans, prices and who you can meet. You can change it later.
        </p>
      </div>

      <CountryOptions
        value={sel}
        guessed={!touched}
        labelledBy="wyl-h"
        onPick={(c) => {
          setSel(c);
          setTouched(true);
        }}
        onSomewhereElse={() => setSheet(true)}
      />

      <div className="grid gap-2.5">
        {abroad && hasCities(sel, cities) ? (
          <p className="m-0 px-0.5 text-[13.5px] leading-[1.55] text-grey-600">Next, you&apos;ll pick your city.</p>
        ) : null}
        {error ? <p role="alert" className="m-0 px-0.5 text-[14px] leading-[1.55] text-ink-900">{error}</p> : null}
        <button type="button" disabled={busy} onClick={() => (abroad && hasCities(sel, cities) ? setStep("city") : save(null))} className={GOLD}>
          {busy ? "Saving…" : "Continue"}
        </button>
      </div>

      {sheet ? (
        <CountrySheet
          value={sel}
          onClose={() => setSheet(false)}
          onPick={(c) => {
            setSel(c);
            setTouched(true);
            setSheet(false);
          }}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Existing members, once — where-you-live-confirm.slim.html. A bottom sheet
// over whatever screen they open; it goes once they've confirmed.
// ---------------------------------------------------------------------------

export function CountryCheckSheet({
  guess,
  onFile,
  cityOnFile,
  cities,
}: {
  guess: string;
  onFile: string;
  cityOnFile: string | null;
  cities: PickerCity[];
}) {
  const router = useRouter();
  const [sel, setSel] = React.useState(guess);
  const [touched, setTouched] = React.useState(false);
  const [view, setView] = React.useState<"choose" | "search" | "city" | "done">("choose");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save(city: string | null) {
    setBusy(true);
    setError(null);
    const r = await saveWhereYouLive("confirm", sel, city);
    setBusy(false);
    if (r.error) return setError(r.error);
    setView("done");
    window.setTimeout(() => router.refresh(), 2600);
  }

  function confirm() {
    const keepCity = sel === onFile && cityOnFile;
    if (sel !== "NG" && !keepCity && hasCities(sel, cities)) return setView("city");
    save(sel === onFile ? cityOnFile : null);
  }

  if (view === "done") return <Toast>Thanks — that&apos;s saved.</Toast>;

  if (view === "city") {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <CityStep
          country={sel}
          cities={cities}
          defaultCity={sel === onFile ? cityOnFile : null}
          onBack={() => setView("choose")}
          onSave={save}
          busy={busy}
          error={error}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-green-800/[.55]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wyc-title"
        className="mx-auto flex max-h-[92%] w-full max-w-[680px] flex-col gap-3.5 rounded-t-[20px] bg-white px-4 pb-[18px] pt-2.5"
      >
        <span aria-hidden="true" className="h-1 w-9 flex-shrink-0 self-center rounded-pill bg-grey-200" />
        {view === "choose" ? (
          <>
            <h2 id="wyc-title" className="m-0 mt-0.5 flex-shrink-0 font-serif text-[21px] font-bold leading-[1.25] text-ink-900 [text-wrap:balance]">
              Quick check — where do you live now?
            </h2>
            <div className="min-h-0 flex-shrink overflow-y-auto">
              <CountryOptions
                value={sel}
                guessed={!touched}
                compact
                labelledBy="wyc-title"
                onPick={(c) => {
                  setSel(c);
                  setTouched(true);
                }}
                onSomewhereElse={() => setView("search")}
              />
            </div>
            {error ? <p role="alert" className="m-0 text-[14px] leading-[1.55] text-ink-900">{error}</p> : null}
            <button type="button" disabled={busy} onClick={confirm} className={`${GOLD} flex-shrink-0`}>
              {busy ? "Saving…" : "Confirm"}
            </button>
          </>
        ) : (
          <>
            <div className="-ml-2.5 flex flex-shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setView("choose")}
                aria-label="Back"
                className="grid h-11 w-11 place-items-center border-0 bg-transparent text-[22px] leading-none text-green-500"
              >
                ‹
              </button>
              <h2 id="wyc-title" className="m-0 font-serif text-[21px] font-bold leading-[1.25] text-ink-900">
                Choose your country
              </h2>
            </div>
            <CountrySearch
              value={sel}
              onPick={(c) => {
                setSel(c);
                setTouched(true);
                setView("choose");
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings — where-you-live-settings.slim.html, the change screen.
// ---------------------------------------------------------------------------

export function CountrySettings({
  current,
  cityOnFile,
  cities,
  lockedUntil,
  plan,
}: {
  current: string;
  cityOnFile: string | null;
  cities: PickerCity[];
  /** "3 April" while inside the 30 days; null when a change is allowed. */
  lockedUntil: string | null;
  /** A paid plan: its name and when the current period ends. */
  plan: { name: string; until: string } | null;
}) {
  const router = useRouter();
  const [sel, setSel] = React.useState(current);
  const [sheet, setSheet] = React.useState(false);
  const [step, setStep] = React.useState<"change" | "city">("change");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const changed = sel !== current;
  const abroad = sel !== "NG";
  const needsCity = changed && abroad && hasCities(sel, cities);

  async function save(city: string | null) {
    setBusy(true);
    setError(null);
    const r = await saveWhereYouLive("change", sel, city);
    setBusy(false);
    if (r.error) return setError(r.error);
    router.push("/profile/settings?saved=where-you-live");
    router.refresh();
  }

  if (step === "city") {
    return (
      <CityStep
        country={sel}
        cities={cities}
        defaultCity={cityOnFile}
        onBack={() => setStep("change")}
        onSave={save}
        busy={busy}
        error={error}
      />
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-[680px] content-start gap-[18px] px-3.5 pb-6 pt-[18px]">
      <p id="wys-h" className="m-0 px-0.5 text-[15px] leading-[1.6] text-ink-800 [text-wrap:pretty]">
        This sets your plans, prices and who you can meet.
      </p>

      {lockedUntil ? (
        <div role="status" className="flex items-start gap-2.5 rounded-lg border border-ink-900/[.12] bg-white px-[13px] py-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-px flex-shrink-0">
            <circle cx="12" cy="12" r="8.6" stroke="#00695C" strokeWidth="1.5" />
            <path d="M12 7.5V12l3 2" stroke="#00695C" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="text-[14.5px] leading-[1.55] text-ink-900 [text-wrap:pretty]">You can change this again on {lockedUntil}.</span>
        </div>
      ) : null}

      <CountryOptions
        value={sel}
        current={current}
        locked={Boolean(lockedUntil)}
        labelledBy="wys-h"
        onPick={setSel}
        onSomewhereElse={() => setSheet(true)}
      />

      {!lockedUntil && plan && changed ? (
        <p className="m-0 rounded-lg bg-green-50 px-[13px] py-3 text-[14px] leading-[1.6] text-green-550 [text-wrap:pretty]">
          Your {plan.name} plan continues until {plan.until}. After that, you&apos;ll see plans for {countryInSentence(sel)}.
        </p>
      ) : null}

      {!lockedUntil ? (
        <div className="grid gap-2.5">
          {needsCity ? <p className="m-0 px-0.5 text-[13.5px] leading-[1.55] text-grey-600">Next, you&apos;ll pick your city.</p> : null}
          {error ? <p role="alert" className="m-0 px-0.5 text-[14px] leading-[1.55] text-ink-900">{error}</p> : null}
          <button
            type="button"
            disabled={!changed || busy}
            onClick={() => (needsCity ? setStep("city") : save(null))}
            className={`min-h-12 rounded-lg border-0 px-5 py-3.5 font-sans text-[15px] font-semibold ${
              changed ? "cursor-pointer bg-gold-500 text-green-800 hover:bg-gold-300" : "cursor-default bg-grey-200 text-grey-600"
            }`}
          >
            {busy ? "Saving…" : needsCity ? "Continue" : "Save"}
          </button>
          <p className="m-0 px-0.5 text-center text-[13px] leading-[1.55] text-grey-600">You can change where you live once every 30 days.</p>
        </div>
      ) : null}

      {sheet ? (
        <CountrySheet
          value={sel}
          onClose={() => setSheet(false)}
          onPick={(c) => {
            setSel(c);
            setSheet(false);
          }}
        />
      ) : null}
    </div>
  );
}

/** The settings list's "Saved." line after a change. */
export function SavedToast({ text }: { text: string }) {
  const router = useRouter();
  const [show, setShow] = React.useState(true);
  React.useEffect(() => {
    const t = window.setTimeout(() => {
      setShow(false);
      router.replace("/profile/settings");
    }, 3000);
    return () => window.clearTimeout(t);
  }, [router]);
  return show ? <Toast>{text}</Toast> : null;
}

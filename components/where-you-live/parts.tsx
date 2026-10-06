"use client";

import * as React from "react";
import { CityPicker, type PickerCity } from "@/components/app/city-picker";
import { COUNTRY_NAME, OTHER_COUNTRIES, TOP_COUNTRIES } from "@/lib/countries";

/**
 * The pieces every where-you-live screen shares — where-you-live,
 * where-you-live-confirm and where-you-live-settings prototypes: the five
 * equal choices, the country search behind "Somewhere else", and the
 * hand-off to the existing city picker.
 */

const TOP = new Set(TOP_COUNTRIES.map((c) => c.code));

const Check = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SearchIcon = () => (
  <span aria-hidden="true" className="absolute left-[14px] top-1/2 grid -translate-y-1/2 place-items-center">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="6.4" stroke="#828184" strokeWidth="1.6" />
      <path d="m16 16 4 4" stroke="#828184" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  </span>
);

/** The phone-number note inside the pre-selected card. */
function GuessNote() {
  return (
    <span className="flex items-start gap-[7px] text-[13px] leading-[1.5] text-green-550 [text-wrap:pretty]">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-[3px] flex-shrink-0">
        <rect x="7" y="3" width="10" height="18" rx="2.2" stroke="#00695C" strokeWidth="1.7" />
        <path d="M11 17.5h2" stroke="#00695C" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
      <span>Based on your phone number — change it if that&apos;s not where you live.</span>
    </span>
  );
}

/**
 * The five choices. `value` is an ISO code; a code outside the top four
 * shows on the "Somewhere else" card. `guessed` shows the phone note on the
 * selected card until the member touches anything.
 */
export function CountryOptions({
  value,
  onPick,
  onSomewhereElse,
  guessed = false,
  current,
  locked = false,
  compact = false,
  labelledBy,
}: {
  value: string;
  onPick: (code: string) => void;
  onSomewhereElse: () => void;
  guessed?: boolean;
  /** Settings: the country on file gets a "Current" tag. */
  current?: string;
  /** Settings, inside the 30 days: read-only. */
  locked?: boolean;
  /** The confirm sheet's slightly shorter rows. */
  compact?: boolean;
  labelledBy: string;
}) {
  const otherOn = !TOP.has(value);
  const rows = [
    ...TOP_COUNTRIES.map((c) => ({ key: c.code, label: c.name, other: false })),
    { key: "OTHER", label: otherOn ? COUNTRY_NAME[value] ?? value : "Somewhere else", other: true },
  ];

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid gap-2">
      {rows.map((o) => {
        const on = o.other ? otherOn : value === o.key;
        const isCurrent = current !== undefined && (o.other ? otherOn && value === current : o.key === current);
        const card = `flex w-full items-center gap-3 rounded-[14px] border text-left ${compact ? "min-h-[52px] px-3.5 py-[11px]" : "min-h-[60px] px-3.5 py-3"} ${
          on ? "border-green-500 bg-green-50" : "border-ink-900/[.14] bg-white"
        }`;
        const title = (
          <span className="flex flex-wrap items-center gap-2">
            <span className={`${compact ? "text-[15.5px]" : "text-[16px]"} font-semibold ${locked && !on ? "text-grey-600" : "text-ink-900"}`}>
              {o.label}
            </span>
            {isCurrent ? (
              <span className={`rounded-pill border border-ink-900/[.12] px-2 py-[3px] text-chip font-semibold text-grey-600 ${locked ? "bg-white" : "bg-paper"}`}>
                Current
              </span>
            ) : null}
          </span>
        );

        if (locked) {
          return (
            <div key={o.key} role="radio" aria-checked={on} aria-disabled="true" className={card}>
              <span className="min-w-0 flex-1">{title}</span>
            </div>
          );
        }

        const showGuess = on && guessed;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={o.other ? onSomewhereElse : () => onPick(o.key)}
            className={`${card} cursor-pointer font-sans hover:border-green-500`}
          >
            <span className="grid min-w-0 flex-1 gap-1">
              {title}
              {o.other && !showGuess ? (
                <span className="text-[13px] leading-[1.5] text-grey-600">
                  {otherOn ? "Somewhere else · tap to change" : "Search all countries"}
                </span>
              ) : null}
              {showGuess ? <GuessNote /> : null}
            </span>
            {!o.other || on ? (
              <span
                aria-hidden="true"
                className={`grid h-[22px] w-[22px] flex-shrink-0 place-items-center rounded-pill border ${
                  on ? "border-green-500 bg-green-500" : "border-ink-900/[.22] bg-transparent"
                }`}
              >
                {on ? <Check /> : null}
              </span>
            ) : (
              <span aria-hidden="true" className="flex-shrink-0 text-[18px] text-grey-400">
                ›
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** The searchable list behind "Somewhere else". */
export function CountrySearch({ value, onPick }: { value: string; onPick: (code: string) => void }) {
  const [q, setQ] = React.useState("");
  const query = q.trim().toLowerCase();
  const list = OTHER_COUNTRIES.filter((c) => !query || c.name.toLowerCase().includes(query));
  return (
    <>
      <span className="relative block flex-shrink-0">
        <SearchIcon />
        <input
          type="text"
          aria-label="Search countries"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search countries"
          autoFocus
          className="min-h-12 w-full rounded-lg border border-ink-900/20 bg-white py-[13px] pl-10 pr-3.5 font-sans text-[15px] text-ink-900 focus:border-green-500 focus:shadow-[0_0_0_3px_rgba(0,105,92,0.16)] focus:outline-none"
        />
      </span>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-[14px] border border-ink-900/[.12]">
        {list.map((c) => {
          const on = value === c.code;
          return (
            <button
              key={c.code}
              type="button"
              onClick={() => onPick(c.code)}
              className={`flex min-h-[52px] w-full items-center justify-between gap-2.5 border-0 border-b border-ink-900/[.07] px-3.5 py-3 text-left font-sans text-[15px] font-medium text-ink-900 hover:bg-paper ${
                on ? "bg-green-50" : "bg-transparent"
              }`}
            >
              <span>{c.name}</span>
              {on ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-label="selected">
                  <path d="M5 13l4 4 10-11" stroke="#00695C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : null}
            </button>
          );
        })}
        {list.length === 0 ? (
          <p className="m-0 px-3.5 py-[18px] text-[14px] leading-[1.6] text-grey-600">
            No country matches that. Check the spelling, or try its English name.
          </p>
        ) : null}
      </div>
    </>
  );
}

/** "Choose your country" as a bottom sheet with Cancel (sign-up, settings). */
export function CountrySheet({ value, onPick, onClose }: { value: string; onPick: (code: string) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-green-800/[.55]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wyl-sheet"
        onClick={(e) => e.stopPropagation()}
        className="mx-auto flex max-h-[88%] w-full max-w-[680px] flex-col gap-3 rounded-t-[20px] bg-white px-4 pb-4 pt-2.5"
      >
        <span aria-hidden="true" className="h-1 w-9 flex-shrink-0 self-center rounded-pill bg-grey-200" />
        <div className="flex flex-shrink-0 items-center justify-between gap-3">
          <h2 id="wyl-sheet" className="m-0 font-serif text-[21px] font-bold leading-[1.25] text-ink-900">
            Choose your country
          </h2>
          <button type="button" onClick={onClose} className="min-h-11 flex-shrink-0 border-0 bg-transparent px-1 font-sans text-[15px] font-semibold text-green-500">
            Cancel
          </button>
        </div>
        <CountrySearch value={value} onPick={onPick} />
      </div>
    </div>
  );
}

/**
 * The hand-off to the existing city picker (city-picker.slim.html),
 * unchanged, under a "Your city" band. Only the chosen country's cities are
 * offered, because the database refuses a city in another country.
 *
 * Addition, flagged: a Save button under the picker. The prototypes save
 * on the tap itself, but the existing picker shows its own "chosen" card
 * with "Choose a different city" first, so it needs a step to finish.
 */
export function CityStep({
  country,
  cities,
  defaultCity,
  onBack,
  onSave,
  saveLabel = "Save",
  busy,
  error,
}: {
  country: string;
  cities: PickerCity[];
  defaultCity: string | null;
  onBack: () => void;
  onSave: (city: string | null) => void;
  saveLabel?: string;
  busy: boolean;
  error: string | null;
}) {
  const formRef = React.useRef<HTMLFormElement>(null);
  const mine = cities.filter((c) => c.country === (COUNTRY_NAME[country] ?? country));
  return (
    <div className="flex min-h-full flex-col bg-paper">
      <div className="flex items-center gap-2.5 bg-green-800 py-[18px] pl-4 pr-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to where you live"
          className="-my-3 -ml-3 grid h-11 w-11 place-items-center border-0 bg-transparent text-[20px] leading-none text-champagne"
        >
          ‹
        </button>
        <p className="m-0 font-serif text-[19px] font-bold text-white">Your city</p>
      </div>
      <form
        ref={formRef}
        className="mx-auto grid w-full max-w-[680px] content-start gap-3.5 px-3.5 pb-[22px] pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          const v = new FormData(e.currentTarget).get("diaspora_city");
          onSave(typeof v === "string" && v ? v : null);
        }}
      >
        <CityPicker cities={mine} defaultValue={mine.some((c) => c.slug === defaultCity) ? defaultCity : null} />
        {error ? <p role="alert" className="m-0 text-[14px] leading-[1.55] text-ink-900">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="min-h-12 rounded-lg border-0 bg-gold-500 px-6 py-3.5 font-sans text-[15px] font-semibold text-green-800 hover:bg-gold-300 disabled:opacity-70"
        >
          {busy ? "Saving…" : saveLabel}
        </button>
      </form>
    </div>
  );
}

/** Whether a country has any cities to pick from. */
export function hasCities(country: string, cities: PickerCity[]) {
  return country !== "NG" && cities.some((c) => c.country === (COUNTRY_NAME[country] ?? country));
}

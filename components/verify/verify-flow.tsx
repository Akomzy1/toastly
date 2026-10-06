"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RingStepper } from "./ring-stepper";
import { ScreenBand } from "@/components/app/screen-band";
import { Input, Label, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import {
  GENERIC_BLOCK,
  GENERIC_ERROR,
  ID_TYPE_OPTIONS,
  REASON_COPY,
} from "@/lib/verification-copy";
import { isVerifiedReal, type VerifyView } from "@/lib/verification-view";
import { boldRuns, CONSENT } from "@/lib/consent";
import { SelfieCapture } from "@/components/app/selfie-capture";
import { startIdCheck } from "@/app/(app)/verify/id-check-actions";

/**
 * The verify page — built against verify-overview.slim.html (screen 1 of 6).
 *
 * Screens 2–6 (before your selfie, checking, outcomes, ID check, ID outcomes)
 * were specified in design/prompts/verification-screens-prompt.md but their
 * exports have not arrived. They are built here from the overview's own
 * cards, type and buttons, and from the genotype consent pattern. NOT YET
 * DESIGN-APPROVED — flagged in SKILL.md; replace with the exports when they
 * land.
 *
 * Every selfie is the in-page check passed in as `selfieStep`; the optional
 * ID check also runs in the page, with Smile ID's own camera (the hosted
 * overlay is retired, decided 6 October 2026). The result is decided by the
 * signed callback, and the page re-reads it from the database.
 *
 * Free on every plan: nothing here reads or mentions a tier.
 */

type Screen = "overview" | "id_form";
type Product = "smartselfie" | "biometric_kyc";
type IdType = (typeof ID_TYPE_OPTIONS)[number]["value"];

export type SandboxOption = { key: string; label: string; products: Product[] };

const ID_PATTERN: Record<IdType, RegExp> = {
  NIN_V2: /^\d{11}$/,
  BVN: /^\d{11}$/,
  V_NIN: /^[A-Za-z0-9]{16}$/,
};

const CARD = "grid gap-3 rounded-xl border border-ink-900/[.12] bg-white px-[15px] py-4";
const CARD_LABEL = "m-0 font-sans text-chip font-semibold uppercase tracking-[0.12em]";
const CARD_BODY = "m-0 text-[14.5px] leading-[1.6] text-ink-800";
const H2 = "m-0 font-serif text-[24px] font-bold leading-[1.2] text-ink-900 [text-wrap:balance]";
const LEAD = "m-0 text-ui leading-[1.6] text-ink-800";
const TEAL =
  "min-h-12 w-full rounded-lg bg-green-500 px-5 py-3.5 text-button text-white transition-colors duration-200 hover:bg-green-600 disabled:cursor-not-allowed disabled:bg-grey-200 disabled:text-grey-600";
const AMBER =
  "flex min-h-12 w-full items-center justify-center rounded-lg bg-gold-500 px-5 py-3.5 text-button text-green-800 no-underline transition-colors duration-200 hover:bg-gold-300";
const OUTLINE =
  "min-h-12 w-full rounded-lg border border-ink-900/20 bg-transparent px-5 py-3.5 text-button text-ink-900 transition-colors duration-200 hover:border-green-500 hover:bg-green-50";
const ON_DARK_OUTLINE =
  "flex min-h-12 w-full items-center justify-center rounded-lg border border-champagne/[.42] bg-transparent px-5 py-3.5 text-button text-champagne no-underline transition-colors duration-200 hover:bg-champagne/[.12]";

/** The ID check's consent: the wording recorded with the agreement (lib/consent.ts). */
const ID_COPY = CONSENT.id_check;

function Seal({ second }: { second: boolean }) {
  return (
    <svg width="64" height="64" viewBox="-1.5 -1.5 27 27" fill="none" aria-hidden="true">
      {second ? <circle cx="12" cy="12" r="12.2" stroke="#EBD9AE" strokeWidth="0.9" /> : null}
      <path
        d="M12 2.5 14.1 4l2.5-.5.9 2.4 2.2 1.3-.6 2.5 1.5 2.1-1.5 2.1.6 2.5-2.2 1.3-.9 2.4-2.5-.5L12 21.5 9.9 20l-2.5.5-.9-2.4-2.2-1.3.6-2.5L3.4 12l1.5-2.1-.6-2.5 2.2-1.3.9-2.4 2.5.5z"
        stroke="#FFB300"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="m8.6 12.2 2.3 2.3 4.5-4.8" stroke="#FFB300" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Consent({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-[13px] py-3.5 ${
        checked ? "border-green-500 bg-green-50" : "border-ink-900/20 bg-white"
      }`}
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden="true"
        className={`mt-px grid h-6 w-6 flex-shrink-0 place-items-center rounded-sm border-[1.5px] peer-focus-visible:ring-[3px] peer-focus-visible:ring-green-500/[.16] ${
          checked ? "border-green-500 bg-green-500" : "border-grey-400 bg-white"
        }`}
      >
        {checked ? (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="m3.5 8.4 3 3 6-6.6" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
      <span className="text-[14.5px] leading-[1.55] text-ink-900">{children}</span>
    </label>
  );
}

function OptionalIdNote() {
  return (
    <div className="grid gap-1 px-1 py-0.5">
      <p className="m-0 text-nav font-semibold text-ink-900">ID check · Optional</p>
      <p className="m-0 text-nav leading-[1.55] text-grey-600">
        Available after Verified Real, if you&rsquo;d like it. It adds a second ring to your seal.
      </p>
    </div>
  );
}

function Heading({ title, lead }: { title: string; lead: string }) {
  return (
    <div className="grid gap-2">
      <h2 className={H2}>{title}</h2>
      <p className={LEAD}>{lead}</p>
    </div>
  );
}

function SandboxPicker({
  options,
  product,
  value,
  onChange,
}: {
  options: SandboxOption[];
  product: Product;
  value: string;
  onChange: (v: string) => void;
}) {
  const list = options.filter((o) => o.products.includes(product));
  return (
    <Label>
      Sandbox test identity (testing only — never shown on the live site)
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {list.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </Select>
    </Label>
  );
}

function reasonFor(status: "block" | "error", code: string | null) {
  if (status === "error") return GENERIC_ERROR;
  return (code && REASON_COPY[code]) || GENERIC_BLOCK;
}

export function VerifyFlow({
  view,
  phoneStep,
  afterVerified,
  sandbox = [],
  initialScreen = "overview",
  selfieStep,
  live = true,
  reverify = false,
  idConfirmed = false,
  idTypes = ["NIN_V2", "BVN"],
}: {
  /** The member holds the ID ring — shown as it stands during a re-check. */
  idConfirmed?: boolean;
  /** The ID types offered, from the server (enabledIdTypes()). */
  idTypes?: readonly string[];
  /** A re-check a reviewer asked for: "Verified Real · Re-check". */
  reverify?: boolean;
  view: VerifyView;
  /** The phone step, rendered while the member is unverified. */
  phoneStep?: React.ReactNode;
  /**
   * The in-page selfie (0029): at onboarding, photos first and then one
   * selfie that checks liveness and the main photo; when a reviewer asked
   * for a re-check, one selfie against the enrolled face. Every selfie runs
   * here — the hosted selfie is retired (decided 6 October 2026).
   */
  selfieStep?: React.ReactNode;
  /** Whether the profile is live — Verified Real alone doesn't show it to anyone. */
  live?: boolean;
  /** Shown beneath the passed states (the photo-visibility choice). */
  afterVerified?: React.ReactNode;
  /** Sandbox test identities — passed only when the server allows them. */
  sandbox?: SandboxOption[];
  /** For the /audit harness only. */
  initialScreen?: Screen;
}) {
  const router = useRouter();
  const [screen, setScreen] = React.useState<Screen>(initialScreen);
  const [agreed, setAgreed] = React.useState(false);
  const [surname, setSurname] = React.useState("");
  const [givenNames, setGivenNames] = React.useState("");
  const [idType, setIdType] = React.useState<IdType | null>(null);
  const [idNumber, setIdNumber] = React.useState("");
  const [testIdentity, setTestIdentity] = React.useState("clear");
  const [busy, setBusy] = React.useState(false);
  const [capturing, setCapturing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const verified = isVerifiedReal(view);
  const checking = view.kind === "selfie_checking" || view.kind === "id_checking";
  const useSandbox = sandbox.length > 0;

  // While a result is pending, re-read it quietly. The member can leave; the
  // page shows the result next time either way.
  React.useEffect(() => {
    if (!checking) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - started > 15 * 60 * 1000) return window.clearInterval(timer);
      router.refresh();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [checking, router]);

  function open(next: Screen) {
    setAgreed(false);
    setError(null);
    setScreen(next);
  }

  // The ID check runs in the page (decided 6 October 2026): Smile ID's own
  // camera takes ONE capture, which goes to startIdCheck() — Biometric KYC
  // against the record, and Authentication against the face registered at
  // onboarding. Nothing is stored; the result arrives on the signed callback.
  function submitIdCheck(selfie: Blob, liveness: Blob[]) {
    const form = new FormData();
    form.append("agreed", agreed ? "on" : "");
    form.append("id_type", idType ?? "");
    form.append("id_number", idNumber);
    form.append("given_names", givenNames);
    form.append("surname", surname);
    if (useSandbox) form.append("sandbox_identity", testIdentity);
    form.append("selfie", selfie, "selfie.jpg");
    liveness.forEach((f, i) => form.append("liveness", f, `liveness-${i}.jpg`));
    setCapturing(false);
    setBusy(true);
    setError(null);
    startIdCheck(null, form)
      .then((r) => {
        if (r?.error) return setError(r.error);
        setIdNumber("");
        setScreen("overview");
        router.refresh();
      })
      .catch(() => setError(GENERIC_ERROR))
      .finally(() => setBusy(false));
  }

  // --- Screen 5: the ID check ---------------------------------------------
  if (screen === "id_form" && capturing) {
    return (
      <Shell view={view} reverify={reverify} idDone={idConfirmed}>
        <SelfieCapture
          onCaptured={({ selfie, liveness }) => submitIdCheck(selfie, liveness)}
          onCancel={() => setCapturing(false)}
        />
      </Shell>
    );
  }

  if (screen === "id_form") {
    const numberOk = idType ? ID_PATTERN[idType].test(idNumber.replace(/\s+/g, "")) : false;
    const namesOk = useSandbox || (givenNames.trim().length > 0 && surname.trim().length > 0);
    const ready = agreed && numberOk && namesOk && !busy;
    const hint = ID_TYPE_OPTIONS.find((o) => o.value === idType)?.hint;
    const offered = ID_TYPE_OPTIONS.filter((o) => idTypes.includes(o.value));
    return (
      <Shell view={view} reverify={reverify} idDone={idConfirmed}>
        <div className="grid gap-[18px]">
          <Heading title={ID_COPY.title} lead={ID_COPY.body[0]} />
          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="mb-2 text-nav font-medium text-grey-600">Which ID?</legend>
            <div className={`grid gap-2 ${offered.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
              {offered.map((o) => (
                <label
                  key={o.value}
                  className={`grid min-h-12 cursor-pointer place-items-center rounded-lg border px-2 py-3 text-center text-[14.5px] font-semibold ${
                    idType === o.value ? "border-green-500 bg-green-50 text-ink-900" : "border-ink-900/20 bg-white text-ink-900"
                  }`}
                >
                  <input
                    type="radio"
                    name="id_type"
                    value={o.value}
                    checked={idType === o.value}
                    onChange={() => setIdType(o.value)}
                    className="sr-only"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>
          <Label htmlFor="id_number">
            {hint ? `Your number — ${hint}` : "Your number"}
            <Input
              id="id_number"
              inputMode={idType === "V_NIN" ? "text" : "numeric"}
              autoComplete="off"
              value={idNumber}
              maxLength={16}
              disabled={!idType}
              onChange={(e) => setIdNumber(e.target.value)}
            />
          </Label>
          {useSandbox ? (
            <SandboxPicker options={sandbox} product="biometric_kyc" value={testIdentity} onChange={setTestIdentity} />
          ) : (
            <>
              <Label htmlFor="given_names">
                First name, as on your ID
                <Input
                  id="given_names"
                  autoComplete="given-name"
                  value={givenNames}
                  maxLength={80}
                  onChange={(e) => setGivenNames(e.target.value)}
                />
              </Label>
              <Label htmlFor="id_surname">
                Surname, as on your ID
                <Input
                  id="id_surname"
                  autoComplete="family-name"
                  value={surname}
                  maxLength={60}
                  onChange={(e) => setSurname(e.target.value)}
                />
              </Label>
            </>
          )}
          {ID_COPY.body.slice(1).map((p, i) => (
            <p key={i} className={CARD_BODY}>
              {boldRuns(p).map((r, j) => (r.bold ? <strong key={j}>{r.text}</strong> : <React.Fragment key={j}>{r.text}</React.Fragment>))}
            </p>
          ))}
          <Consent checked={agreed} onChange={setAgreed}>
            {ID_COPY.checkbox}
          </Consent>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <div className="grid gap-2.5">
            <button type="button" disabled={!ready} onClick={() => setCapturing(true)} className={TEAL}>
              {busy ? "Sending…" : ID_COPY.primary}
            </button>
            <button type="button" onClick={() => open("overview")} className={OUTLINE}>
              {ID_COPY.secondary}
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // --- Screen 1 (overview) and the outcome states (screens 3, 4 and 6) ----
  return (
    <Shell view={view} reverify={reverify} idDone={idConfirmed}>
      {view.kind === "phone" ? phoneStep : null}

      {view.kind === "start" ? (
        <div className="grid gap-[18px]">
          {/* A re-check opens straight on its own consent (screen 4): no
              "one more step", and never why the member was asked. */}
          {reverify ? null : (
            <Heading
              title="Verify your profile"
              lead="Your phone number is confirmed. One more step and your profile can be seen by other members."
            />
          )}
          {selfieStep}
          {reverify ? null : <OptionalIdNote />}
        </div>
      ) : null}

      {view.kind === "selfie_checking" ? (
        <div className="grid gap-[18px]">
          <Heading
            title="We're checking your selfie"
            lead="This usually takes a minute — you can leave this page and we'll show the result here next time."
          />
          <div className={`${CARD} gap-1.5`}>
            <h3 className={`${CARD_LABEL} text-green-500`}>Verified Real · Being checked</h3>
            <p className={CARD_BODY}>Smile ID is confirming it&rsquo;s a live person. Toastly will keep only the result.</p>
          </div>
          {reverify ? null : <OptionalIdNote />}
        </div>
      ) : null}

      {view.kind === "selfie_review" ? (
        <div className="grid gap-[18px]">
          <Heading
            title="A person on our team is taking a look"
            lead="Your check finished but needs a human look. You don't need to do anything — we'll show the result here."
          />
          {reverify ? null : <OptionalIdNote />}
        </div>
      ) : null}

      {view.kind === "selfie_retry" ? (
        <div className="grid gap-[18px]">
          <Heading
            title={view.status === "error" ? "Something went wrong on our side" : "We couldn't confirm it this time"}
            lead={reasonFor(view.status, view.code)}
          />
          {selfieStep}
          {reverify ? null : <OptionalIdNote />}
        </div>
      ) : null}

      {verified && view.kind !== "both" ? (
        <div className="grid gap-[18px]">
          <div className="grid justify-items-start gap-3.5 rounded-xl bg-green-800 px-[18px] py-[22px]">
            <Seal second={false} />
            <div className="grid gap-1.5">
              <h2 className="m-0 font-serif text-[24px] font-bold leading-[1.2] text-white">You&rsquo;re Verified Real</h2>
              <p className="m-0 text-ui leading-[1.6] text-white/80">
                {live
                  ? "Your profile can now be seen by other members."
                  : "Your profile goes live once you have four photos and your main photo is confirmed as you."}
              </p>
            </div>
            <Link href={live ? "/profile/edit" : "/profile/photos"} className={AMBER}>
              {live ? "Set up your profile" : "Your photos"}
            </Link>
          </div>

          {view.kind === "passed" ? (
            <div className={CARD}>
              <div className="grid gap-1.5">
                <h3 className={`${CARD_LABEL} text-grey-600`}>ID check · Optional</h3>
                <p className={CARD_BODY}>
                  Check your NIN or BVN against the official record to add a second ring to your seal. You can do it
                  any time, or never.
                </p>
              </div>
              <button type="button" onClick={() => open("id_form")} className={OUTLINE}>
                Check my ID
              </button>
            </div>
          ) : null}

          {view.kind === "id_checking" ? (
            <div className={`${CARD} gap-1.5`}>
              <h3 className={`${CARD_LABEL} text-green-500`}>ID check · Being checked</h3>
              <p className={CARD_BODY}>
                Smile ID is checking your number against the official record. This usually takes a minute — you can
                leave this page.
              </p>
            </div>
          ) : null}

          {view.kind === "id_review" ? (
            <div className={`${CARD} gap-1.5`}>
              <h3 className={`${CARD_LABEL} text-green-500`}>ID check · Being reviewed</h3>
              <p className={CARD_BODY}>A person on our team is taking a look. You don&rsquo;t need to do anything.</p>
            </div>
          ) : null}

          {view.kind === "id_retry" ? (
            <div className={CARD}>
              <div className="grid gap-1.5">
                <h3 className={`${CARD_LABEL} text-grey-600`}>
                  {view.status === "error" ? "ID check · Something went wrong" : "ID check · We couldn't confirm it"}
                </h3>
                <p className={CARD_BODY}>{reasonFor(view.status, view.code)}</p>
              </div>
              <div className="grid gap-2.5">
                <button type="button" onClick={() => open("id_form")} className={OUTLINE}>
                  Try again
                </button>
              </div>
              <p className="m-0 text-nav leading-[1.55] text-grey-600">
                It&rsquo;s optional — you&rsquo;re fully verified without it.
              </p>
            </div>
          ) : null}

          {afterVerified}
        </div>
      ) : null}

      {view.kind === "both" ? (
        <div className="grid gap-[18px]">
          <div className="grid justify-items-start gap-3.5 rounded-xl bg-green-800 px-[18px] py-[22px]">
            <Seal second />
            <div className="grid gap-1.5">
              <h2 className="m-0 font-serif text-[24px] font-bold leading-[1.2] text-white">Verified Real, with ID</h2>
              <p className="m-0 text-ui leading-[1.6] text-white/80">
                Both checks are done and your seal has its second ring. There&rsquo;s nothing more to do here.
              </p>
            </div>
            <Link href="/profile" className={ON_DARK_OUTLINE}>
              Back to your profile
            </Link>
          </div>
          {afterVerified}
        </div>
      ) : null}
    </Shell>
  );
}

function Shell({ view, reverify, idDone, children }: { view: VerifyView; reverify: boolean; idDone: boolean; children: React.ReactNode }) {
  const live = isVerifiedReal(view);
  const sub = reverify ? "Verified Real · Re-check" : live ? "Your profile is visible" : "Your profile goes live once you're Verified Real";
  return (
    <div className="mx-auto grid w-full max-w-[680px]">
      <ScreenBand title="Verification" sub={sub} />
      <div className="grid content-start gap-[18px] px-4 pb-6 pt-5">
        <RingStepper view={view} reverify={reverify} idDone={idDone} />
        {children}
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldMessage, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { DEFAULT_GENDER_OPTIONS } from "@/lib/gender-options";

// Owner-authorised design, 20 November 2026. Admissions remain server-owned.
type Option = { readonly code: string; readonly label: string };
type Result = { kind: "done"; message: string } | { kind: "error"; field?: string; message: string } | null;
const PROBLEM: Record<string, string> = {
  first_name: "Enter your first name using letters, spaces, apostrophes or hyphens.",
  age: "Enter your age as a whole number between 18 and 99.",
  under_18: "Toastly is for people aged 18 and over.",
  gender: "Choose woman or man.",
  location_type: "Choose where you live.",
  lagos_area: "Choose your area of Lagos.",
  other_location: "Enter your state or country using letters, spaces or punctuation.",
  phone: "Enter a Nigerian mobile number, such as 0803 123 4567.",
  source: "Tell us how you heard about us.",
  consent: "Please agree to how we use your answers before applying.",
};

function FormSelect({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <div className="relative"><Select {...props} className="min-h-12 pr-10 text-body">{children}</Select><ChevronDown size={17} aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-green-550" /></div>;
}

export function BetaForm({ areas, locationTypes, sources, honeypotField }: {
  areas: readonly Option[]; locationTypes: readonly Option[]; sources: readonly Option[]; honeypotField: string;
}) {
  const [where, setWhere] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<Result>(null);
  const formRef = React.useRef<HTMLFormElement>(null);
  const noticeRef = React.useRef<HTMLDivElement>(null);
  const submitting = React.useRef(false);
  const problemField = result?.kind === "error" ? (result.field === "under_18" ? "age" : result.field) : undefined;

  React.useEffect(() => {
    if (!result) return;
    if (result.kind === "error" && result.field) {
      const name = result.field === "under_18" ? "age" : result.field;
      const field = formRef.current?.querySelector<HTMLElement>(`[name="${name}"]`);
      field?.focus({ preventScroll: true });
      field?.scrollIntoView({ block: "center", behavior: "instant" });
    } else {
      noticeRef.current?.focus();
    }
  }, [result]);

  const error = (field: string) => problemField === field && result?.kind === "error"
    ? <FieldMessage id={`${field}-error`} tone="error">{result.message}</FieldMessage> : null;
  const accessibility = (field: string, hint?: string) => ({
    "aria-invalid": problemField === field ? true : undefined,
    "aria-describedby": [hint, problemField === field ? `${field}-error` : undefined].filter(Boolean).join(" ") || undefined,
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setResult(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch("/api/beta/apply", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ ...Object.fromEntries(form.entries()), consent: form.get("consent") === "on" }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string; field?: string };
      if (res.ok && data.ok && data.message) {
        setResult({ kind: "done", message: data.message });
      } else if (data.error === "invalid") {
        const field = data.field && Object.hasOwn(PROBLEM, data.field) ? data.field : undefined;
        setResult({ kind: "error", field, message: PROBLEM[field ?? ""] ?? "Check your answers and try again." });
      } else if (data.error === "too_many") {
        setResult({ kind: "error", message: "Too many tries from this connection. Please try again in an hour." });
      } else if (data.error === "not_open") {
        setResult({ kind: "error", message: "Applications aren’t open right now. Please check back soon." });
      } else {
        setResult({ kind: "error", message: "We couldn’t send your application. Your answers are still here. Please try again." });
      }
    } catch {
      setResult({ kind: "error", message: "We couldn’t confirm your application was received. Check your connection and try again; applying again won’t create a second application." });
    } finally {
      window.clearTimeout(timeout);
      submitting.current = false;
      setPending(false);
    }
  }

  if (result?.kind === "done") {
    return (
      <div ref={noticeRef} tabIndex={-1} className="py-8 focus:outline-none" role="status" aria-live="polite">
        <span className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-550"><Check size={24} aria-hidden="true" /></span>
        <h3 className="text-h4 text-green-800">You&rsquo;ve taken the first step.</h3>
        <p className="mt-4 text-body text-grey-600">{result.message}</p>
        <p className="mt-5 border-t border-green-800/15 pt-5 text-ui text-grey-600">There&rsquo;s nothing else to do for now. An application isn&rsquo;t an invitation yet.</p>
        <Link href="/how-it-works" className="mt-5 inline-flex min-h-11 items-center gap-2 font-semibold text-green-550 underline underline-offset-4">Explore how Toastly works <ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
    );
  }

  const label = "text-ui font-medium text-ink-900";
  return (
    <form ref={formRef} onSubmit={submit} className="grid gap-6" noValidate aria-busy={pending}>
      {result?.kind === "error" && !result.field ? <div ref={noticeRef} tabIndex={-1} className="focus:outline-none"><Notice tone="error">{result.message}</Notice></div> : null}
      <fieldset disabled={pending} className="grid min-w-0 gap-5">
        <legend className="mb-5 text-caption font-semibold uppercase tracking-eyebrow text-green-550">01 / A little about you</legend>
        <div className="grid gap-2">
          <label htmlFor="first_name" className={label}>First name</label>
          <Input id="first_name" name="first_name" autoComplete="given-name" maxLength={40} placeholder="Your first name" className="min-h-12 text-body" required {...accessibility("first_name")} />
          {error("first_name")}
        </div>
        <div className="grid grid-cols-[80px_minmax(0,1fr)] items-start gap-4 sm:grid-cols-[100px_minmax(0,1fr)]">
          <div className="grid gap-2">
            <label htmlFor="age" className={label}>Age</label>
            <Input id="age" name="age" type="number" inputMode="numeric" min={18} max={99} placeholder="18+" className="min-h-12 text-body" required {...accessibility("age")} />
          </div>
          <fieldset className="min-w-0" {...accessibility("gender")}>
            <legend className={`${label} mb-2`}>Gender</legend>
            <div className="grid grid-cols-2 gap-2">
              {DEFAULT_GENDER_OPTIONS.map((o) => <label key={o.code} className="relative min-w-0 cursor-pointer">
                <input type="radio" name="gender" value={o.code} required className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0" {...accessibility("gender")} />
                <span className="flex min-h-[54px] items-center justify-center rounded-lg border border-ink-900/20 bg-white px-2 text-ui text-grey-600 peer-checked:border-green-550 peer-checked:bg-green-50 peer-checked:font-semibold peer-checked:text-green-550 peer-focus-visible:ring-[3px] peer-focus-visible:ring-green-500/30">{o.label}</span>
              </label>)}
            </div>
            {error("gender")}
          </fieldset>
        </div>
        {error("age")}
        <div className="grid gap-2">
          <label htmlFor="location_type" className={label}>Where do you live?</label>
          <FormSelect id="location_type" name="location_type" value={where} onChange={(e) => setWhere(e.target.value)} required {...accessibility("location_type")}>
            <option value="" disabled>Select your location</option>
            {locationTypes.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
          </FormSelect>
          {error("location_type")}
        </div>
        {where === "lagos" ? <div className="grid gap-2">
          <label htmlFor="lagos_area" className={label}>Which part of Lagos?</label>
          <FormSelect id="lagos_area" name="lagos_area" defaultValue="" required {...accessibility("lagos_area")}>
            <option value="" disabled>Select your area</option>
            {areas.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
          </FormSelect>{error("lagos_area")}
        </div> : null}
        {where === "elsewhere_nigeria" || where === "outside_nigeria" ? <div className="grid gap-2">
          <label htmlFor="other_location" className={label}>{where === "outside_nigeria" ? "Which country?" : "Which state?"}</label>
          <Input id="other_location" name="other_location" maxLength={80} className="min-h-12 text-body" required {...accessibility("other_location", "location-hint")} />
          <p id="location-hint" className="text-caption tracking-normal text-grey-600">We&rsquo;re starting in Lagos. You can still let us know you&rsquo;re interested.</p>
          {error("other_location")}
        </div> : null}
      </fieldset>
      <fieldset disabled={pending} className="grid min-w-0 gap-5 border-t border-green-800/15 pt-6">
        <legend className="float-left mb-5 w-full text-caption font-semibold uppercase tracking-eyebrow text-green-550">02 / Stay in touch</legend>
        <div className="grid gap-2">
          <label htmlFor="phone" className={label}>Phone number</label>
          <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0803 123 4567" maxLength={24} className="min-h-12 text-body" required {...accessibility("phone", "phone-hint")} />
          <p id="phone-hint" className="text-caption tracking-normal text-grey-600">A Nigerian (+234) number. The sign-in code only works for Nigerian numbers for now.</p>
          {error("phone")}
        </div>
        <div className="grid gap-2">
          <label htmlFor="source" className={label}>How did you hear about us?</label>
          <FormSelect id="source" name="source" defaultValue="" required {...accessibility("source")}>
            <option value="" disabled>Select an option</option>
            {sources.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
          </FormSelect>{error("source")}
        </div>
      </fieldset>
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor={honeypotField}>Leave this empty</label>
        <input id={honeypotField} name={honeypotField} type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>
      <div className="grid gap-2 border-t border-green-800/15 pt-5">
        <label htmlFor="consent" className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-ui text-grey-600">
          <input id="consent" name="consent" type="checkbox" disabled={pending} required className="mt-0.5 h-5 w-5 shrink-0 accent-green-550" {...accessibility("consent")} />
          <span>I agree Toastly can use these answers to choose beta members.</span>
        </label>{error("consent")}
        <Link href="/privacy" className="inline-flex min-h-11 w-fit items-center text-caption tracking-normal text-green-550 underline underline-offset-4">Read our privacy policy</Link>
      </div>
      <Button type="submit" variant="accent" disabled={pending} className="min-h-[54px] w-full justify-between px-5">
        {pending ? "Sending your application…" : "Apply for the beta"}<ArrowRight size={18} aria-hidden="true" />
      </Button>
      <p className="flex items-start justify-center gap-2 text-center text-caption tracking-normal text-grey-600"><LockKeyhole size={14} aria-hidden="true" className="mt-0.5 shrink-0" />Your answers are for the Toastly team, not a public profile.</p>
      <noscript><p className="text-ui text-error">Please enable JavaScript to send this application.</p></noscript>
    </form>
  );
}

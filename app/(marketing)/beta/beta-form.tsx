"use client";

/**
 * PLACEHOLDER — pending the Claude Design prototype (beta.html). The prototype
 * is the source of truth; restyle to it when it arrives and delete this note.
 *
 * The application form. It posts JSON to /api/beta/apply, which does every
 * check again (lib/beta.ts). Nothing here decides who is let in. The error
 * sentences are plain placeholders, to be replaced by the prototype's copy.
 *
 * The choices arrive as props from the page: lib/beta.ts uses node:crypto, so a
 * client component must not import it.
 */
type Option = { readonly code: string; readonly label: string };

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldMessage, Input, Label, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { DEFAULT_GENDER_OPTIONS } from "@/lib/gender-options";

const PROBLEM: Record<string, string> = {
  first_name: "Enter your first name.",
  age: "Enter your age.",
  under_18: "Toastly is for people aged 18 and over.",
  gender: "Choose woman or man.",
  location_type: "Choose where you live.",
  lagos_area: "Choose your area of Lagos.",
  other_location: "Tell us the state or country.",
  phone: "Enter a Nigerian mobile number (+234).",
  source: "Tell us how you heard about us.",
  consent: "Tick the box to apply.",
};

type Result = { kind: "done"; message: string } | { kind: "error"; field?: string; message: string } | null;

export function BetaForm({
  areas,
  locationTypes,
  sources,
  honeypotField,
}: {
  areas: readonly Option[];
  locationTypes: readonly Option[];
  sources: readonly Option[];
  honeypotField: string;
}) {
  const [where, setWhere] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<Result>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setResult(null);
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      const res = await fetch("/api/beta/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, consent: form.get("consent") === "on" }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string; field?: string };
      if (res.ok && data.ok) {
        setResult({ kind: "done", message: data.message ?? "Thanks." });
      } else if (data.error === "invalid") {
        setResult({ kind: "error", field: data.field, message: PROBLEM[data.field ?? ""] ?? "Check your answers and try again." });
      } else if (data.error === "too_many") {
        setResult({ kind: "error", message: "Too many tries from this connection. Please try again in an hour." });
      } else if (data.error === "not_open") {
        setResult({ kind: "error", message: "Applications open on 27 October." });
      } else {
        setResult({ kind: "error", message: "Something went wrong. Please try again." });
      }
    } catch {
      setResult({ kind: "error", message: "Something went wrong. Please try again." });
    } finally {
      setPending(false);
    }
  }

  if (result?.kind === "done") {
    return <Notice tone="success">{result.message}</Notice>;
  }

  const problem = (field: string) =>
    result?.kind === "error" && result.field === field ? <FieldMessage tone="error">{result.message}</FieldMessage> : null;

  return (
    <Card className="p-[26px]">
      <form onSubmit={submit} className="grid gap-5" noValidate>
        {result?.kind === "error" && !result.field ? <Notice tone="error">{result.message}</Notice> : null}

        <Label htmlFor="first_name">
          First name
          <Input id="first_name" name="first_name" autoComplete="given-name" required />
          {problem("first_name")}
        </Label>

        <Label htmlFor="age">
          Age
          <Input id="age" name="age" type="number" inputMode="numeric" min={18} max={99} required />
          {problem("age")}
          {problem("under_18")}
        </Label>

        <Label htmlFor="gender">
          Gender
          <Select id="gender" name="gender" defaultValue="" required>
            <option value="" disabled>
              Select…
            </option>
            {DEFAULT_GENDER_OPTIONS.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </Select>
          {problem("gender")}
        </Label>

        <Label htmlFor="location_type">
          Where do you live?
          <Select
            id="location_type"
            name="location_type"
            value={where}
            onChange={(e) => setWhere(e.target.value)}
            required
          >
            <option value="" disabled>
              Select…
            </option>
            {locationTypes.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </Select>
          {problem("location_type")}
        </Label>

        {where === "lagos" ? (
          <Label htmlFor="lagos_area">
            Which part of Lagos?
            <Select id="lagos_area" name="lagos_area" defaultValue="" required>
              <option value="" disabled>
                Select…
              </option>
              {areas.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.label}
                </option>
              ))}
            </Select>
            {problem("lagos_area")}
          </Label>
        ) : null}

        {where === "elsewhere_nigeria" || where === "outside_nigeria" ? (
          <Label htmlFor="other_location">
            {where === "outside_nigeria" ? "Which country?" : "Which state?"}
            <Input id="other_location" name="other_location" required />
            {problem("other_location")}
          </Label>
        ) : null}

        <Label htmlFor="phone">
          Phone number
          <Input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="0803 123 4567" required />
          <span className="text-caption tracking-normal text-grey-400">
            A Nigerian (+234) number. The sign-in code only works for Nigerian numbers for now.
          </span>
          {problem("phone")}
        </Label>

        <Label htmlFor="source">
          How did you hear about us?
          <Select id="source" name="source" defaultValue="" required>
            <option value="" disabled>
              Select…
            </option>
            {sources.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </Select>
          {problem("source")}
        </Label>

        {/* The honeypot: a field no person sees or fills in. Off-screen, out of the tab order. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label htmlFor={honeypotField}>Leave this empty</label>
          <input id={honeypotField} name={honeypotField} type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
        </div>

        <div className="grid gap-2">
          <label htmlFor="consent" className="flex items-start gap-3 text-ui text-ink-900">
            <input id="consent" name="consent" type="checkbox" className="mt-1 h-5 w-5 accent-green-500" />
            <span>I agree Toastly can use these answers to choose beta members.</span>
          </label>
          {problem("consent")}
        </div>

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Sending…" : "Apply"}
        </Button>
      </form>
    </Card>
  );
}

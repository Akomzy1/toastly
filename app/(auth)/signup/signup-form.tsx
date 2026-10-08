"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { signUp } from "../actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { VerifiedSeal } from "@/components/ui/verified-seal";
import type { GenderOption } from "@/lib/gender-options";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Creating your account…" : "Create account"}
    </Button>
  );
}

/**
 * The sign-up form. Gender and "who you'd like to meet" are required and
 * come from the config list (gender_options, 0036) — decided 8 October 2026.
 *
 * NOT IN THE PROTOTYPE — flagged: the "Who you'd like to meet" checkboxes.
 * Built from the form's existing field and checkbox styles until a design
 * exists.
 */
export function SignUpForm({ options }: { options: GenderOption[] }) {
  const [state, action] = useFormState(signUp, null);

  return (
    <>
      <div className="grid gap-2">
        <h1 className="text-h3 text-ink-900">Create your account</h1>
        <p className="text-ui text-grey-600">
          Verification comes next and takes about four minutes. Your profile
          stays invisible until it passes.
        </p>
      </div>

      <Card className="p-[26px]">
        <form action={action} className="grid gap-5">
          {state?.error ? <Notice tone="error">{state.error}</Notice> : null}

          <Label htmlFor="display_name">
            Your name
            <Input
              id="display_name"
              name="display_name"
              autoComplete="given-name"
              required
              placeholder="Adaeze"
            />
          </Label>

          <Label htmlFor="email">
            Email
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </Label>

          <Label htmlFor="date_of_birth">
            Date of birth
            <Input
              id="date_of_birth"
              name="date_of_birth"
              type="date"
              autoComplete="bday"
              required
            />
            <span className="text-caption tracking-normal text-grey-400">
              Toastly is for people aged 18 and over. Your date of birth is
              never shown to other members.
            </span>
          </Label>

          <Label htmlFor="password">
            Password
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
            <span className="text-caption tracking-normal text-grey-400">
              At least 8 characters.
            </span>
          </Label>

          {/*
            Required (decided 8 October 2026): it decides who sees whom, and
            the women's launch offer is granted when the profile goes live
            (0035). Locked once the profile is live; support can change it.
          */}
          <Label htmlFor="gender">
            I am
            <Select id="gender" name="gender" defaultValue="" required>
              <option value="" disabled>
                Select…
              </option>
              {options.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Label>

          <fieldset className="m-0 grid gap-1 border-0 p-0">
            <legend className="mb-1 text-ui font-medium text-ink-900">Who you&rsquo;d like to meet</legend>
            {options.map((o) => (
              <label key={o.code} className="flex min-h-11 cursor-pointer items-center gap-3 text-ui text-ink-900">
                <input type="checkbox" name="seeking" value={o.code} className="h-4 w-4 accent-green-500" />
                {o.plural}
              </label>
            ))}
            <span className="text-caption tracking-normal text-grey-400">
              Choose one or more. You&rsquo;ll only meet people who&rsquo;d like to meet you too.
            </span>
          </fieldset>

          <Notice tone="info">
            <span className="flex gap-2.5">
              <VerifiedSeal size={16} className="mt-0.5 text-green-550" />
              <span>
                Women get 30 days of Premium Plus free from the day their profile
                goes live — or Diaspora Plus if you live abroad. No card needed.
              </span>
            </span>
          </Notice>

          <Submit />

          <p className="text-caption tracking-normal text-grey-600">
            By continuing you agree to our{" "}
            <Link href="/terms" className="-mx-[3px] px-[3px] py-[14.5px] text-green-500">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="py-[14.5px] text-green-500">
              Privacy Policy
            </Link>
            .
          </p>
        </form>
      </Card>

      <p className="text-center text-ui text-grey-600">
        Already have an account?{" "}
        <Link href="/login" className="py-[13px] font-semibold text-green-500">
          Sign in
        </Link>
      </p>
    </>
  );
}

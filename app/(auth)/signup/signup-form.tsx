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
 * The sign-up form. "I am" — woman or man — is required (0036, decided
 * 8 October 2026); a man meets women and a woman meets men.
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
            Required (decided 8 October 2026): woman or man. A man meets
            women and a woman meets men; the women's launch offer is granted
            when the profile goes live (0035). Locked once the profile is
            live; support can change it.
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

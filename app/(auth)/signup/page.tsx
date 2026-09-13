"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { signUp } from "../actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { VerifiedSeal } from "@/components/ui/verified-seal";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Creating your account…" : "Create account"}
    </Button>
  );
}

export default function SignUpPage() {
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
            Collected here because the women's launch offer is granted at
            signup as a real entitlement — 30 days of full Premium Plus, no
            card. "Prefer not to say" is a first-class option and costs the
            member nothing except that offer.
          */}
          <Label htmlFor="gender">
            I am
            <Select id="gender" name="gender" defaultValue="">
              <option value="" disabled>
                Select…
              </option>
              <option value="woman">A woman</option>
              <option value="man">A man</option>
              <option value="non_binary">Non-binary</option>
              <option value="prefer_not_to_say">Prefer not to say</option>
            </Select>
          </Label>

          <Notice tone="info">
            <span className="flex gap-2.5">
              <VerifiedSeal size={16} className="mt-0.5 text-green-550" />
              <span>
                Women get 30 days of Premium Plus free from the day they verify
                — live-video Gist and incognito mode, no card needed.
              </span>
            </span>
          </Notice>

          <Submit />

          <p className="text-caption tracking-normal text-grey-600">
            By continuing you agree to our{" "}
            <Link href="/terms" className="text-green-500">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-green-500">
              Privacy Policy
            </Link>
            .
          </p>
        </form>
      </Card>

      <p className="text-center text-ui text-grey-600">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-green-500">
          Sign in
        </Link>
      </p>
    </>
  );
}

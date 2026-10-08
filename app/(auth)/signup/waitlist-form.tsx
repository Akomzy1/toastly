"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { joinWaitlist } from "../actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import type { GenderOption } from "@/lib/gender-options";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Adding you…" : "Join the waitlist"}
    </Button>
  );
}

/**
 * The waitlist (decided 8 October 2026): public sign-up shows it while
 * LAUNCH_PAYMENTS_ENABLED is off. Email, city, woman or man — and a one-line
 * privacy notice where they're collected.
 *
 * NOT IN THE PROTOTYPE — flagged. Built from the sign-up form's components
 * until the waitlist design arrives.
 */
export function WaitlistForm({ options }: { options: GenderOption[] }) {
  const [state, action] = useFormState(joinWaitlist, null);

  if (state?.ok) {
    return (
      <Card className="grid gap-3 p-[26px]">
        <h1 className="text-h4 text-ink-900">You&rsquo;re on the list</h1>
        <p className="text-ui text-grey-600">{state.ok}</p>
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-2">
        <h1 className="text-h3 text-ink-900">Toastly opens soon</h1>
        <p className="text-ui text-grey-600">
          Join the waitlist and we&rsquo;ll tell you the moment you can create your account.
        </p>
      </div>

      <Card className="p-[26px]">
        <form action={action} className="grid gap-5">
          {state?.error ? <Notice tone="error">{state.error}</Notice> : null}

          <Label htmlFor="wl-email">
            Email
            <Input id="wl-email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
          </Label>

          <Label htmlFor="wl-city">
            City
            <Input id="wl-city" name="city" autoComplete="address-level2" required maxLength={80} placeholder="Lagos" />
          </Label>

          <Label htmlFor="wl-gender">
            I am
            <Select id="wl-gender" name="gender" defaultValue="" required>
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

          <Submit />

          <p className="text-caption tracking-normal text-grey-600">
            We use your email only to tell you when Toastly opens, and your city and gender only to plan where it opens
            first.{" "}
            <Link href="/privacy" className="py-[14.5px] text-green-500">
              Privacy Policy
            </Link>
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

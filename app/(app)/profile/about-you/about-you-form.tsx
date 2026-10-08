"use client";

import { useFormState, useFormStatus } from "react-dom";
import { saveAboutYou } from "./actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import type { GenderOption } from "@/lib/gender-options";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="justify-self-start">
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

/**
 * NOT IN THE PROTOTYPE — flagged. The sign-up form's "I am", on its own
 * screen, for accounts from before 8 October 2026.
 */
export function AboutYouForm({
  options,
  gender,
  genderLocked,
}: {
  options: GenderOption[];
  gender: string | null;
  genderLocked: boolean;
}) {
  const [state, action] = useFormState(saveAboutYou, null);
  const label = options.find((o) => o.code === gender)?.label ?? null;

  return (
    <div className="mx-auto grid w-full max-w-[680px] gap-4 px-3.5 pb-8 pt-[18px]">
      <Card className="p-[26px]">
        <form action={action} className="grid gap-5">
          {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
          {state?.ok ? <Notice tone="success">{state.ok}</Notice> : null}

          {genderLocked ? (
            <div className="grid gap-1">
              <p className="m-0 text-ui font-medium text-ink-900">I am</p>
              <p className="m-0 text-ui text-ink-800">{label ?? "Not set"}</p>
              <p className="m-0 text-caption tracking-normal text-grey-400">
                Once your profile is live, this is changed through Toastly Help.
              </p>
            </div>
          ) : (
            <Label htmlFor="gender">
              I am
              <Select id="gender" name="gender" defaultValue={options.some((o) => o.code === gender) ? gender ?? "" : ""} required>
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
          )}


          {genderLocked ? null : <Submit />}
        </form>
      </Card>
    </div>
  );
}

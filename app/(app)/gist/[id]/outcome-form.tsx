"use client";

import { useFormState, useFormStatus } from "react-dom";
import { submitOutcome } from "../actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

/**
 * "Continue?" — a private double opt-in.
 *
 * Neither person sees the other's answer, ever. RLS only returns your own
 * row, so a "no" is never disclosed: nobody finds out they were turned down,
 * which is the whole reason this is double opt-in rather than a like-back.
 *
 * Both choices are submit buttons on the same form, carrying their own value.
 * The "no" is a quiet text button rather than a destructive-looking one —
 * declining is a normal outcome, not a failure.
 */
function Actions() {
  const { pending } = useFormStatus();
  return (
    <>
      <Button type="submit" name="continue" value="yes" disabled={pending}>
        {pending ? "Saving…" : "Yes, continue"}
      </Button>
      <button
        type="submit"
        name="continue"
        value="no"
        disabled={pending}
        className="justify-self-start text-ui text-grey-600 underline underline-offset-4 disabled:text-grey-400"
      >
        Not this time
      </button>
    </>
  );
}

export function OutcomeForm({ sessionId }: { sessionId: string }) {
  const [state, action] = useFormState(submitOutcome, null);

  if (state?.ok) {
    return (
      <Card className="grid gap-2 p-[26px]">
        <h2 className="text-h5 text-ink-900">Answer saved</h2>
        <p className="text-ui text-grey-600">{state.ok}</p>
      </Card>
    );
  }

  return (
    <Card className="grid gap-4 p-[26px]">
      <div className="grid gap-1.5">
        <h2 className="text-h5 text-ink-900">Would you like to continue?</h2>
        <p className="text-ui text-grey-600">
          Only you see this. If you both say yes, you both find out — if either
          of you doesn&rsquo;t, nobody is told who said what.
        </p>
      </div>

      <form action={action} className="grid justify-items-start gap-4">
        <input type="hidden" name="session_id" value={sessionId} />

        <Label htmlFor="city" className="w-full">
          Where are you based?{" "}
          <span className="text-grey-400">(optional)</span>
          <Input id="city" name="city" placeholder="Lagos" />
        </Label>

        {state?.error ? <Notice tone="error">{state.error}</Notice> : null}

        <Actions />
      </form>
    </Card>
  );
}

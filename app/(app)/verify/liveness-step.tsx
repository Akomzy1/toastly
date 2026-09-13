"use client";

import { useFormState, useFormStatus } from "react-dom";
import { recordLiveness } from "./actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Checking…" : "Start liveness check"}
    </Button>
  );
}

/**
 * Liveness capture.
 *
 * INCOMPLETE BY DESIGN, and said so on screen. The capture needs a vendor SDK
 * and a server-side decision; the button records a result but performs no
 * check, and the server action refuses outright in production. Nothing here
 * should imply a member has been verified when they have not.
 */
export function LivenessStep() {
  const [state, action] = useFormState(recordLiveness, null);

  return (
    <Card className="grid gap-5 p-[26px]">
      <div className="grid gap-1.5">
        <h2 className="text-h5 text-ink-900">Step 2 — Selfie liveness</h2>
        <p className="text-ui text-grey-600">
          A three-second head turn, checked against your profile photos. A saved
          picture doesn&rsquo;t pass. Takes about a minute.
        </p>
      </div>

      <Notice tone="locked" title="Not connected yet">
        The liveness capture isn&rsquo;t wired to a provider in this build, so
        this step can&rsquo;t genuinely verify anyone. It must be connected
        before launch.
      </Notice>

      <form action={action} className="grid gap-4">
        {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
        <Submit />
      </form>
    </Card>
  );
}

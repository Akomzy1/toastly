"use client";

import { useFormState, useFormStatus } from "react-dom";
import { markReady } from "../actions";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="justify-self-start">
      {pending ? "Saving…" : "I'm ready"}
    </Button>
  );
}

/** Opting in. Until both sides do this, no token is issued and no hardware
 *  is requested. */
export function ReadyForm({ sessionId }: { sessionId: string }) {
  const [state, action] = useFormState(markReady, null);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="session_id" value={sessionId} />
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state?.ok ? <Notice tone="success">{state.ok}</Notice> : null}
      <Submit />
    </form>
  );
}

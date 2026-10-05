"use client";

import { useFormState, useFormStatus } from "react-dom";
import { deleteAccount } from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" disabled={pending} className="justify-self-start">
      {pending ? "Deleting…" : "Delete my account"}
    </Button>
  );
}

/**
 * Typed confirmation, so deleting is a deliberate act rather than a mis-tap.
 * Not styled as an alarm — leaving is an ordinary choice, not an error.
 */
export function DeleteAccountForm() {
  const [state, action] = useFormState(deleteAccount, null);
  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="confirm-delete">Type delete to confirm</Label>
        <Input id="confirm-delete" name="confirm" autoComplete="off" required />
      </div>
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      <Submit />
    </form>
  );
}

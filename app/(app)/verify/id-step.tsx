"use client";

import { useFormState, useFormStatus } from "react-dom";
import { submitIdNumber } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button variant="outline" type="submit" disabled={pending}>
      {pending ? "Checking…" : "Add second ring"}
    </Button>
  );
}

/**
 * NIN / BVN — optional, forever.
 *
 * Framed as something to add, never as something missing. An account is fully
 * functional on phone and liveness alone, and this must never read as an
 * incomplete requirement.
 */
export function IdStep({ alreadyConfirmed }: { alreadyConfirmed: boolean }) {
  const [state, action] = useFormState(submitIdNumber, null);

  if (alreadyConfirmed) {
    return (
      <Card className="grid gap-3 p-[26px]">
        <Badge variant="nin" className="justify-self-start">
          NIN confirmed
        </Badge>
        <p className="text-ui text-grey-600">
          Your seal carries a second ring. The number itself is never shown to
          anyone.
        </p>
      </Card>
    );
  }

  return (
    <Card className="grid gap-5 p-[26px]">
      <div className="grid gap-1.5">
        <h2 className="text-h5 text-ink-900">
          Optional — NIN or BVN
        </h2>
        <p className="text-ui text-grey-600">
          Adds a second ring to your seal for members who want maximum trust.
          You&rsquo;re already fully verified without it, and the number is never
          shown to anyone.
        </p>
      </div>

      <form action={action} className="grid gap-4">
        <Label htmlFor="id_number">
          NIN or BVN
          <Input
            id="id_number"
            name="id_number"
            inputMode="numeric"
            maxLength={11}
            placeholder="11 digits"
          />
        </Label>
        {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
        <Submit />
      </form>
    </Card>
  );
}

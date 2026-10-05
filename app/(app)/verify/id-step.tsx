"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { submitIdNumber } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { ConsentPanel } from "@/components/app/consent-panel";

function Panel({ onClose }: { onClose: () => void }) {
  const { pending } = useFormStatus();
  return (
    <ConsentPanel kind="id_check" busy={pending} onSecondary={onClose}>
      <Label htmlFor="id_number">
        NIN, Virtual NIN or BVN
        <Input id="id_number" name="id_number" inputMode="numeric" maxLength={11} placeholder="11 digits" />
      </Label>
    </ConsentPanel>
  );
}

/**
 * NIN / BVN — optional, forever.
 *
 * Framed as something to add, never as something missing: the card offers
 * it, and only "Check my ID" opens the consent (wording §3, recorded with
 * its version). An account is fully functional without it.
 */
export function IdStep({ alreadyConfirmed }: { alreadyConfirmed: boolean }) {
  const [state, action] = useFormState(submitIdNumber, null);
  const [open, setOpen] = React.useState(false);

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

  if (!open) {
    return (
      <Card className="grid gap-4 p-[26px]">
        <div className="grid gap-1.5">
          <h2 className="text-h5 text-ink-900">ID check · Optional</h2>
          <p className="text-ui text-grey-600">
            Check your NIN or BVN against the official record to add a second
            ring to your seal. You can do it any time, or never.
          </p>
        </div>
        <Button variant="outline" className="justify-self-start" onClick={() => setOpen(true)}>
          Check my ID
        </Button>
      </Card>
    );
  }

  return (
    <Card className="grid gap-5 p-[26px]">
      <form action={action} className="grid gap-4">
        <Panel onClose={() => setOpen(false)} />
        {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
        {state?.ok ? <Notice tone="success">{state.ok}</Notice> : null}
      </form>
    </Card>
  );
}

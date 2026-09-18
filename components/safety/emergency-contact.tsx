"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  confirmEmergencyContact,
  saveEmergencyContact,
} from "@/lib/emergency-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

/**
 * Emergency contact — decision (d).
 *
 * NOT IN THE PROTOTYPE — flagged.
 *
 * Confirmed by a one-time code so the number is known to work before anyone
 * needs it. Free on every tier; this component reads no plan.
 *
 * The copy is careful about whose number this is: it belongs to someone who
 * never signed up for Toastly, and they are told what they've been added to.
 */
function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" disabled={pending} className="justify-self-start">
      {pending ? "Sending…" : label}
    </Button>
  );
}

export type EmergencyContactView = {
  label: string;
  lastFour: string;
  confirmed: boolean;
} | null;

export function EmergencyContact({ contact }: { contact: EmergencyContactView }) {
  const [saveState, saveAction] = useFormState(saveEmergencyContact, null);
  const [confirmState, confirmAction] = useFormState(confirmEmergencyContact, null);

  const awaitingCode = Boolean(contact && !contact.confirmed) || Boolean(saveState?.ok);

  return (
    <Card className="grid gap-5 p-[26px]">
      <div className="grid gap-1.5">
        <span className="flex flex-wrap items-center gap-2">
          <h2 className="text-h5 text-ink-900">Your emergency contact</h2>
          {contact?.confirmed ? (
            <Badge variant="verified">Confirmed</Badge>
          ) : contact ? (
            <Badge variant="optional">Waiting on their code</Badge>
          ) : null}
        </span>
        <p className="text-ui text-grey-600">
          One person who gets your alerts if you ever send one. We text them a
          code first, so you know the number works before it matters.
        </p>
      </div>

      {contact ? (
        <p className="text-ui text-ink-900">
          {contact.label} · ends {contact.lastFour}
        </p>
      ) : null}

      {awaitingCode ? (
        <form action={confirmAction} className="grid gap-3">
          <Label htmlFor="emergency-code">
            The six-digit code we texted them
            <Input
              id="emergency-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
            />
          </Label>
          {confirmState?.error ? (
            <Notice tone="error">{confirmState.error}</Notice>
          ) : null}
          {confirmState?.ok ? (
            <Notice tone="success">{confirmState.ok}</Notice>
          ) : null}
          <Submit label="Confirm contact" />
        </form>
      ) : null}

      <form action={saveAction} className="grid gap-4 border-t border-grey-200 pt-5">
        <Label htmlFor="emergency-label">
          Their name
          <Input id="emergency-label" name="label" placeholder="Ada" maxLength={60} />
        </Label>
        <Label htmlFor="emergency-phone">
          Their number
          <Input
            id="emergency-phone"
            name="phone"
            inputMode="tel"
            placeholder="0803 000 0000"
          />
          <span className="text-caption text-grey-600">
            We only ever text this number your alerts and this one code. It is
            never shown to anyone you match with, and nobody calls it from
            inside Toastly.
          </span>
        </Label>
        {saveState?.error ? <Notice tone="error">{saveState.error}</Notice> : null}
        {saveState?.ok ? <Notice tone="success">{saveState.ok}</Notice> : null}
        <Submit label={contact ? "Replace contact" : "Send them a code"} />
      </form>
    </Card>
  );
}

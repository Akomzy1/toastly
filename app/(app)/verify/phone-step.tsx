"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { confirmPhoneCode, startPhoneVerification } from "./actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function PhoneStep() {
  const [phone, setPhone] = React.useState("");
  const [sendState, send] = useFormState(startPhoneVerification, null);
  const [confirmState, confirm] = useFormState(confirmPhoneCode, null);
  const sent = Boolean(sendState?.ok);

  return (
    <Card className="grid gap-5 p-[26px]">
      <div className="grid gap-1.5">
        <h2 className="text-h5 text-ink-900">Step 1 — Your phone</h2>
        <p className="text-ui text-grey-600">
          One number, one account, permanently. It&rsquo;s what makes blocking
          somebody actually work.
        </p>
      </div>

      <form action={send} className="grid gap-4">
        <Label htmlFor="phone">
          Phone number
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            placeholder="0803 123 4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <span className="text-caption tracking-normal text-grey-400">
            Nigerian numbers can start 0. From abroad, include your country code.
          </span>
        </Label>
        {sendState?.error ? (
          <Notice tone="error">{sendState.error}</Notice>
        ) : null}
        <Submit
          label={sent ? "Send another code" : "Send code"}
          pendingLabel="Sending…"
        />
      </form>

      {sent ? (
        <form action={confirm} className="grid gap-4 border-t border-ink-900/[.12] pt-5">
          <input type="hidden" name="phone" value={phone} />
          <Label htmlFor="code">
            Code
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              placeholder="123456"
            />
          </Label>
          {confirmState?.error ? (
            <Notice tone="error">{confirmState.error}</Notice>
          ) : null}
          <Submit label="Confirm" pendingLabel="Checking…" />
        </form>
      ) : null}
    </Card>
  );
}

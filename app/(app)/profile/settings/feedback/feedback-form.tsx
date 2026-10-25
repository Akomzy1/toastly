"use client";

/**
 * PLACEHOLDER — pending the Claude Design prototype (beta.html). The prototype
 * is the source of truth; restyle to it when it arrives and delete this note.
 *
 * The feedback text goes to the team only: never to analytics, never to a model
 * (a constraint check holds the action to that).
 */

import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { sendFeedback } from "../feedback-actions";

type Category = { readonly code: string; readonly label: string };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Sending…" : "Send feedback"}
    </Button>
  );
}

export function FeedbackForm({ categories, from }: { categories: readonly Category[]; from: string }) {
  const [state, action] = useFormState(sendFeedback, null);

  if (state?.ok) {
    return <Notice tone="success">Thank you. Your feedback has gone to the Toastly team.</Notice>;
  }

  return (
    <Card className="p-[26px]">
      <form action={action} className="grid gap-5">
        {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
        <p className="text-ui text-grey-600">
          Toastly is in beta. Tell us what isn&rsquo;t working, or what you&rsquo;d like. Our team reads it. For anything
          urgent or unsafe, use Report or Toastly Help &mdash; they&rsquo;re faster.
        </p>

        <Label htmlFor="category">
          What is it about?
          <Select id="category" name="category" defaultValue="" required>
            <option value="" disabled>
              Select…
            </option>
            {categories.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </Select>
        </Label>

        <Label htmlFor="body">
          Your feedback
          <Textarea id="body" name="body" rows={6} maxLength={2000} required />
        </Label>

        <input type="hidden" name="page" value={from} />
        <Submit />
      </form>
    </Card>
  );
}

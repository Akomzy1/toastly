"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { blockMember } from "@/lib/safety-actions";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

function Confirm({ name }: { name: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" disabled={pending}>
      {pending ? "Blocking…" : `Yes, block ${name}`}
    </Button>
  );
}

/**
 * Block a member — permanent, silent, and one confirmation away.
 *
 * NOT IN THE PROTOTYPE — flagged. The confirmation step exists because a
 * block cannot be undone from the other person's side, not to discourage it.
 */
export function BlockButton({ memberId, name }: { memberId: string; name: string }) {
  const [confirming, setConfirming] = React.useState(false);
  const [state, action] = useFormState(blockMember, null);

  if (state?.ok) return <Notice tone="success">{state.ok}</Notice>;

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="min-h-11 justify-self-start text-ui font-medium text-grey-600 underline underline-offset-4 hover:text-ink-900"
      >
        Block {name}
      </button>
    );
  }

  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="blocked_id" value={memberId} />
      <p className="text-ui text-ink-900">
        Block {name}? You won&rsquo;t see each other again and they can&rsquo;t
        contact you. They aren&rsquo;t told.
      </p>
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      <div className="flex flex-wrap items-center gap-4">
        <Confirm name={name} />
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="min-h-11 text-ui text-grey-600 underline underline-offset-4"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

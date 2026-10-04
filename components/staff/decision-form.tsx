"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { decide, type DecideState } from "@/app/(staff)/staff/actions";
import { Notice } from "@/components/ui/notice";
import { ACTION_LABEL, SERIOUS } from "@/lib/review";

/**
 * The decision on one review item. NOT IN A PROTOTYPE — internal staff tool.
 * Restrict and remove ask for a tick to confirm; every decision is written to
 * the audit log by the database, with the note.
 */
function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-12 w-full rounded-lg bg-gold-500 px-5 py-3.5 text-button text-green-800 hover:bg-gold-300 disabled:bg-grey-200 disabled:text-grey-600"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

export function DecisionForm({ id, actions }: { id: string; actions: string[] }) {
  const [state, run] = useFormState<DecideState, FormData>(decide, null);
  const [action, setAction] = React.useState(actions[0] ?? "");
  if (state?.ok) return <Notice tone="success">{state.ok}</Notice>;

  return (
    <form action={run} className="grid gap-3 rounded-xl border border-ink-900/10 bg-white p-4">
      <input type="hidden" name="id" value={id} />
      <p className="m-0 font-sans text-chip font-semibold uppercase tracking-[0.12em] text-grey-600">Decision</p>
      <fieldset className="m-0 grid gap-1.5 border-0 p-0">
        {actions.map((a) => (
          <label key={a} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-ink-900/10 px-3 text-ui text-ink-900">
            <input type="radio" name="action" value={a} checked={action === a} onChange={() => setAction(a)} />
            {ACTION_LABEL[a] ?? a}
          </label>
        ))}
      </fieldset>
      <label className="grid gap-1.5">
        <span className="text-nav font-semibold text-ink-900">Note for the audit log (staff only)</span>
        <textarea name="note" rows={3} maxLength={1000} className="rounded-lg border border-ink-900/[.18] p-3 text-ui" />
      </label>
      {SERIOUS.has(action) ? (
        <label className="flex min-h-11 items-center gap-2.5 text-nav text-ink-900">
          <input type="checkbox" name="confirm" value="yes" />
          {action === "remove"
            ? "I've checked the evidence. Close this account and bar its sign-in."
            : "I've checked the evidence. Restrict this account until it's lifted."}
        </label>
      ) : null}
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      <Submit label={ACTION_LABEL[action] ?? "Save"} />
    </form>
  );
}

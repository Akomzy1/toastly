"use client";

/**
 * Internal screen — plain and functional (no design round, owner 25 October
 * 2026). The beta's staff-editable settings. "Lagos only" and the launch date
 * are not here on purpose: widening the beta is a decision made in a
 * migration, not a switch on a screen.
 */

import { useFormState, useFormStatus } from "react-dom";
import { saveBetaSettings } from "@/app/(staff)/staff/beta/actions";

function Save() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-green-500 px-4 text-nav font-semibold text-white disabled:bg-grey-200 disabled:text-grey-400">
      {pending ? "Saving…" : "Save settings"}
    </button>
  );
}

const INPUT = "min-h-11 rounded-lg border border-ink-900/[.22] bg-white px-2 text-nav normal-case tracking-normal text-ink-900";
const LABEL = "grid gap-1 text-chip font-semibold uppercase tracking-[0.06em] text-grey-600";

export function BetaSettings({
  cap,
  womenTargetPct,
  opensAt,
  closesAt,
}: {
  cap: number;
  womenTargetPct: number;
  /** Lagos time, as a datetime-local value. */
  opensAt: string;
  closesAt: string;
}) {
  const [state, action] = useFormState(saveBetaSettings, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3 rounded-[10px] border border-ink-900/[.12] bg-white p-3">
      <label className={LABEL}>
        Total places
        <input name="cap" type="number" min={1} defaultValue={cap} className={`${INPUT} w-28`} />
      </label>
      <label className={LABEL}>
        Target women, %
        <input name="women_target_pct" type="number" min={0} max={100} defaultValue={womenTargetPct} className={`${INPUT} w-28`} />
      </label>
      <label className={LABEL}>
        Applications open (Lagos time)
        <input name="applications_open_at" type="datetime-local" defaultValue={opensAt} className={INPUT} />
      </label>
      <label className={LABEL}>
        Beta closes (Lagos time; empty = open)
        <input name="beta_closes_at" type="datetime-local" defaultValue={closesAt} className={INPUT} />
      </label>
      <Save />
      {state?.ok ? <span role="status" className="text-nav text-success">{state.ok}</span> : null}
      {state?.error ? <span role="alert" className="text-nav text-error">{state.error}</span> : null}
    </form>
  );
}

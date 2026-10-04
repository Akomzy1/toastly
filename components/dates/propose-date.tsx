"use client";

import * as React from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { proposeDate } from "@/app/(app)/dates/actions";
import { Notice } from "@/components/ui/notice";

/**
 * Propose a time at the accepted spot, and stake (PRD §5.5; 0023).
 *
 * NOT IN A PROTOTYPE — flagged (Prompt 17). The approved date-spot card ends
 * at "Pick a time you can both make." with nothing after it; this is the
 * minimal form behind that line, built from the card's own inputs and
 * buttons until the coins and attendance design is exported.
 */

export type OpenDate = { id: string; status: string } | null;

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-12 w-full rounded-lg bg-gold-500 px-5 py-3.5 text-button text-green-800 transition-colors duration-200 hover:bg-gold-300 disabled:bg-grey-200 disabled:text-grey-600"
    >
      {pending ? "Sending…" : "Propose this time"}
    </button>
  );
}

/** A datetime-local value (local wall time, no zone) for an instant. */
function localValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const FIELD = "min-h-12 w-full rounded-lg border border-ink-900/[.18] bg-white px-3.5 text-ui text-ink-900";

export function ProposeDate({
  spotId,
  matchFirst,
  stakeable,
  stakeMin,
  stakeMax,
  cutoffHours,
  openDate,
}: {
  spotId: string;
  matchFirst: string;
  stakeable: number;
  stakeMin: number;
  stakeMax: number;
  cutoffHours: number;
  openDate: OpenDate;
}) {
  const [state, action] = useFormState(proposeDate, null);
  const [at, setAt] = React.useState("");
  const [bounds, setBounds] = React.useState<{ min: string; max: string } | null>(null);

  // The browser's clock and zone decide the bounds; set after mount so the
  // server render and the first client render agree.
  React.useEffect(() => {
    const now = Date.now();
    setBounds({
      min: localValue(new Date(now + cutoffHours * 3600_000 + 5 * 60_000)),
      max: localValue(new Date(now + 14 * 86400_000)),
    });
  }, [cutoffHours]);

  if (openDate) {
    return (
      <Link
        href={`/dates/${openDate.id}`}
        className="flex min-h-12 items-center justify-center rounded-lg border border-green-500 px-5 text-button text-green-500"
      >
        See your date
      </Link>
    );
  }

  const short = stakeable < stakeMin;
  const defaultStake = Math.min(Math.max(10, stakeMin), stakeMax);

  return (
    <form action={action} className="grid gap-3 rounded-xl border border-ink-900/[.12] bg-white px-[15px] py-4">
      <input type="hidden" name="spot_id" value={spotId} />
      <input type="hidden" name="at_iso" value={at ? new Date(at).toISOString() : ""} />
      <label className="grid gap-1.5">
        <span className="text-nav font-semibold text-ink-900">Day and time</span>
        <input
          type="datetime-local"
          required
          className={FIELD}
          min={bounds?.min}
          max={bounds?.max}
          value={at}
          onChange={(e) => setAt(e.target.value)}
        />
        <span className="text-chip text-grey-600">At least {cutoffHours} hours from now, within two weeks.</span>
      </label>
      <label className="grid gap-1.5">
        <span className="text-nav font-semibold text-ink-900">Coins you each stake</span>
        <input
          type="number"
          name="stake"
          required
          inputMode="numeric"
          min={stakeMin}
          max={stakeMax}
          defaultValue={defaultStake}
          className={FIELD}
        />
        <span className="text-chip text-grey-600">
          You can stake {stakeable} {stakeable === 1 ? "coin" : "coins"}. Between {stakeMin} and {stakeMax}.
        </span>
      </label>
      <p className="m-0 text-nav leading-[1.55] text-grey-600">
        You stake now; {matchFirst} stakes to confirm. You both show up, you both get them back. Cancel at least{" "}
        {cutoffHours} hours before and everything comes back.
      </p>
      {short ? (
        <Notice tone="info">
          You need at least {stakeMin} coins you bought to stake.
          <Link href="/coins" className="flex min-h-11 items-center font-semibold underline">
            See your coins
          </Link>
        </Notice>
      ) : null}
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      <Submit />
    </form>
  );
}

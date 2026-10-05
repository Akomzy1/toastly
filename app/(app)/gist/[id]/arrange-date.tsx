"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createDate } from "../../dates/actions";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-12 rounded-lg bg-green-500 px-5 py-3.5 text-button text-white hover:bg-green-600 disabled:opacity-60"
    >
      {pending ? "Arranging…" : "Arrange the date"}
    </button>
  );
}

/**
 * Arrange a date at the spot you both accepted, then go to its
 * confirm-and-stake screen (date-stake-confirm).
 *
 * INVENTED UI — flagged. No prototype covers proposing a time; this is the
 * smallest thing that works: one date-and-time field. The both-clocks
 * window picker (both-clocks.slim.html) belongs here once a propose-a-time
 * screen is designed.
 */
export function ArrangeDate({ spotId, venue }: { spotId: string; venue: string }) {
  const [state, action] = useFormState(createDate, null);
  // A datetime-local value has no time zone; turn it into an exact instant
  // here, in the member's own zone, rather than let the server guess.
  const [when, setWhen] = React.useState("");
  return (
    <Card className="grid gap-4 p-[26px]">
      <div className="grid gap-1.5">
        <h2 className="text-h5 text-ink-900">Pick a time at {venue}</h2>
        <p className="text-ui text-grey-600">
          Agree it between you first. Then you both put in a few coins — showing up for each other — and they come back
          when you both turn up.
        </p>
      </div>
      <form action={action} className="grid gap-3">
        <input type="hidden" name="spot_id" value={spotId} />
        <label htmlFor="when" className="text-nav font-semibold text-ink-900">
          Day and time
        </label>
        <input
          id="when"
          type="datetime-local"
          required
          onChange={(e) => setWhen(e.target.value ? new Date(e.target.value).toISOString() : "")}
          className="min-h-12 rounded-lg border border-ink-900/[.24] bg-white px-3 text-ui"
        />
        <input type="hidden" name="when" value={when} />
        {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
        <Submit />
      </form>
    </Card>
  );
}

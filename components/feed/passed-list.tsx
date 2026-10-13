"use client";

import * as React from "react";
import { bringBack } from "@/lib/pass-actions";

type Row = { candidate_id: string; display_name: string; city: string | null };

/**
 * Settings → "People you passed on". PLAIN VERSION, NOT IN THE PROTOTYPE —
 * flagged; restyled when the Claude Design screen arrives.
 */
export function PassedList({ rows }: { rows: Row[] }) {
  const [gone, setGone] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const shown = rows.filter((r) => !gone.has(r.candidate_id));

  async function back(id: string) {
    setBusy(id);
    setError(null);
    const res = await bringBack(id);
    setBusy(null);
    if (!res.ok) return setError(res.error);
    setGone((g) => new Set(g).add(id));
  }

  if (!shown.length) {
    return <p className="m-0 text-ui text-grey-600">You haven&rsquo;t passed on anyone.</p>;
  }
  return (
    <div className="grid gap-2.5">
      {error ? <p role="alert" className="m-0 text-nav text-error">{error}</p> : null}
      <ul className="m-0 grid list-none overflow-hidden rounded-2xl border border-ink-900/[.12] bg-white p-0">
        {shown.map((r, i) => (
          <li key={r.candidate_id} className={`flex min-h-[60px] items-center justify-between gap-3 px-[15px] py-[11px] ${i ? "border-t border-ink-900/10" : ""}`}>
            <span className="grid min-w-0 gap-0.5">
              <span className="text-[15px] font-medium text-ink-900">{r.display_name}</span>
              {r.city ? <span className="text-[13.5px] text-grey-600">{r.city}</span> : null}
            </span>
            <button
              type="button"
              disabled={busy === r.candidate_id}
              onClick={() => back(r.candidate_id)}
              className="min-h-11 flex-shrink-0 border-0 bg-transparent px-1 text-[14px] font-semibold text-green-500 underline underline-offset-4 disabled:opacity-60"
            >
              {busy === r.candidate_id ? "Bringing back…" : "Bring back"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

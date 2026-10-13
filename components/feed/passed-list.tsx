"use client";

import * as React from "react";
import { bringBack } from "@/lib/pass-actions";
import { UndoToast } from "./undo-toast";

type Row = { candidate_id: string; display_name: string; passed_on: string; photo_url: string | null };

/**
 * Settings → "People you passed on" (design/prototype/not-for-me.html, states
 * E and F). First name, the date passed, and Bring back on each. Only the
 * member who passed ever sees this list; the people on it are never told.
 *
 * The small main photo comes from the database only where the member may see it
 * (the same rule as the six); otherwise the design's initial in a circle.
 */
export function PassedList({ rows }: { rows: Row[] }) {
  const [gone, setGone] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const timer = React.useRef<number | null>(null);
  const shown = rows.filter((r) => !gone.has(r.candidate_id));

  React.useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  async function back(r: Row) {
    setBusy(r.candidate_id);
    setError(null);
    const res = await bringBack(r.candidate_id);
    setBusy(null);
    if (!res.ok) return setError(res.error);
    setGone((g) => new Set(g).add(r.candidate_id));
    const first = r.display_name.split(" ")[0];
    setToast(`${first} can appear in your six again.`);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 4000);
  }

  return (
    <>
      {shown.length ? (
        <>
          <p className="m-0 px-0.5 text-[13.5px] leading-normal text-grey-600">Only you can see this list.</p>
          {error ? (
            <p role="alert" className="m-0 text-nav text-error">
              {error}
            </p>
          ) : null}
          <ul className="m-0 grid list-none overflow-hidden rounded-2xl border border-ink-900/[.12] bg-white p-0">
            {shown.map((r, i) => {
              const first = r.display_name.split(" ")[0];
              return (
                <li key={r.candidate_id} className={`flex min-h-[72px] items-center gap-3 py-3 pl-3.5 pr-3 ${i ? "border-t border-ink-900/10" : ""}`}>
                  <span aria-hidden="true" className="grid h-12 w-12 flex-shrink-0 place-items-center overflow-hidden rounded-pill bg-green-50 font-serif text-[19px] font-bold text-green-550">
                    {r.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                      <img src={r.photo_url} alt="" className="block h-full w-full object-cover" />
                    ) : (
                      first.charAt(0)
                    )}
                  </span>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="text-[15px] font-semibold text-ink-900">{first}</span>
                    <span className="text-[13px] text-grey-600">Passed on {r.passed_on}</span>
                  </span>
                  <button
                    type="button"
                    disabled={busy === r.candidate_id}
                    onClick={() => back(r)}
                    className="min-h-11 flex-shrink-0 rounded-[10px] border border-ink-900/20 bg-transparent px-3.5 py-2.5 text-[14px] font-semibold text-ink-900 hover:border-green-500 hover:bg-green-50 disabled:opacity-60"
                  >
                    {busy === r.candidate_id ? "Bringing back…" : "Bring back"}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <div className="mt-2 grid gap-1.5 rounded-2xl border border-ink-900/10 bg-white px-5 py-7 text-center">
          <p className="m-0 font-serif text-[19px] font-bold text-ink-900">Nobody here.</p>
          <p className="m-0 text-[14px] leading-relaxed text-grey-600 [text-wrap:pretty]">
            People you pass on will show up here, in case you change your mind.
          </p>
        </div>
      )}
      <UndoToast open={toast !== null} text={toast ?? ""} />
    </>
  );
}

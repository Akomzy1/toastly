"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { assign, decide } from "@/app/(staff)/staff/actions";
import { Notice } from "@/components/ui/notice";
import { ACTION_LABEL, ACTION_SUB, MIN_REASON, wat } from "@/lib/review";

/**
 * The decision panel — review-case.slim.html. Choose an action, write the
 * reason (required, a short sentence), confirm. The database checks the
 * reviewer is staff, that the action fits the case, and writes it to the
 * case history and the audit log before anything changes.
 *
 * Addition, flagged: "Assign to me" on a new, unassigned case — the queue's
 * "In review · name" status needs a way to happen, and the prototype draws
 * none.
 */
export function DecisionPanel({
  id,
  actions,
  canAssign,
  decided,
  queueHref,
  historyHref,
}: {
  id: string;
  actions: string[];
  canAssign: boolean;
  decided: { label: string; at: string; who: string; why: string } | null;
  queueHref: string;
  historyHref: string;
}) {
  const router = useRouter();
  const [choice, setChoice] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(decided);
  const ok = reason.trim().length >= MIN_REASON;

  async function confirm() {
    if (!choice || !ok) return;
    setBusy(true);
    setError(null);
    const r = await decide(id, choice, reason.trim());
    setBusy(false);
    if (r.error) return setError(r.error);
    setDone({ label: ACTION_LABEL[choice] ?? choice, at: new Date().toISOString(), who: r.who ?? "You", why: reason.trim() });
    router.refresh();
  }

  async function takeIt() {
    setBusy(true);
    const r = await assign(id);
    setBusy(false);
    if (r.error) setError(r.error);
    router.refresh();
  }

  return (
    <section aria-labelledby="decide" className="grid gap-2.5 rounded-[10px] border border-ink-900/[.12] bg-white p-3.5">
      <h2 id="decide" className="m-0 mx-0.5 text-[14px] font-semibold">
        Decision
      </h2>

      {done ? (
        <div role="status" className="grid gap-2 rounded-lg border border-green-500/30 bg-green-50 p-3">
          <p className="m-0 text-[14px] font-semibold text-green-550">Decision recorded: {done.label}</p>
          <p className="m-0 text-nav leading-[1.5] text-green-550">
            {wat(done.at, true)} WAT · {done.who}
          </p>
          <p className="m-0 text-nav leading-[1.5] text-ink-800 [text-wrap:pretty]">&ldquo;{done.why}&rdquo;</p>
          <div className="mt-0.5 flex flex-wrap gap-3.5">
            <Link href={historyHref} className="flex min-h-11 items-center text-nav font-semibold">
              View decision history
            </Link>
            <Link href={queueHref} className="flex min-h-11 items-center text-nav font-semibold">
              Back to queue
            </Link>
          </div>
        </div>
      ) : actions.length === 0 ? (
        <p className="m-0 text-nav text-grey-600">No decision to make on this case.</p>
      ) : (
        <div className="grid gap-2">
          {canAssign ? (
            <button
              type="button"
              disabled={busy}
              onClick={takeIt}
              className="min-h-11 rounded-lg border border-ink-900/20 bg-transparent px-3.5 py-2.5 text-[14px] font-semibold text-ink-900 hover:border-green-500"
            >
              Assign to me
            </button>
          ) : null}
          {actions.map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={choice === a}
              onClick={() => setChoice(a)}
              className={`grid min-h-[52px] w-full cursor-pointer gap-0.5 rounded-lg border px-3 py-[9px] text-left hover:border-green-500 ${
                choice === a ? "border-green-500 bg-green-50" : "border-ink-900/[.18] bg-white"
              }`}
            >
              <span className="text-[14px] font-semibold text-ink-900">{ACTION_LABEL[a] ?? a}</span>
              <span className="text-[12.5px] leading-[1.45] text-grey-600">{ACTION_SUB[a] ?? ""}</span>
            </button>
          ))}

          {choice ? (
            <div className="mt-1 grid gap-2 border-t border-ink-900/10 pt-3">
              <label htmlFor="reason" className="text-nav font-semibold text-ink-900">
                Reason for &ldquo;{ACTION_LABEL[choice] ?? choice}&rdquo; <span className="font-normal text-grey-600">(required)</span>
              </label>
              <textarea
                id="reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
                placeholder="What you saw and why this is the right call"
                className="min-h-[84px] w-full resize-y rounded-lg border border-ink-900/[.24] px-[11px] py-2.5 text-[13.5px] leading-[1.5] text-ink-900"
              />
              <p className="m-0 text-chip leading-[1.5] text-grey-600">
                Saved to the decision history with your name and the time. {ok ? "" : "A short sentence is enough."}
              </p>
              {error ? <Notice tone="error">{error}</Notice> : null}
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <button
                  type="button"
                  onClick={confirm}
                  disabled={!ok || busy}
                  className={`min-h-11 rounded-lg border-0 px-3.5 py-2.5 text-[14px] font-semibold ${
                    ok && !busy ? "cursor-pointer bg-green-800 text-white" : "cursor-not-allowed bg-grey-200 text-grey-600"
                  }`}
                >
                  {busy ? "Saving…" : `Confirm: ${ACTION_LABEL[choice] ?? choice}`}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChoice(null);
                    setReason("");
                  }}
                  className="min-h-11 rounded-lg border border-ink-900/20 bg-transparent px-3.5 py-2.5 text-[14px] font-semibold text-ink-900"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

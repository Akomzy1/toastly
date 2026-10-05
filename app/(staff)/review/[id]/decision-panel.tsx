"use client";

import * as React from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { decideCase } from "../actions";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/utils";

/**
 * review-case.slim.html's decision panel: choose an action, give a reason
 * (required — 12 characters, "a short sentence is enough"), confirm. The
 * record is written with the reviewer's name and the time.
 *
 * DEVIATION, flagged: the prototype shows one set of five actions for every
 * case. Photo and selfie checks need a different answer — is this them? —
 * so they get "Confirm match" / "Not a match" in place of Clear, Ask to
 * switch plan and Request re-verification. "Ask to switch plan" is offered
 * only on pricing cases.
 */
const GENERAL: [string, string, string][] = [
  ["clear", "Clear", "No action. The case closes."],
  ["switch", "Ask to switch plan", "Member is asked to move to the plan for where they live."],
  ["reverify", "Request re-verification", "Member redoes selfie liveness. Account stays open."],
  ["restrict", "Restrict", "Limits matching and messages until reviewed again."],
  ["remove", "Remove", "Closes the account. The member can appeal."],
];
const PHOTO: [string, string, string][] = [
  ["confirm_match", "Confirm match", "The photo is them. It goes live as their main photo."],
  ["not_match", "Not a match", "They're asked to choose another main photo."],
  ["restrict", "Restrict", "Limits matching and messages until reviewed again."],
  ["remove", "Remove", "Closes the account. The member can appeal."],
];
const MIN = 12;

function Confirm({ label, ok }: { label: string; ok: boolean }) {
  const { pending } = useFormStatus();
  const on = ok && !pending;
  return (
    <button
      type="submit"
      disabled={!on}
      className={cn(
        "min-h-11 rounded-[8px] px-3.5 py-2.5 text-nav font-semibold",
        on ? "bg-green-800 text-white" : "cursor-not-allowed bg-grey-200 text-grey-600",
      )}
    >
      {pending ? "Saving…" : `Confirm: ${label}`}
    </button>
  );
}

export function DecisionPanel({
  caseId,
  kind,
  status,
  assignee,
}: {
  caseId: number;
  kind: string;
  status: string;
  assignee: string | null;
}) {
  const [state, action] = useFormState(decideCase, null);
  const [choice, setChoice] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  const actions = (kind === "photo" || kind === "selfie" ? PHOTO : GENERAL).filter(
    ([k]) => k !== "switch" || kind === "pricing",
  );
  const label = actions.find(([k]) => k === choice)?.[1] ?? "";
  const ok = note.trim().length >= MIN;

  if (status === "decided" || (state?.ok && state.ok !== "assign")) {
    return (
      <section className="grid gap-2.5 rounded-md border border-ink-900/[.12] bg-white p-3.5">
        <h2 className="mx-0.5 text-nav font-semibold">Decision</h2>
        <div role="status" className="grid gap-2 rounded-[8px] border border-green-500/30 bg-green-50 p-3">
          <p className="text-nav font-semibold text-green-700">
            {state?.ok ? `Decision recorded: ${actions.find(([k]) => k === state.ok)?.[1] ?? state.ok}` : "This case is decided."}
          </p>
          {state?.ok ? <p className="text-[13px] leading-[1.5] text-ink-800">&ldquo;{note}&rdquo;</p> : null}
          <div className="mt-0.5 flex flex-wrap gap-3.5">
            <Link href={`/review/history?case=${caseId}`} className="text-[13px] font-semibold text-green-500">
              View decision history
            </Link>
            <Link href="/review" className="text-[13px] font-semibold text-green-500">
              Back to queue
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="decide" className="grid gap-2.5 rounded-md border border-ink-900/[.12] bg-white p-3.5">
      <h2 id="decide" className="mx-0.5 text-nav font-semibold">
        Decision
      </h2>

      {!assignee ? (
        <form action={action}>
          <input type="hidden" name="case_id" value={caseId} />
          <input type="hidden" name="action" value="assign" />
          <button type="submit" className="min-h-11 w-full rounded-[8px] border border-ink-900/20 px-3 text-nav font-semibold text-ink-900 hover:border-green-500">
            Assign to me
          </button>
        </form>
      ) : (
        <p className="mx-0.5 text-[13px] text-grey-600">Assigned to {assignee}</p>
      )}

      <form action={action} className="grid gap-2">
        <input type="hidden" name="case_id" value={caseId} />
        <input type="hidden" name="action" value={choice ?? ""} />
        {actions.map(([k, l, sub]) => (
          <button
            key={k}
            type="button"
            aria-pressed={choice === k}
            onClick={() => setChoice(k)}
            className={cn(
              "grid min-h-[52px] w-full gap-0.5 rounded-[8px] border px-3 py-[9px] text-left",
              choice === k ? "border-green-500 bg-green-50" : "border-ink-900/[.18] bg-white",
            )}
          >
            <span className="text-nav font-semibold text-ink-900">{l}</span>
            <span className="text-[12.5px] leading-[1.45] text-grey-600">{sub}</span>
          </button>
        ))}

        {choice ? (
          <div className="mt-1 grid gap-2 border-t border-ink-900/10 pt-3">
            <label htmlFor="reason" className="text-[13px] font-semibold text-ink-900">
              Reason for &ldquo;{label}&rdquo; <span className="font-normal text-grey-600">(required)</span>
            </label>
            <textarea
              id="reason"
              name="note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What you saw and why this is the right call"
              className="min-h-[84px] w-full resize-y rounded-[8px] border border-ink-900/[.24] px-[11px] py-2.5 text-[13.5px] leading-[1.5] text-ink-900"
            />
            <p className="text-chip leading-[1.5] text-grey-600">
              Saved to the decision history with your name and the time. {ok ? "" : "A short sentence is enough."}
            </p>
            {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <Confirm label={label} ok={ok} />
              <button
                type="button"
                onClick={() => {
                  setChoice(null);
                  setNote("");
                }}
                className="min-h-11 rounded-[8px] border border-ink-900/20 px-3.5 py-2.5 text-nav font-semibold text-ink-900"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </form>
    </section>
  );
}

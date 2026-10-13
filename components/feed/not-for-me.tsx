"use client";

import * as React from "react";
import { passOn, bringBack } from "@/lib/pass-actions";

/** Ten seconds to change your mind (PRD §5.2.5). */
export const UNDO_SECONDS = 10;

/**
 * "Not for me" — a quiet text action, never a swipe and never a big button.
 *
 * PLAIN VERSION, NOT IN THE PROTOTYPE — flagged. The screens come from Claude
 * Design; this carries the behaviour (pass, ten-second undo, nothing said to
 * the other person) and gets restyled when the design arrives.
 *
 * It is not Block and it is not Report: those stay separate, beside it.
 */
export function NotForMe({ memberId, name, className }: { memberId: string; name: string; className?: string }) {
  const first = name.split(" ")[0];
  const [state, setState] = React.useState<"idle" | "busy" | "passed" | "undone">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [left, setLeft] = React.useState(UNDO_SECONDS);

  // Count the ten seconds down once passed.
  React.useEffect(() => {
    if (state !== "passed") return;
    setLeft(UNDO_SECONDS);
    const t = window.setInterval(() => setLeft((s) => s - 1), 1000);
    return () => window.clearInterval(t);
  }, [state]);

  async function pass() {
    setState("busy");
    setError(null);
    const res = await passOn(memberId);
    if (!res.ok) {
      setError(res.error);
      return setState("idle");
    }
    setState("passed");
  }
  async function undo() {
    setState("busy");
    const res = await bringBack(memberId);
    if (!res.ok) {
      setError(res.error);
      return setState("passed");
    }
    setState("undone");
  }

  const undoable = state === "passed" && left > 0;
  return (
    <>
      {state === "passed" && !undoable ? (
        <p className={className ?? "m-0 min-h-11 text-nav text-grey-600"}>
          You won&rsquo;t see {first} in your six again. You can change this in Settings.
        </p>
      ) : (
        <button
          type="button"
          onClick={pass}
          disabled={state === "busy" || undoable}
          className={className ?? "min-h-11 justify-self-start text-nav font-medium text-grey-600 underline underline-offset-4 hover:text-ink-900 disabled:no-underline"}
        >
          Not for me
        </button>
      )}
      {error ? (
        <p role="alert" className="m-0 text-nav text-error">
          {error}
        </p>
      ) : null}
      {undoable ? (
        <div role="status" className="fixed inset-x-3.5 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[60] mx-auto flex max-w-[652px] items-center justify-between gap-4 rounded-lg bg-green-800 px-4 py-3.5 text-[14px] font-medium text-white lg:bottom-6">
          <span>We won&rsquo;t show {first} again.</span>
          <button type="button" onClick={undo} className="min-h-11 flex-shrink-0 border-0 bg-transparent px-1 text-[14px] font-semibold text-champagne underline underline-offset-4">
            Undo ({left})
          </button>
        </div>
      ) : null}
    </>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { getAnswerFeedback, savePromptAnswer, type FeedbackState } from "@/app/(app)/profile/prompts/actions";
import { Notice } from "@/components/ui/notice";
import { ScreenBand } from "@/components/app/screen-band";

/**
 * Edit a prompt answer — answer-mirror.slim.html.
 *
 * "Get feedback" is quiet and optional. It returns one line from a fixed set:
 * no rewritten text, no example wording, no rewrite button, no score. Every
 * line looks the same, so none reads as a pass or a fail. Editing the answer
 * clears the line. The pledge sits under it every time.
 *
 * Deviation, flagged: the prototype's back chevron is a "Back to your profile"
 * link here, since the page has no app bar of its own; Cancel goes there too.
 */

const PLEDGE = "Toastly AI will never write a word for you.";

function Save() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-12 w-full rounded-lg bg-green-500 px-5 py-3.5 text-button text-white transition-colors duration-200 hover:bg-green-600 disabled:bg-grey-200 disabled:text-grey-600"
    >
      {pending ? "Saving…" : "Save answer"}
    </button>
  );
}

export function AnswerEditor({
  promptId,
  promptText,
  initial,
  initialFeedback,
  aiAvailable,
}: {
  promptId: number;
  promptText: string;
  initial: string;
  /** For the /audit harness only. */
  initialFeedback?: string;
  aiAvailable: boolean;
}) {
  const router = useRouter();
  const [text, setText] = React.useState(initial);
  const [feedback, setFeedback] = React.useState<FeedbackState | null>(
    initialFeedback ? { feedback: initialFeedback } : null,
  );
  const [reading, setReading] = React.useState(false);
  const [saveState, save] = useFormState(savePromptAnswer, null);

  React.useEffect(() => {
    if (saveState?.ok) router.push("/profile");
  }, [saveState, router]);

  async function ask() {
    setReading(true);
    setFeedback(null);
    const result = await getAnswerFeedback(promptId, text);
    setReading(false);
    setFeedback(result);
  }

  return (
    <div className="mx-auto grid w-full max-w-[680px]">
      <ScreenBand title="Edit answer" sub="Profile prompts" back="/profile" />

      <form action={save} className="grid content-start gap-[18px] px-3.5 pb-6 pt-5">
        <input type="hidden" name="prompt_id" value={promptId} />
        <label className="grid gap-2.5">
          <span className="px-0.5 font-serif text-[21px] font-bold leading-[1.25] text-ink-900 [text-wrap:balance]">
            {promptText}
          </span>
          <textarea
            name="answer"
            rows={5}
            maxLength={300}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setFeedback(null);
            }}
            className="min-h-[136px] w-full resize-y rounded-lg border border-ink-900/20 bg-white p-3.5 font-sans text-ui leading-[1.6] text-ink-900 focus:border-green-500 focus:outline-none focus:ring-[3px] focus:ring-green-500/[.16]"
          />
        </label>

        <div className="grid gap-2.5">
          {aiAvailable && !feedback?.feedback && !reading ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <button
                type="button"
                onClick={ask}
                disabled={!text.trim()}
                className="min-h-11 rounded-md border border-green-500/[.35] bg-white px-4 py-2.5 text-nav font-semibold text-green-500 transition-colors duration-200 hover:border-green-500 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Get feedback
              </button>
              <span className="text-[13px] text-grey-600">Optional · AI feedback</span>
            </div>
          ) : null}

          {reading ? (
            <div role="status" className="flex min-h-11 items-center px-0.5 text-nav text-grey-600">
              Reading your answer…
            </div>
          ) : null}

          {feedback?.feedback ? (
            <div role="status" className="grid gap-1 rounded-lg border border-ink-900/[.12] bg-white pb-1.5 pl-3.5 pr-1.5 pt-3">
              <p className="m-0 font-sans text-chip font-semibold uppercase tracking-[0.12em] text-green-500">AI feedback</p>
              <div className="flex items-start justify-between gap-2">
                <p className="m-0 pb-2 pt-0.5 text-ui leading-[1.55] text-ink-900">{feedback.feedback}</p>
                <button
                  type="button"
                  onClick={() => setFeedback(null)}
                  aria-label="Hide feedback"
                  className="-mt-2.5 h-11 w-11 flex-shrink-0 rounded-md text-[20px] leading-none text-grey-600 hover:bg-grey-100"
                >
                  ×
                </button>
              </div>
            </div>
          ) : null}

          {feedback?.error ? (
            <p role="status" className="m-0 px-0.5 text-nav text-grey-600">
              {feedback.error}
            </p>
          ) : null}

          <p className="m-0 px-0.5 text-[13px] font-semibold leading-normal text-green-800">{PLEDGE}</p>
        </div>

        {saveState?.error ? <Notice tone="error">{saveState.error}</Notice> : null}

        <div className="mt-1.5 grid gap-2.5">
          <Save />
          <Link
            href="/profile"
            className="flex min-h-12 w-full items-center justify-center rounded-lg border border-ink-900/20 bg-transparent px-5 py-3.5 text-button text-ink-900 no-underline transition-colors duration-200 hover:border-green-500 hover:bg-green-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

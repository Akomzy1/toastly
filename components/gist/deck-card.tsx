import { Button } from "@/components/ui/button";

/**
 * The Gist question card — one question at a time, the same on both screens.
 *
 * NOT IN A PROTOTYPE — flagged, by decision (3 October 2026). Toastly never
 * asks the question: the two people do, and agree out loud before either
 * taps Next or Skip. Built from the Gist screens' own cards and buttons.
 */

export type DeckQuestion = { id: number; text: string; depth: number };

const DEPTH = ["", "Warm-up", "Going deeper", "Real"];

export function DeckCard({
  questions,
  index,
  busy,
  onSkip,
  onNext,
}: {
  questions: DeckQuestion[];
  index: number;
  busy: boolean;
  onSkip: () => void;
  onNext: () => void;
}) {
  return index < questions.length ? (
          <div className="grid gap-3 rounded-xl border border-ink-900/[.12] bg-white px-[15px] py-4" aria-live="polite">
            <div className="flex items-baseline justify-between gap-3">
              <p className="m-0 font-sans text-chip font-semibold uppercase tracking-[0.12em] text-green-500">
                Question {index + 1} of {questions.length}
              </p>
              <p className="m-0 text-chip text-grey-400">{DEPTH[questions[index].depth] ?? ""}</p>
            </div>
            <p className="m-0 font-serif text-[21px] font-bold leading-[1.3] text-ink-900 [text-wrap:balance]">
              {questions[index].text}
            </p>
            <p className="m-0 text-nav leading-[1.55] text-grey-600">
              Agree out loud, then either of you taps. It changes on both screens.
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <Button variant="outline" disabled={busy} onClick={onSkip}>
                Skip
              </Button>
              <Button disabled={busy} onClick={onNext}>
                Next
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-1.5 rounded-xl border border-ink-900/[.12] bg-white px-[15px] py-4">
            <p className="m-0 font-sans text-chip font-semibold uppercase tracking-[0.12em] text-green-500">That&rsquo;s the deck</p>
            <p className="m-0 text-ui leading-[1.6] text-ink-800">
              You&rsquo;ve been through every question. Keep talking, or say goodbye when you&rsquo;re ready.
            </p>
          </div>
        );
}

"use client";

import * as React from "react";
import { GIST_DECK_SIZE } from "@/lib/gist";

/**
 * The Gist question card — one question at a time, the same on both screens
 * (decided 8 October 2026; PRD §5.4; design/prototype/gist-video-call.html).
 *
 *   tone "dark"     the in-call card (states A–D, F–J): label, question, a
 *                   footer with six dots and "Next question", and the next
 *                   card peeking behind while there are more
 *   tone "overlay"  the compact card over video (state E): dots, the
 *                   question, a round "Next question" button
 *   tone "light"    the same card on a light ground (kept for the harness)
 *
 * Six cards in a fixed arc, dealt for this Gist by the server (0039). Either
 * person moves on — with "Next question", or by swiping the card left — and
 * the server moves it for both. After the last card: "That's the deck. Keep
 * talking." with no button and no next card peeking.
 *
 * The swipe here only turns this card. It is the one swipe in Toastly and is
 * never a matching gesture (CLAUDE.md; the constraint check allows it in this
 * file only).
 */

export type DeckCardQuestion = { position: number; text: string };

const SWIPE_PX = 60;

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DeckCard({
  cards,
  index,
  busy,
  onNext,
  tone = "light",
}: {
  /** This Gist's cards, in order (gist_deck, 0039). */
  cards: DeckCardQuestion[];
  /** How many cards are done: 0 shows the first, GIST_DECK_SIZE the end card. */
  index: number;
  busy: boolean;
  onNext: () => void;
  tone?: "light" | "dark" | "overlay";
}) {
  const start = React.useRef<{ x: number; y: number } | null>(null);
  const total = Math.min(cards.length, GIST_DECK_SIZE);
  const done = index >= total;
  const onDark = tone !== "light";

  const swipe = {
    onPointerDown: (e: React.PointerEvent) => {
      start.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e: React.PointerEvent) => {
      const s = start.current;
      start.current = null;
      if (!s || busy || done) return;
      const dx = e.clientX - s.x;
      const dy = Math.abs(e.clientY - s.y);
      // A deliberate leftward swipe moves to the next question, as the button does.
      if (dx <= -SWIPE_PX && dy < Math.abs(dx) / 2) onNext();
    },
    onPointerCancel: () => {
      start.current = null;
    },
  };

  const dot = tone === "overlay" ? "h-1.5 w-1.5" : "h-[7px] w-[7px]";
  const dots = (
    <span
      role="img"
      aria-label={done ? `All ${GIST_DECK_SIZE} questions done` : `Question ${index + 1} of ${GIST_DECK_SIZE}`}
      className={`flex ${tone === "overlay" ? "gap-[5px]" : "gap-1.5"}`}
    >
      {Array.from({ length: GIST_DECK_SIZE }, (_, i) => (
        <span
          key={i}
          className={`${dot} rounded-pill ${
            i === index ? "bg-gold-500" : i < index ? (onDark ? "bg-champagne/55" : "bg-champagne") : onDark ? "bg-white/20" : "bg-grey-200"
          }`}
        />
      ))}
    </span>
  );
  const question = done ? null : cards[index]?.text;

  if (tone === "overlay") {
    return (
      <div className="relative" aria-live="polite">
        {!done ? (
          <div aria-hidden="true" className="absolute bottom-2 right-0 top-2 w-10 rounded-[14px] border border-champagne/[.16] bg-green-800/60" />
        ) : null}
        <div
          {...swipe}
          className="relative mr-2 flex touch-pan-y items-center gap-2 rounded-2xl border border-champagne/20 bg-green-800/[.86] py-2.5 pl-3.5 pr-1.5"
        >
          <div className="grid min-w-0 flex-1 gap-[7px]">
            {dots}
            <p className="m-0 font-serif text-[16px] font-bold leading-[1.3] text-white [text-wrap:balance]">
              {done ? "That's the deck. Keep talking." : question}
            </p>
          </div>
          {!done ? (
            <button
              type="button"
              aria-label="Next question"
              disabled={busy}
              onClick={onNext}
              className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-pill border border-champagne/40 bg-transparent text-champagne hover:bg-champagne/10 disabled:opacity-60"
            >
              <Arrow />
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  const shell = onDark ? "border-champagne/20 bg-green-700" : "border-ink-900/[.12] bg-white";
  const label = onDark ? "text-champagne" : "text-green-500";
  const text = onDark ? "text-white" : "text-ink-900";

  if (done) {
    return (
      <div className={`grid gap-3.5 rounded-2xl border p-4 ${shell}`} aria-live="polite">
        <p className={`m-0 font-serif text-[20px] font-bold leading-[1.3] [text-wrap:balance] ${text}`}>That&rsquo;s the deck. Keep talking.</p>
        {dots}
      </div>
    );
  }

  return (
    <div className="grid gap-2.5">
      <div className="relative" aria-live="polite">
        {/* The next card, peeking — there is always one while a question shows. */}
        <div aria-hidden="true" className={`absolute bottom-3 right-0 top-3 w-12 rounded-2xl border ${onDark ? "border-champagne/[.14] bg-green-700" : "border-ink-900/[.08] bg-grey-100"}`} />
        <div {...swipe} className={`relative mr-2.5 grid touch-pan-y gap-2 rounded-2xl border px-4 pb-1 pt-4 ${shell}`}>
          <p className={`m-0 text-[12px] font-semibold uppercase tracking-[0.12em] ${label}`}>
            Question {index + 1} of {GIST_DECK_SIZE}
          </p>
          <p className={`m-0 font-serif text-[20px] font-bold leading-[1.3] [text-wrap:balance] ${text}`}>{question}</p>
          <div className={`mt-1 flex items-center justify-between gap-3 border-t pt-0.5 ${onDark ? "border-champagne/[.14]" : "border-ink-900/10"}`}>
            {dots}
            <button
              type="button"
              disabled={busy}
              onClick={onNext}
              className={`-mr-1.5 flex min-h-11 items-center gap-1.5 rounded-[10px] border-0 bg-transparent pl-2.5 pr-1.5 text-[14px] font-semibold disabled:opacity-60 ${
                onDark ? "text-champagne hover:bg-champagne/[.08]" : "text-green-550 hover:bg-green-50"
              }`}
            >
              Next question
              <Arrow />
            </button>
          </div>
        </div>
      </div>
      {index === 0 ? (
        <p className={`m-0 text-center text-[13px] ${onDark ? "text-white/[.66]" : "text-grey-600"}`}>Either of you can move to the next question.</p>
      ) : null}
    </div>
  );
}

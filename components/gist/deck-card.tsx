"use client";

import * as React from "react";
import { GIST_DECK_SIZE } from "@/lib/gist";

/**
 * The Gist question card — one question at a time, the same on both screens
 * (decided 8 October 2026; PRD §5.4; gist-video-call.html).
 *
 * Six cards in a fixed arc, dealt for this Gist by the server (0039). Either
 * person moves on — with "Next question", or by swiping the card left — and
 * the server moves it for both. After the last card: "That's the deck. Keep
 * talking." Toastly never asks the question: the two people do.
 *
 * The swipe here only turns this card. It is the one swipe in Toastly and is
 * never a matching gesture (CLAUDE.md; the constraint check allows it in this
 * file only).
 */

export type DeckCardQuestion = { position: number; text: string };

const SWIPE_PX = 60;

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
  tone?: "light" | "dark";
}) {
  const start = React.useRef<{ x: number; y: number } | null>(null);
  const done = index >= Math.min(cards.length, GIST_DECK_SIZE);
  const dark = tone === "dark";

  const dots = (
    <span
      role="img"
      aria-label={done ? `All ${GIST_DECK_SIZE} questions done` : `Question ${index + 1} of ${GIST_DECK_SIZE}`}
      className="flex gap-1.5"
    >
      {Array.from({ length: GIST_DECK_SIZE }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-pill ${
            i === index ? "bg-gold-500" : i < index ? (dark ? "bg-champagne/55" : "bg-champagne") : dark ? "bg-white/20" : "bg-grey-200"
          }`}
        />
      ))}
    </span>
  );

  if (done) {
    return (
      <div className={`grid gap-3 rounded-xl border px-[15px] py-4 ${dark ? "border-white/10 bg-white/[.06]" : "border-ink-900/[.12] bg-white"}`} aria-live="polite">
        <p className={`m-0 font-serif text-[20px] font-bold leading-[1.3] [text-wrap:balance] ${dark ? "text-white" : "text-ink-900"}`}>
          That&rsquo;s the deck. Keep talking.
        </p>
        {dots}
      </div>
    );
  }

  const card = cards[index];
  return (
    <div
      className={`grid touch-pan-y gap-3 rounded-xl border px-[15px] py-4 ${dark ? "border-white/10 bg-white/[.06]" : "border-ink-900/[.12] bg-white"}`}
      aria-live="polite"
      onPointerDown={(e) => {
        start.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const s = start.current;
        start.current = null;
        if (!s || busy) return;
        const dx = e.clientX - s.x;
        const dy = Math.abs(e.clientY - s.y);
        // A deliberate leftward swipe moves to the next question, as the button does.
        if (dx <= -SWIPE_PX && dy < Math.abs(dx) / 2) onNext();
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <p className={`m-0 font-sans text-chip font-semibold uppercase tracking-[0.12em] ${dark ? "text-champagne" : "text-green-500"}`}>
          Question {index + 1} of {GIST_DECK_SIZE}
        </p>
        {dots}
      </div>
      <p className={`m-0 font-serif text-[21px] font-bold leading-[1.3] [text-wrap:balance] ${dark ? "text-white" : "text-ink-900"}`}>
        {card?.text}
      </p>
      {index === 0 ? (
        <p className={`m-0 text-nav leading-[1.55] ${dark ? "text-white/70" : "text-grey-600"}`}>Either of you can move to the next question.</p>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={onNext}
        className={`flex min-h-11 items-center gap-1.5 justify-self-end rounded-lg border px-3.5 py-2 text-ui font-semibold disabled:opacity-60 ${
          dark ? "border-champagne/40 text-champagne hover:bg-champagne/[.08]" : "border-ink-900/20 text-ink-900 hover:border-green-500"
        }`}
      >
        Next question
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12h14m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

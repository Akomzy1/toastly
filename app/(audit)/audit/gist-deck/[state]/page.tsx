"use client";

import { notFound } from "next/navigation";
import { DeckCard } from "@/components/gist/deck-card";

/** Mobile-audit harness: the in-call question card, six cards (gated by the layout). */
// The owner's approved bank (9 October 2026), one per slot (0039).
const CARDS = [
  "What did you eat today, and was it a good decision?",
  "What is something you have changed your mind about recently?",
  "Who in your family would you introduce someone to first?",
  "What are you working towards right now, money-wise or otherwise?",
  "What would you want to be true about your life in five years?",
  "What made you decide you are ready for something serious?",
].map((text, i) => ({ position: i + 1, text }));
const INDEX: Record<string, number> = { first: 0, real: 5, done: 6, dark: 2 };

export default function AuditGistDeck({ params }: { params: { state: string } }) {
  const index = INDEX[params.state];
  if (index === undefined) notFound();
  const dark = params.state === "dark";
  return (
    <div className={`min-h-screen ${dark ? "bg-green-800" : ""}`}>
      <div className="mx-auto grid max-w-[640px] gap-6 px-5 py-section-y">
        <DeckCard cards={CARDS} index={index} busy={false} onNext={() => undefined} tone={dark ? "dark" : "light"} />
      </div>
    </div>
  );
}

"use client";

import { notFound } from "next/navigation";
import { DeckCard } from "@/components/gist/deck-card";

/** Mobile-audit harness: the in-call question card (gated by the layout). */
const QUESTIONS = [
  { id: 1, text: "What's a food you'd defend to the end?", depth: 1 },
  { id: 2, text: "What did your family argue about at the dinner table?", depth: 2 },
  { id: 3, text: "What does a good marriage look like to you, up close?", depth: 3 },
];
const INDEX: Record<string, number> = { first: 0, real: 2, done: 3 };

export default function AuditGistDeck({ params }: { params: { state: string } }) {
  const index = INDEX[params.state];
  if (index === undefined) notFound();
  return (
    <div className="mx-auto grid max-w-[640px] gap-6 px-5 py-section-y">
      <DeckCard questions={QUESTIONS} index={index} busy={false} onSkip={() => undefined} onNext={() => undefined} />
    </div>
  );
}

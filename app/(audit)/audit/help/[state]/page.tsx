"use client";

import { notFound } from "next/navigation";
import { HelpPanel, type HelpItem } from "@/components/help/help-panel";

/**
 * Mobile-audit harness: Toastly Help states with mock content. The gate is in
 * the layout (requireAuditHarness), since this page is a client component.
 */
const SELFIE: HelpItem[] = [
  { kind: "member", text: "Why didn't my selfie check work?" },
  {
    kind: "reply",
    reply: {
      language: "en",
      action: "retry_selfie",
      handoff: null,
      safety: false,
      paragraphs: [
        "Your last selfie check couldn't confirm it was you, live. This usually comes down to light: glare, a bright window behind you, or a dark room.",
        "Face a window or a lamp, keep your whole face inside the frame, and hold still until the prompts say you're done.",
      ],
    },
  },
];
const PIDGIN: HelpItem[] = [
  { kind: "member", text: "Why my payment no go through?" },
  {
    kind: "reply",
    reply: {
      language: "pcm",
      action: "payment",
      handoff: null,
      safety: false,
      paragraphs: [
        "Sorry about am. Most times, payment no dey go when your bank decline am — maybe your card don reach im daily limit, or di bank wan make you approve am for dia app first.",
      ],
    },
  },
];
const REFUND: HelpItem[] = [
  { kind: "member", text: "I was charged twice for 20 coins. I'd like a refund for one of them." },
  {
    kind: "reply",
    reply: {
      language: "en",
      action: "none",
      handoff: "refund",
      safety: false,
      paragraphs: [
        "Sorry that happened. Refunds are handled by a person on our team, so I can't issue one myself.",
        "I can pass this on now, with what you've told me here.",
      ],
    },
  },
];
const STATES: Record<string, HelpItem[]> = {
  start: [],
  reply: SELFIE,
  pidgin: PIDGIN,
  offer: REFUND,
  passed: [...REFUND, { kind: "passed", reference: "TH-58214" }],
  safety: [{ kind: "member", text: "Someone is threatening me." }, { kind: "safety" }],
};

export default function AuditHelp({ params }: { params: { state: string } }) {
  const items = STATES[params.state];
  if (!items) notFound();
  return <HelpPanel open onClose={() => undefined} initialItems={items} />;
}

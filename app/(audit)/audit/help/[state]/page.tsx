"use client";

import { notFound } from "next/navigation";
import { HelpPanel, type HelpItem } from "@/components/help/help-panel";
import type { HelpAnswer, TeamReply } from "@/lib/help-answer";

/**
 * Mobile-audit harness: Toastly Help states with mock content. The gate is in
 * the layout (requireAuditHarness), since this page is a client component.
 */
const answer = (a: Partial<HelpAnswer> & Pick<HelpAnswer, "paragraphs">): HelpAnswer => ({
  language: "en",
  action: "none",
  handoff: "none",
  category: "other",
  ticket: null,
  offer_person: false,
  safety: false,
  crisis: null,
  emergency: [],
  ...a,
});

const SELFIE: HelpItem[] = [
  { kind: "member", text: "Why didn't my selfie check work?" },
  {
    kind: "reply",
    reply: answer({
      action: "retry_selfie",
      category: "verification",
      paragraphs: [
        "Your last selfie check couldn't confirm it was you, live. This usually comes down to light: glare, a bright window behind you, or a dark room.",
        "Face a window or a lamp, keep your whole face inside the frame, and hold still until the prompts say you're done.",
      ],
    }),
  },
];
const PIDGIN: HelpItem[] = [
  { kind: "member", text: "Why my payment no go through?" },
  {
    kind: "reply",
    reply: answer({
      language: "pcm",
      action: "payment",
      category: "payment",
      paragraphs: [
        "Sorry about am. Most times, payment no dey go when your bank decline am — maybe your card don reach im daily limit, or di bank wan make you approve am for dia app first.",
      ],
    }),
  },
];
const STUCK: HelpItem[] = [
  { kind: "member", text: "It still says my ID didn't match." },
  {
    kind: "reply",
    reply: answer({
      category: "verification",
      offer_person: true,
      paragraphs: ["The ID check compares your selfie with the photo on the official record. Try again in good light, facing the camera."],
    }),
  },
  { kind: "offer", lang: "en", reason: "not_resolved", category: "verification" },
];
const REFUND: HelpItem[] = [
  { kind: "member", text: "I was charged twice for 20 coins. I'd like a refund for one of them." },
  {
    kind: "passed",
    reference: "TH-58214",
    sla: "A person from our team will reply within 24 hours.",
    lang: "en",
    paragraphs: ["I've passed this to a person on our team. They'll see what you've told me here, so you don't need to repeat it."],
  },
];
const EMERGENCY_NG = [
  { label: "National emergency", number: "112" },
  { label: "Lagos State emergency", number: "767" },
];
const REPLIES: TeamReply[] = [
  {
    id: "r1",
    ticket_id: "t1",
    reference: "TH-58214",
    body: "Hi — we've checked this and refunded the second 20-coin charge to your card. It can take 3 to 5 working days to show.\n\nSorry for the trouble.",
    created_at: "2026-10-09T10:12:00Z",
    read: false,
  },
];

const STATES: Record<string, { items: HelpItem[]; replies?: TeamReply[] }> = {
  start: { items: [] },
  reply: { items: SELFIE },
  pidgin: { items: PIDGIN },
  offer: { items: STUCK },
  passed: { items: REFUND },
  safety: {
    items: [
      { kind: "member", text: "Someone is threatening me." },
      { kind: "safety", selfHarm: false, crisis: [], emergency: EMERGENCY_NG, reference: "TH-40117", sla: "A person from our team will reply within 1 hour." },
    ],
  },
  "self-harm": {
    items: [
      { kind: "member", text: "I don't want to be alive anymore." },
      {
        kind: "safety",
        selfHarm: true,
        crisis: [
          { name: "Samaritans", contact: "116 123", href: "tel:116123", how: "Call free, any time", source: "", reviewedBy: "audit", reviewedOn: "2026-10-09" },
          { name: "Shout", contact: "85258", href: "sms:85258", how: "Text SHOUT, any time", source: "", reviewedBy: "audit", reviewedOn: "2026-10-09" },
        ],
        emergency: [{ label: "Emergency", number: "999" }],
        reference: "TH-40118",
        sla: "A person from our team will reply within 1 hour.",
      },
    ],
  },
  "self-harm-unreviewed": {
    items: [
      { kind: "member", text: "I want to end my life." },
      { kind: "safety", selfHarm: true, crisis: [], emergency: EMERGENCY_NG, reference: "TH-40119", sla: "A person from our team will reply within 1 hour." },
    ],
  },
  replies: { items: [], replies: REPLIES },
};

export default function AuditHelp({ params }: { params: { state: string } }) {
  const s = STATES[params.state];
  if (!s) notFound();
  return <HelpPanel open onClose={() => undefined} initialItems={s.items} initialReplies={s.replies ?? []} />;
}

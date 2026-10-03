import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAuditHarness } from "@/lib/audit-harness";
import { AnswerEditor } from "@/components/profile/answer-editor";
import { FEEDBACK_COPY, type FeedbackLabel } from "@/lib/answer-mirror";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Audit · Answer Mirror", robots: { index: false, follow: false } };

/** Mobile-audit harness: answer-mirror.slim.html's states, with its samples. */
const SAMPLES: Record<string, { text: string; label?: FeedbackLabel }> = {
  before: { text: "Church in the morning, lunch, then a film in the evening." },
  great: { text: "Jollof at my aunty's in Surulere, a long call with my brother in Leeds, then choir practice I pretend not to enjoy.", label: "great_answer" },
  specific: { text: "Relaxing and spending quality time with family and friends.", label: "be_more_specific" },
  detail: { text: "Church in the morning, lunch, then a film in the evening.", label: "add_a_personal_detail" },
  short: { text: "Sleeping.", label: "too_short" },
};

export default function AuditAnswerMirror({ params }: { params: { state: string } }) {
  requireAuditHarness();
  const s = SAMPLES[params.state];
  if (!s) notFound();
  return (
    <AnswerEditor
      promptId={1}
      promptText="A Sunday that feels like me…"
      initial={s.text}
      initialFeedback={s.label ? FEEDBACK_COPY[s.label] : undefined}
      aiAvailable
    />
  );
}

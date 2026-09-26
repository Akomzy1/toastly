import type { Metadata } from "next";
import { requireAuditHarness } from "@/lib/audit-harness";
import { MatchCard } from "@/app/(app)/feed/match-card";
import type { FeedCandidate } from "@/lib/feed";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Audit · genotype display",
  robots: { index: false, follow: false },
};

// genotype-display.slim.html's "Both shared" state: the chip among the
// card's other facts. Mock member; the chip renders exactly as in the feed.
const CANDIDATE: FeedCandidate = {
  id: "00000000-0000-0000-0000-0000000000bb",
  display_name: "Amaka",
  city: "Victoria Island, Lagos",
  stage: "verified_real",
  answers: [
    {
      id: "00000000-0000-0000-0000-0000000000c1",
      prompt: "A perfect Sunday",
      answer: "Sunday jollof is non-negotiable. I'd rather talk for an hour than text for a week.",
    },
  ],
  tags: ["Product manager", "Christian"],
  genotype: "AS",
};

export default function AuditGenotypeDisplay() {
  requireAuditHarness();
  return (
    <div className="mx-auto grid max-w-[640px] gap-6 px-5 py-section-y">
      <h1 className="text-h3 text-ink-900">Today&rsquo;s matches</h1>
      <MatchCard candidate={CANDIDATE} canSendText={false} />
    </div>
  );
}

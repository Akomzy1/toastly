import type { Metadata } from "next";
import { requireAuditHarness } from "@/lib/audit-harness";
import { SpotSuggestions, type Spot } from "@/app/(app)/gist/[id]/spot-suggestions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Audit · date spot",
  robots: { index: false, follow: false },
};

// One suggested and one accepted, so both states of the card are measured.
const SPOTS: Spot[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Café Neo, Ikoyi",
    address: "Awolowo Road, Ikoyi, Lagos",
    category: "cafe",
    anchor: "midpoint",
    status: "suggested",
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    name: "Terra Kulture",
    address: "Tiamiyu Savage Street, Victoria Island, Lagos",
    category: "restaurant",
    anchor: "midpoint",
    status: "accepted",
  },
];

export default function AuditDateSpot() {
  requireAuditHarness();

  return (
    <div className="mx-auto grid max-w-[640px] gap-6 px-5 py-section-y">
      <div className="grid gap-2">
        <h1 className="text-h3 text-ink-900">Voice Gist</h1>
      </div>
      <SpotSuggestions
        sessionId="00000000-0000-0000-0000-0000000000aa"
        spots={SPOTS}
        mutual
        configured
        matchFirst="Amaka"
      />
    </div>
  );
}

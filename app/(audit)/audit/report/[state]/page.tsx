import { notFound } from "next/navigation";
import { requireAuditHarness } from "@/lib/audit-harness";
import { Card } from "@/components/ui/card";
import { ReportForm } from "@/components/safety/report-form";
import { BlockButton } from "@/components/safety/block-button";

export const dynamic = "force-dynamic";

/**
 * Mobile-audit harness: the shared report list (ReportReasons, decided
 * 7 October 2026) as the feed card, Gist and date screens show it once
 * "Report or block" is opened — on a card, and at the Gist screen's
 * narrower padding.
 */
const ID = "00000000-0000-4000-8000-000000000002";

const STATES: Record<string, "card" | "plain"> = { card: "card", plain: "plain" };

export default function AuditReport({ params }: { params: { state: string } }) {
  requireAuditHarness();
  const s = STATES[params.state];
  if (!s) notFound();
  const body = (
    <div className="grid gap-5">
      <ReportForm memberId={ID} name="Amaka" />
      <BlockButton memberId={ID} name="Amaka" />
    </div>
  );
  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto grid max-w-[680px] gap-6 px-3.5 pb-24 pt-[18px]">
        {s === "card" ? <Card className="grid gap-5 p-[26px]">{body}</Card> : body}
      </div>
    </div>
  );
}

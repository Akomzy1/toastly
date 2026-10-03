import type { Metadata } from "next";
import { requireAuditHarness } from "@/lib/audit-harness";
import { Card } from "@/components/ui/card";
import { GistCall } from "@/components/gist/gist-call";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Audit · Gist call", robots: { index: false, follow: false } };

/** Mobile-audit harness: the call card before joining. In-call states need a
 *  live room and are covered by the two-browser transport test instead. */
export default function AuditGistCall() {
  requireAuditHarness();
  return (
    <div className="mx-auto grid max-w-[640px] gap-6 px-5 py-section-y">
      <Card className="grid gap-4 p-[26px]">
        <GistCall sessionId="00000000-0000-0000-0000-000000000000" otherName="Adaeze Okafor" />
      </Card>
    </div>
  );
}

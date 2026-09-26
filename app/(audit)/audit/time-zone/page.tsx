import type { Metadata } from "next";
import { requireAuditHarness } from "@/lib/audit-harness";
import { Card } from "@/components/ui/card";
import { TimeZoneField } from "@/components/app/time-zone-field";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Audit · time zone",
  robots: { index: false, follow: false },
};

export default function AuditTimeZone() {
  requireAuditHarness();

  return (
    <div className="mx-auto grid max-w-[720px] gap-6 px-5 py-section-y">
      <div className="grid gap-2">
        <h1 className="text-h3 text-ink-900">Time zone</h1>
      </div>
      <Card className="grid gap-5 p-[26px]">
        <TimeZoneField defaultValue={null} />
      </Card>
    </div>
  );
}

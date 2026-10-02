import type { Metadata } from "next";
import { requireAuditHarness } from "@/lib/audit-harness";
import { YourData } from "@/components/account/your-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Audit · your data",
  robots: { index: false, follow: false },
};

/** Mobile-audit harness: the "Your data" card on the profile page. */
export default function AuditAccountData() {
  requireAuditHarness();
  return (
    <div className="mx-auto grid max-w-[720px] gap-6 px-5 py-section-y">
      <YourData />
    </div>
  );
}

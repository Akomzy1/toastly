import type { Metadata } from "next";
import { requireAuditHarness } from "@/lib/audit-harness";
import { YourData } from "@/components/account/your-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Audit · delete account",
  robots: { index: false, follow: false },
};

/** Mobile-audit harness: the delete-account sheet, open. */
export default function AuditAccountDelete() {
  requireAuditHarness();
  return (
    <div className="mx-auto grid max-w-[720px] gap-6 px-5 py-section-y">
      <YourData initialSheetOpen />
    </div>
  );
}

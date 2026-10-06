import type { Metadata } from "next";
import { requireAuditHarness } from "@/lib/audit-harness";
import { DeleteFlow } from "@/components/account/delete-flow";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Audit · delete account",
  robots: { index: false, follow: false },
};

/** Mobile-audit harness: account-delete.slim.html step 1, with coins and an open review. */
export default function AuditAccountDelete() {
  requireAuditHarness();
  return (
    <div className="min-h-screen bg-paper">
      <DeleteFlow coins={12} reviewOpen />
    </div>
  );
}

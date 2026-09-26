import type { Metadata } from "next";
import { requireAuditHarness } from "@/lib/audit-harness";
import { GenotypeSettings } from "@/components/genotype/genotype-settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Audit · genotype entry",
  robots: { index: false, follow: false },
};

/** Mobile-audit harness: genotype-entry.slim.html's state, nothing selected. */
export default function AuditGenotypeEntry() {
  requireAuditHarness();
  return (
    <div className="mx-auto grid max-w-[720px] gap-6 px-5 py-section-y">
      <GenotypeSettings
        consented
        reconsent={false}
        value={null}
        visibility="private"
        initialStep="entry"
      />
    </div>
  );
}

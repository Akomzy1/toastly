import type { Metadata } from "next";
import { requireAuditHarness } from "@/lib/audit-harness";
import { GenotypeSettings } from "@/components/genotype/genotype-settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Audit · genotype visibility",
  robots: { index: false, follow: false },
};

/** Mobile-audit harness: genotype-visibility.slim.html's state, default selected. */
export default function AuditGenotypeVisibility() {
  requireAuditHarness();
  return (
    <div className="mx-auto grid max-w-[720px] gap-6 px-5 py-section-y">
      <GenotypeSettings
        consented
        reconsent={false}
        value="AS"
        visibility="private"
        initialStep="visibility"
      />
    </div>
  );
}

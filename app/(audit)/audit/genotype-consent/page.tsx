import type { Metadata } from "next";
import { requireAuditHarness } from "@/lib/audit-harness";
import { GenotypeSettings } from "@/components/genotype/genotype-settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Audit · genotype consent",
  robots: { index: false, follow: false },
};

/** Mobile-audit harness: genotype-consent.slim.html's state, unticked. */
export default function AuditGenotypeConsent() {
  requireAuditHarness();
  return (
    <div className="mx-auto grid max-w-[720px] gap-6 px-5 py-section-y">
      <GenotypeSettings
        consented={false}
        reconsent={false}
        value={null}
        visibility="private"
        initialStep="consent"
      />
    </div>
  );
}

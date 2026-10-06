import type { Metadata } from "next";
import { requireAuditHarness } from "@/lib/audit-harness";
import { AppBand } from "@/components/app/app-band";
import { YourDataList } from "@/components/account/your-data-list";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Audit · your data",
  robots: { index: false, follow: false },
};

/** Mobile-audit harness: Your data (your-data.slim.html), a member in Nigeria. */
export default function AuditAccountData() {
  requireAuditHarness();
  return (
    <div className="min-h-screen bg-paper">
      <AppBand title="Your data" sub="Settings" backHref="/profile" />
      <YourDataList photoReveal="verified_members" inNigeria openToAbroad />
    </div>
  );
}

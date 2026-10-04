import { requireAuditHarness } from "@/lib/audit-harness";

export const dynamic = "force-dynamic";

export default function AuditDatesLayout({ children }: { children: React.ReactNode }) {
  requireAuditHarness();
  return children;
}

import { requireAuditHarness } from "@/lib/audit-harness";

export const dynamic = "force-dynamic";

export default function AuditNoticesLayout({ children }: { children: React.ReactNode }) {
  requireAuditHarness();
  return children;
}

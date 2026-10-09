import { requireAuditHarness } from "@/lib/audit-harness";

export const dynamic = "force-dynamic";

/** The in-call harness pages render only with AUDIT_HARNESS set. */
export default function AuditGistCallLayout({ children }: { children: React.ReactNode }) {
  requireAuditHarness();
  return children;
}

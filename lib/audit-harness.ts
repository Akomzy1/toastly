import { notFound } from "next/navigation";

/**
 * Gate for the mobile-audit harness routes under /audit.
 *
 * Those routes render in-app surfaces with MOCK data so they can be measured
 * at narrow viewports without a signed-in member or a configured Supabase
 * project. They must never be reachable in production: every page calls this
 * first and 404s unless AUDIT_HARNESS=1 is set on the process running
 * `next start`. Each page is also `force-dynamic`, so the gate is evaluated
 * per request rather than frozen into a static 404 at build time.
 *
 * Nothing under /audit reads real data, writes anything, or is linked from
 * anywhere in the app.
 */
export function requireAuditHarness(): void {
  if (process.env.AUDIT_HARNESS !== "1") notFound();
}

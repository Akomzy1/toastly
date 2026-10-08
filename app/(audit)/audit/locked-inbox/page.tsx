import type { Metadata } from "next";
import { requireAuditHarness } from "@/lib/audit-harness";
import { LockedRow } from "@/app/(app)/inbox/locked-row";
import { BlindSafety } from "@/components/safety/blind-safety";
import { lockedLabel } from "@/lib/inbox";
import { upgradeOffer } from "@/lib/plan-numbers";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Audit · locked inbox",
  robots: { index: false, follow: false },
};

/**
 * Mobile-audit harness: the locked inbox exactly as /inbox renders it for a
 * Starter member with unread messages — the count pill, the locked row, and
 * the blind report/block card beneath it. Mock count, no session.
 */
export default function AuditLockedInbox() {
  requireAuditHarness();
  const unread = 3;

  return (
    <div className="mx-auto grid max-w-[560px] gap-6 px-5 py-section-y">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-h3 text-ink-900">Inbox</h1>
        <span className="grid h-5 min-w-5 place-items-center rounded-pill bg-gold-500 px-1.5 text-chip font-semibold text-green-800">
          {unread}
        </span>
      </div>
      <LockedRow label={lockedLabel(unread)} offer={upgradeOffer(false)} />
      <BlindSafety />
    </div>
  );
}

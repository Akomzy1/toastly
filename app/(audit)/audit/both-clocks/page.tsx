import type { Metadata } from "next";
import Link from "next/link";
import { requireAuditHarness } from "@/lib/audit-harness";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BothClocks } from "@/components/gist/both-clocks";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Audit · both clocks",
  robots: { index: false, follow: false },
};

/**
 * Mobile-audit harness: one Gist list row exactly as /gist renders it for a
 * pair split across zones — Lagos and Toronto, a fixed instant. The clocks
 * are computed by lib/scheduling.ts from real zone data; only the pair is
 * mocked.
 */
export default function AuditBothClocks() {
  requireAuditHarness();

  return (
    <div className="mx-auto grid max-w-[640px] gap-6 px-5 py-section-y">
      <div className="grid gap-2">
        <h1 className="text-h3 text-ink-900">Gist sessions</h1>
      </div>
      <ul className="grid list-none gap-4 p-0">
        <li>
          <Card className="flex flex-wrap items-center justify-between gap-4 p-[26px]">
            <div className="grid gap-1.5">
              <span className="flex items-center gap-2">
                <Badge variant="verified">Voice</Badge>
                <span className="text-caption uppercase text-grey-600">Confirmed</span>
              </span>
              <BothClocks
                instant={new Date("2026-09-18T15:30:00Z")}
                yourZone="Africa/Lagos"
                yourCity="Lagos"
                theirZone="America/Toronto"
                theirCity="Toronto"
                theirName="Amaka"
              />
            </div>
            <Button variant="outline" asChild>
              <Link href="/gist">Open</Link>
            </Button>
          </Card>
        </li>
      </ul>
    </div>
  );
}

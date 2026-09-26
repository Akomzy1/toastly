import type { Metadata } from "next";
import Link from "next/link";
import { requireAuditHarness } from "@/lib/audit-harness";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { FeedFallbackNotice } from "@/components/app/feed-fallback-notice";
import { DAILY_MATCH_COUNT } from "@/lib/feed";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Audit · feed fallback",
  robots: { index: false, follow: false },
};

/**
 * Mobile-audit harness: the feed page chrome exactly as /feed renders it,
 * with the fallback band shown for a member whose city pool isn't open. No
 * candidates are mocked — what surrounds the band is the real page markup,
 * including the real empty state, not an invented list.
 */
export default function AuditFeedFallback() {
  requireAuditHarness();

  return (
    <div className="mx-auto grid max-w-[640px] gap-6 px-5 py-section-y">
      <div className="grid gap-2">
        <h1 className="text-h3 text-ink-900">Today&rsquo;s matches</h1>
        <p className="text-ui text-grey-600">
          {DAILY_MATCH_COUNT} people, once a day. Read what they wrote and
          reply to something specific. When they&rsquo;re gone, they&rsquo;re
          gone — go and live your life.
        </p>
      </div>

      <Notice tone="info">
        Everybody gets {DAILY_MATCH_COUNT} a day — free or paid, the number
        never changes. Paying improves how well the {DAILY_MATCH_COUNT} are
        matched to you, never how many there are.
      </Notice>

      <FeedFallbackNotice city="London" />

      <Card className="grid gap-3 p-[26px]">
        <h2 className="text-h5 text-ink-900">No matches today</h2>
        <p className="text-ui text-grey-600">
          There aren&rsquo;t enough verified members in your pool yet.
          Tomorrow&rsquo;s feed will try again — and widening your pool in
          settings gives it more to work with.
        </p>
        <Button variant="outline" asChild className="justify-self-start">
          <Link href="/profile">Profile settings</Link>
        </Button>
      </Card>
    </div>
  );
}

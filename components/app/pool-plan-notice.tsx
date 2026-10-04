import Link from "next/link";
import { Notice } from "@/components/ui/notice";

/**
 * The member chose diaspora-to-diaspora matching without a Diaspora plan, so
 * today's six came from back home (0012). Distinct from the city fallback
 * notice (feed-fallback-notice.tsx), which is for a city not yet open.
 *
 * NOT IN A PROTOTYPE — flagged in SKILL.md. Built from the in-app Notice.
 */
export function PoolPlanNotice() {
  return (
    <Notice tone="info" title="Today's six are from back home">
      Matching with members in your diaspora community is part of the Diaspora plan. On your current plan you&rsquo;re
      matched with members in Nigeria.
      <Link href="/profile/plan" className="mt-1 flex min-h-11 items-center font-semibold underline">
        See the Diaspora plan
      </Link>
    </Notice>
  );
}

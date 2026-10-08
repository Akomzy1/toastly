import Link from "next/link";
import { Notice } from "@/components/ui/notice";
import { upgradeOffer } from "@/lib/plan-numbers";

/**
 * The member chose diaspora-to-diaspora matching without a Diaspora plan, so
 * today's six came from back home (0012). Distinct from the city fallback
 * notice (feed-fallback-notice.tsx), which is for a city not yet open.
 *
 * Names the plan and its price, with "Not now" (decided 8 October 2026).
 *
 * NOT IN A PROTOTYPE — flagged in SKILL.md. Built from the in-app Notice.
 */
export function PoolPlanNotice() {
  // Only members abroad ever see this notice.
  const offer = upgradeOffer(true);
  return (
    <Notice tone="info" title="Today's six are from back home">
      Matching with members in your diaspora community is part of the Diaspora plan. On your current plan you&rsquo;re
      matched with members in Nigeria.
      <span className="mt-1 flex flex-wrap gap-x-4">
        <Link href="/profile/plan" className="flex min-h-11 items-center font-semibold underline">
          See {offer.plan} · {offer.price}
        </Link>
        <Link href="/profile/pool" className="flex min-h-11 items-center underline">
          Not now
        </Link>
      </span>
    </Notice>
  );
}

import { featureFlags } from "@/lib/features";
import { llmsBody } from "@/lib/llms";

/**
 * /llms.txt — a plain-text summary for machine readers. A route rather than
 * a static file so its plan numbers come from lib/plan-numbers.ts and its
 * feature list from the flags (lib/features.ts), like every other page's.
 */
export const dynamic = "force-static";

export function GET() {
  return new Response(llmsBody(featureFlags()), { headers: { "content-type": "text/plain; charset=utf-8" } });
}

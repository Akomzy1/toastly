/**
 * Product analytics, via PostHog.
 *
 * A deliberately small event set. Five events, each marking a step in the
 * funnel the product is actually judged on: someone joins, gets verified,
 * has a first real conversation, commits to a date, and pays.
 *
 * ---------------------------------------------------------------------------
 * WHAT NEVER GOES TO POSTHOG:
 *
 *   - Trust Sentinel events. Their system of record is Supabase
 *     (`trust_events`, 0009), because they feed a human review queue that
 *     must be auditable and is subject to constraints an analytics tool
 *     cannot enforce. Do not mirror them here "for convenience".
 *   - Message content, Gist audio, transcripts. Same boundary as everywhere
 *     else: behaviour, never words.
 *   - Protected attributes — tribe, religion, language, relationship history,
 *     profession, diaspora status. Never inputs, and never properties.
 *   - Phone numbers, emails, names, or anything else that identifies a member
 *     to a human reading a dashboard. The distinct id is the profile UUID.
 *
 * The property guard below drops anything on that list rather than trusting
 * every future call site to remember.
 * ---------------------------------------------------------------------------
 */

export type AnalyticsEvent =
  | "signup"
  | "verification_complete"
  | "first_gist"
  | "first_deposit"
  | "upgrade";

const FORBIDDEN_PROPERTIES = [
  "body", "message", "text", "content", "snippet", "preview",
  "transcript", "audio", "recording",
  "tribe", "religion", "language", "languages", "history",
  "relationship_history", "profession", "education", "diaspora",
  "phone", "phone_number", "email", "display_name", "name",
];

export function analyticsConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY);
}

function host(): string {
  return (
    process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com"
  ).replace(/\/$/, "");
}

/** Drops forbidden keys rather than refusing the whole event. */
function clean(properties: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(properties)) {
    if (FORBIDDEN_PROPERTIES.includes(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Record one event.
 *
 * Server-side, fire-and-forget, and never throws: analytics must not be able
 * to fail a signup or a payment. Returns false when unconfigured so a caller
 * can tell "not sent" from "sent".
 */
export async function capture(
  event: AnalyticsEvent,
  distinctId: string,
  properties: Record<string, unknown> = {},
): Promise<boolean> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || !distinctId) return false;

  try {
    const res = await fetch(`${host()}/i/v0/e/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        event,
        distinct_id: distinctId,
        properties: clean(properties),
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Feature flags for paid features that are promised but not shipped yet
 * (decided 8 October 2026). Server-side only, off unless set to exactly
 * "true". Every listing — the pricing page, the plan screens, the women's
 * offer, Toastly Help, llms.txt, the structured data, and the lines on Home,
 * How It Works and Features — is built from these, never typed by hand.
 *
 *   VIDEO_GIST_ENABLED      live-video Gist (Premium Plus, Diaspora Plus)
 *   SEE_WHO_LIKED_ENABLED   see who liked you (coins; included on the Plus plans)
 *
 * The marketing pages are static, so a change takes effect on the next
 * deploy. scripts/check-launch-flags.mjs fails the build if payments are on
 * (LAUNCH_PAYMENTS_ENABLED) while a feature that's off is still listed.
 *
 * Incognito mode is not built and has no flag: it is not listed anywhere
 * (decided 8 October 2026; a constraint check holds it).
 */

export type FeatureFlags = { videoGist: boolean; seeWhoLiked: boolean };

type Env = Record<string, string | undefined>;

export function featureFlags(env: Env = process.env): FeatureFlags {
  return {
    videoGist: env.VIDEO_GIST_ENABLED === "true",
    seeWhoLiked: env.SEE_WHO_LIKED_ENABLED === "true",
  };
}

/** What Home, How It Works and Features say about video while it's off. */
export const VIDEO_COMING = "Voice first. Live video is coming to Premium Plus.";

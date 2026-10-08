/**
 * Paid features that are promised in the PRD but not built yet. Until a flag
 * here is true, the pricing page, the plan screens, Toastly Help, llms.txt
 * and the structured data must not list the feature (decided 8 October 2026;
 * scripts/check-constraints.mjs holds it).
 *
 * Turn a flag on in the same change that ships the feature, and put its
 * listing back then.
 */

/** Live-video Gist (Premium Plus, Diaspora Plus). Voice only until P2-D ships. */
export const VIDEO_GIST_BUILT = false;

/** See who liked you (a coin purchase, PRD §5.5). No "like" exists yet. */
export const SEE_WHO_LIKED_BUILT = false;

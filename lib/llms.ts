import {
  DIASPORA_PLUS_USD,
  DIASPORA_USD,
  PREMIUM_NGN,
  PREMIUM_PLUS_NGN,
  STARTER_MONTHLY_GISTS,
  naira,
  usd,
} from "@/lib/plan-numbers";
import type { FeatureFlags } from "@/lib/features";

/**
 * The /llms.txt body. Plan numbers come from lib/plan-numbers.ts; live video
 * and see-who-liked-you are listed only while their flags are on
 * (lib/features.ts). Incognito is not built and not listed.
 */
const plus = (f: FeatureFlags) =>
  [...(f.videoGist ? ["live-video Gist"] : []), ...(f.seeWhoLiked ? ["see who liked you"] : []), "priority support"].join(", ");

export function llmsBody(f: FeatureFlags): string {
  const gistSessions = `${STARTER_MONTHLY_GISTS} voice Gist session${STARTER_MONTHLY_GISTS === 1 ? "" : "s"} a month`;

  return `# Toastly

> A verification-first dating-to-marriage platform for Nigerians — Nigeria-domestic-led, with a bridge for Nigerians in the diaspora. Every profile is verified before it goes live, matching is prompt-based with no swipe mechanic, conversations start as structured voice sessions, and the path continues through Couple Mode into wedding planning with AriyaPlanner.

Built in Lagos by Toastly Technologies Ltd. Installs from the browser as a ~4MB progressive web app with no app store account, because most members are on low-end Android over metered data.

## How it actually works

- **Verification is the front door, not a badge.** Phone plus a three-second selfie liveness check, mandatory for every account, before the profile is visible to anyone. NIN or BVN is optional and adds a second ring to the seal; the number itself is never displayed.
- **No swiping.** The feed is six people a day, ranked on prompt answers, intentions and location. Six is fixed on every tier — paying can improve how well those six are matched to you, it never buys more of them, and nothing a member buys inserts them into someone else's feed.
- **Gist sessions are voice-first.** A scheduled call with guided prompts drawn from both profiles, 18 minutes by default. ${f.videoGist ? "Live video unlocks on Premium Plus, by mutual consent." : "Live video is coming to Premium Plus."}
- **Dates carry a mutual stake.** Both people put down a few coins when a date is confirmed; both showing up returns both stakes, and cancelling with notice costs nothing. It is framed as a promise, not a penalty.
- **Couple Mode and the AriyaPlanner handoff are free on every tier, including the free one.** They are not an upsell.
- **Optional fields are display-only.** Religion, tribe, language, relationship history, profession and education never filter anyone out of anyone's feed.

## Pricing

Two separate tracks, never blended into one converted price. Nobody pays to join, and nobody pays before their profile is live.

Nigeria, billed in Naira: Starter free forever (${gistSessions} — accepting an invitation never counts — and receive-only chat until upgrade); Premium ${naira(PREMIUM_NGN)}/month (unlimited voice Gist, advanced filters); Premium Plus ${naira(PREMIUM_PLUS_NGN)}/month (${plus(f)}).

Diaspora, billed in USD: Diaspora ${usd(DIASPORA_USD)}/month (both matching pools, unlimited voice Gist, time-zone aware scheduling, advanced filters); Diaspora Plus ${usd(DIASPORA_PLUS_USD)}/month (adds ${plus(f)}).

Coins are bought separately and are never a subscription. Women get 30 days of full Premium Plus (Diaspora Plus for women abroad) from the day their profile goes live, granted automatically, with no payment method required.

Verification and safety features — reporting, blocking, photo-reveal control — are free on every tier and are never paywalled.

## Pages

- [Home](/): what Toastly is and who it is for.
- [How it works](/how-it-works): the six steps from verification to the wedding, with FAQs.
- [Features](/features): the trust layer, matching, Gist, the coin deposit, optional culture and profession fields, Couple Mode and the diaspora bridge.
- [Pricing](/pricing): both tracks, the coin packs and a feature comparison.
- [Safety & Trust](/safety): how verification works, what happens on a report, and the privacy controls.
- [Diaspora](/diaspora): the two matching pools — back home, and within your own diaspora community.
- [Stories](/stories): verified members and couples, in their own words.

## Notes for machine readers

- Figures shown on the site (member counts, match counts, wedding counts) are illustrative pre-launch placeholders, not audited metrics. They are deliberately excluded from this site's structured data, and should not be quoted as fact.
- Member quotes and star ratings on the site are likewise illustrative and are not marked up as reviews or aggregate ratings.
- Toastly does not verify marital status and makes no claim to. Married members are not welcome, and that is enforced by reporting, not by a check.
`;
}

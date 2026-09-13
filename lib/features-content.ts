/**
 * Features content, transcribed from design/prototype/features.slim.html.
 *
 * Two corrections are marked below: the charity mechanic (rejected, PRD
 * §5.5) and a third occurrence of the Couple-Mode-is-paid error.
 */

export const toc = [
  { n: "01", label: "Verified Real trust layer" },
  { n: "02", label: "Prompt matching, no swiping" },
  { n: "03", label: "Gist voice sessions" },
  { n: "04", label: "Coin-deposit date commitment" },
  { n: "05", label: "Optional culture fields" },
  { n: "06", label: "Optional verified profession" },
  { n: "07", label: "Couple Mode & AriyaPlanner" },
  { n: "08", label: "Diaspora bridge & 4MB PWA" },
];

export const trust = [
  {
    title: "Phone, once",
    body: "One number, one account. Blocking somebody actually blocks them, because they cannot spin up a second profile.",
    tag: "Mandatory",
  },
  {
    title: "Selfie liveness",
    body: "A three-second head turn, checked against your profile photos. A saved picture does not pass.",
    tag: "Mandatory",
  },
  {
    title: "NIN or BVN",
    body: "For members who want maximum trust. Adds a second ring to your seal; the number itself is never shown to anyone.",
    tag: "Optional",
  },
];

export type Dive = {
  n: string;
  kicker: string;
  title: string;
  lede: string;
  points: string[];
  img: string;
  alt: string;
  tone: "light" | "paper" | "dark";
};

export const deepDives: Dive[] = [
  {
    n: "02",
    kicker: "Matching",
    title: "Six people a day, no deck to shuffle.",
    lede: "Your feed is curated from prompt answers and arrives once a day. There is no swipe gesture anywhere in Toastly.",
    points: [
      "Prompts you both answered sit on the card, above the photos.",
      "Replies start on a specific answer, so first messages have somewhere to go.",
      "When the six are done for the day, the app tells you to go and live.",
    ],
    img: "/img/features/feature-matching.webp",
    alt: "Two people talking across a café table in warm evening light",
    tone: "paper",
  },
  {
    n: "03",
    kicker: "Gist",
    title: "Voice-first sessions with a shape.",
    lede: "A Gist has a start, an end, and something to talk about. Live video unlocks on Premium Plus when you both agree to it.",
    points: [
      "Guided prompts drawn from your own profiles.",
      "18-minute default, extendable once.",
      "Audio compressed for Nigerian data — about a quarter of a normal call.",
    ],
    img: "/img/features/feature-gist.webp",
    alt: "A woman laughing during a voice call on her sofa at home",
    tone: "light",
  },
  {
    n: "04",
    kicker: "Date commitment",
    title: "Coins as a promise, not a punishment.",
    lede: "Both people stake a small deposit when a date is confirmed. Show up, get it back. Cancel with notice, get it back.",
    points: [
      "The date is not confirmed until both stakes are down.",
      // OMITTED: "No-show deposits go to a charity the other person chooses."
      // The charity mechanic is rejected (PRD §5.5). The ratified rule is a
      // non-withdrawable stake credit for whoever showed up, which does not
      // ship until Prompt 7, so this says nothing about the destination.
      "The only way a stake doesn't come back is a genuine no-show.",
      "Toastly takes nothing from a stake, ever.",
    ],
    img: "/img/features/feature-coins.webp",
    alt: "Two people greeting each other at a rooftop bar at sunset in Lagos",
    tone: "paper",
  },
  {
    n: "05",
    kicker: "Culture, optional",
    title: "Tribe, language and faith — displayed, never used to filter.",
    lede: "These fields exist because they matter to Nigerian families. They sit on your profile only if you put them there.",
    points: [
      "Toastly is not a religious platform.",
      "No field here ever gates or narrows anybody's feed.",
      "One toggle hides any of them, at any time.",
    ],
    img: "/img/features/feature-culture.webp",
    alt: "Four friends talking and laughing around a table in a warm wood-panelled café",
    tone: "light",
  },
  {
    n: "06",
    kicker: "Work, optional",
    title: "Your work, verified — if you want it there.",
    lede: "Profession and education are optional fields you can add and verify. They sit on your profile only if you put them there, and they are never used to filter anyone out of anyone's feed.",
    points: [
      "Verified profession and education carry the same privacy control as tribe, language and faith — you choose whether they are visible.",
      "Verification is a trust signal, not a status symbol: someone who invents a job usually cannot verify one.",
      "You can filter your own search by profession. Nobody is ever hidden from you, or from anyone else, for leaving it blank.",
    ],
    img: "/img/features/feature-work.webp",
    alt: "A woman sketching ideas on a pinboard in her studio in warm afternoon light",
    tone: "paper",
  },
  {
    n: "07",
    kicker: "The journey",
    title: "Match, Gist, Couple Mode, AriyaPlanner.",
    lede: "The four stations that make Toastly a marriage track rather than a messaging app. Couple Mode is a shared private space; AriyaPlanner takes it from there.",
    points: [
      "Couple Mode: milestones, shared plans, and a private timeline for two.",
      "AriyaPlanner handoff covers introduction, traditional and white wedding.",
      // CORRECTED. The prototype read "Included on Premium Plus in both
      // pricing tracks." Couple Mode and the handoff are free on EVERY tier
      // including Starter — this is the platform's core LTV mechanic
      // (CLAUDE.md, PRD §6) and must never be presented as paid. This is the
      // third place the same error appears, after Home and Pricing.
      "Included on every plan, including Starter — in both pricing tracks.",
    ],
    img: "/img/features/feature-journey.webp",
    alt: "A couple planning together over a notebook and map at their dining table",
    tone: "dark",
  },
  {
    n: "08",
    kicker: "Diaspora & devices",
    title: "Back home, or right where you are.",
    lede: "Choose your matching pool — Nigeria, your diaspora community, or both. The whole thing runs as a 4MB installable app with no store account.",
    points: [
      "Separate USD track for members abroad, Naira track at home.",
      "Time-zone aware Gist scheduling.",
      "Works on low-end Android and over 3G.",
    ],
    img: "/img/features/feature-diaspora.webp",
    alt: "A woman smiling at her phone while walking a city street at dusk",
    tone: "paper",
  },
];

export const minor = [
  {
    title: "Profile prompts",
    body: "Forty-odd prompts written for Nigerian dating, from family expectations to how you handle money.",
  },
  {
    title: "Icebreakers",
    body: "If a Gist stalls, the session offers one question. It never fills the silence for you.",
  },
  {
    title: "Privacy controls",
    body: "Hide your city to neighbourhood level, hide culture fields, pause your profile without losing your seal.",
  },
  {
    title: "Notification preferences",
    body: "Daily feed time is yours to set. No streaks, no nudges, no 'someone liked you' bait.",
  },
  {
    title: "Reporting & blocking",
    body: "Report from any screen. Reports on verified accounts are reviewed by a human within 24 hours.",
  },
  {
    title: "Data saver",
    body: "Photos load at low resolution until tapped, and Gist audio drops bitrate automatically on 3G.",
  },
];

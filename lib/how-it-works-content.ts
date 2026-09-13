/**
 * How It Works content, transcribed from
 * design/prototype/how-it-works.slim.html.
 *
 * Two omissions are marked below. Both are the charity mechanic, which is
 * rejected (PRD §5.5) — it appears twice on this page, in step 4's points
 * and again in the coin-deposit FAQ.
 */

export type Step = {
  n: string;
  kicker: string;
  title: string;
  lede: string;
  points: string[];
  meta: string;
  img: string;
  alt: string;
  tone: "light" | "paper" | "dark";
};

export const steps: Step[] = [
  {
    n: "1",
    kicker: "Verify your identity",
    title: "Prove you're real, once.",
    lede: "Phone number, then a three-second selfie liveness check. Your Verified Real seal is issued before your profile is visible to anybody.",
    points: [
      "One phone number, one account — permanently.",
      "NIN or BVN optional, for a second ring on your seal.",
      "Your documents are never shown to other members.",
    ],
    meta: "About four minutes",
    img: "/img/how-it-works/verify-selfie.webp",
    alt: "Woman holding her phone up for a selfie liveness check at home",
    tone: "light",
  },
  {
    n: "2",
    kicker: "Get your daily matches",
    title: "Six people, once a day.",
    lede: "Your feed is built from prompt answers, not a photo deck. There is nothing to swipe and nothing to run out of at 2am.",
    points: [
      "Prompt answers sit above the photos on every card.",
      "Reply to a specific answer to open a conversation.",
      "Adjust the time your feed arrives.",
    ],
    meta: "Every morning",
    img: "/img/how-it-works/step-daily-matches.webp",
    alt: "A man reading his daily matches on his phone at a café",
    tone: "paper",
  },
  {
    n: "3",
    kicker: "Start gisting",
    title: "Talk before you meet.",
    lede: "Book a structured voice session. Guided prompts, an 18-minute default, and no pressure to look presentable on camera.",
    points: [
      "A couple of sessions is usually enough to know.",
      "Live video unlocks on Premium Plus, by mutual consent.",
      "Audio is compressed for Nigerian data plans.",
    ],
    // The re-exported prototype already says 2, not the 5 recorded as a
    // known conflict in SKILL.md. Verified against PRD §7.1: 2 is correct.
    meta: "2 free sessions a month on Starter",
    img: "/img/how-it-works/step-gisting.webp",
    alt: "A woman laughing during a voice gist session on her sofa at home",
    tone: "light",
  },
  {
    n: "4",
    kicker: "Commit to a date",
    title: "Both of you stake a promise.",
    lede: "When you agree on a time and place, you each put down a few coins. You both show up, you both get them back.",
    points: [
      "The date isn't confirmed until both stakes are down.",
      "Cancelling with notice costs nothing.",
      // OMITTED third point: "A genuine no-show sends their coins to a
      // charity the other person picks." The charity mechanic is rejected
      // (PRD §5.5); the ratified rule is a non-withdrawable stake credit for
      // whoever showed up, which does not ship until Prompt 7. Replaced with
      // a statement that is true today and says nothing about destination.
      // Worded without "forfeit" or "penalty": CLAUDE.md requires the coin
      // copy stay warm ("showing up for each other"), never punitive.
      "The only way a stake doesn't come back is a genuine no-show.",
    ],
    meta: "₦500 typical stake",
    img: "/img/how-it-works/step-commit-date.webp",
    alt: "Two people greeting each other at a rooftop café at sunset",
    tone: "paper",
  },
  {
    n: "5",
    kicker: "Enter Couple Mode",
    title: "A private space for two.",
    lede: "When you're both ready, your profiles pause and Couple Mode opens: a shared timeline, milestones, and plans that live somewhere other than a chat thread.",
    points: [
      "Both profiles pause together — no quiet browsing.",
      "Shared milestones: meeting families, introduction, engagement.",
      "Leave at any time, from either side, without drama.",
    ],
    meta: "Included on every plan",
    img: "/img/how-it-works/step-couple-mode.webp",
    alt: "A couple sitting close on a sofa looking through a photo album",
    tone: "light",
  },
  {
    n: "6",
    kicker: "Plan the wedding",
    title: "AriyaPlanner takes it from here.",
    lede: "The handoff is one tap. Everything you've already told Toastly — cities, families, dates — carries across into a real wedding plan.",
    points: [
      "Introduction ceremony, traditional wedding, white wedding.",
      "Budgets in Naira or USD, vendor shortlists by city.",
      "Diaspora couples can plan a Nigerian wedding abroad.",
    ],
    meta: "Included on every plan",
    img: "/img/how-it-works/step-plan-wedding.webp",
    alt: "Guests in aso ebi at a rooftop wedding celebration at sunset",
    tone: "dark",
  },
];

export const benefits = [
  { title: "No catfish", body: "Every profile passed liveness before you saw it." },
  {
    title: "No swipe fatigue",
    body: "Six people a day, then the app gets out of your way.",
  },
  {
    title: "No blank video calls",
    body: "Every Gist arrives with something to talk about.",
  },
  { title: "No no-shows", body: "Both of you staked something on being there." },
  {
    title: "No dead end",
    body: "The path continues past the chat, into a wedding.",
  },
];

export const faqs: [string, string][] = [
  [
    "Is verification really mandatory?",
    "Yes — phone and selfie liveness, for everybody, before a profile goes live. NIN or BVN is the only optional part.",
  ],
  [
    "How does matching work if there's no swiping?",
    "Six profiles a day, ranked on prompt-answer compatibility, intentions and location. You reply to an answer to start a conversation; profiles you don't act on simply pass.",
  ],
  [
    "What is a Gist session exactly?",
    "A scheduled voice call inside Toastly with guided prompts drawn from your profiles. Eighteen minutes by default, extendable once. Video is a Premium Plus upgrade you both have to agree to.",
  ],
  [
    "What happens to my coin deposit?",
    // REWRITTEN. The prototype answered: "...that money goes to a charity the
    // other person chooses — never to Toastly." The charity mechanic is
    // rejected (PRD §5.5). This answers the question truthfully and stops
    // before the destination, which is not built yet.
    "It comes back when you both show up, or when either of you cancels with notice. The only way it doesn't come back is a genuine no-show.",
  ],
  [
    "Do religion, tribe or language affect my feed?",
    "No. They are display-only fields you opt into. Toastly is non-religious and does not filter matches on any of them.",
  ],
  [
    "What is the AriyaPlanner handoff?",
    "An optional one-tap transfer from Couple Mode into AriyaPlanner, our wedding-planning product: introduction ceremony, traditional wedding and white wedding, with budgets in Naira or USD.",
  ],
];

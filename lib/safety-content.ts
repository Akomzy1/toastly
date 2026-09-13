/**
 * Safety & Trust content, transcribed from
 * design/prototype/safety.slim.html.
 *
 * The charity mechanic appears twice on this page and is removed in both
 * places (PRD §5.5). Nothing on this page may be presented as paywalled:
 * verification, reporting, blocking and photo-reveal control are free on
 * every tier, always (CLAUDE.md).
 */

export const stats = [
  { value: "42,180", label: "Verified profiles on the platform" },
  { value: "1,940", label: "Scam attempts blocked at verification" },
  { value: "8,600", label: "Dates confirmed with a mutual stake" },
  { value: "310", label: "Weddings planned via AriyaPlanner" },
];

export type Block = {
  kicker: string;
  title: string;
  lede: string;
  points: { title: string; body: string }[];
  tone: "light" | "paper" | "dark";
};

export const blocks: Block[] = [
  {
    kicker: "The trust layer",
    title: "Nobody gets in without proving they are a living person.",
    lede: "Phone plus selfie liveness, for every account, before it is visible. This is where romance scams die: you cannot run twelve profiles when each one needs a phone number and a face that moves.",
    points: [
      {
        title: "Phone verification",
        body: "One number, one account, permanently. Blocking somebody actually keeps them gone.",
      },
      {
        title: "Selfie liveness",
        body: "A three-second head turn, matched to your profile photos. A downloaded picture cannot pass it.",
      },
      {
        title: "Human review",
        body: "Anything the automated check finds borderline is looked at by our team in Lagos.",
      },
    ],
    tone: "light",
  },
  {
    kicker: "Optional, not a barrier",
    title: "NIN or BVN, for members who want the extra ring.",
    lede: "Some people want to know they are talking to someone whose legal identity has been confirmed. Others do not want to hand over a number, and that is fine — the platform works fully without it. Optional profession verification works the same way: a further layer of confidence against catfishing and romance scams, because someone inventing a job usually cannot verify one. It is never a quality or class filter.",
    points: [
      {
        title: "Never required",
        body: "Your account is fully functional on phone and liveness alone.",
      },
      {
        title: "Never displayed",
        body: "The number is used once and never shown to another member.",
      },
      {
        title: "Visible as a second ring",
        body: "Other members see the extra ring on your seal, not the data behind it.",
      },
    ],
    tone: "paper",
  },
  {
    kicker: "Date commitment",
    title: "A mutual stake, framed as a promise.",
    lede: "The coin deposit is a safety feature as much as a scheduling one: nobody travels across Lagos on the strength of a maybe, and nobody is punished for a change of plan they communicated.",
    points: [
      {
        title: "Both stake, or no date",
        body: "The commitment is symmetrical. One person is never the only one with something at risk.",
      },
      {
        title: "Notice costs nothing",
        body: "Cancel in time and everything is returned, no record against you.",
      },
      // CORRECTED. The prototype's third point was "No-shows fund a charity —
      // Chosen by the person who was stood up. Toastly keeps nothing." The
      // charity mechanic is rejected (PRD §5.5). "Toastly keeps nothing" is
      // still true under the ratified rule and is kept; the destination is
      // not stated, because the stake credit does not ship until Prompt 7.
      {
        title: "Toastly keeps nothing",
        body: "A stake is held, never taken as revenue. The only way one doesn't come back is a genuine no-show.",
      },
    ],
    tone: "light",
  },
  {
    kicker: "If something goes wrong",
    title: "Reporting that reaches a person.",
    lede: "Every screen has a report action, including inside a Gist session. Reports are triaged by severity, and anything involving money, coercion or threats jumps the queue.",
    points: [
      {
        title: "24-hour human review",
        body: "Not a bot, not a form letter. A reviewer in Lagos with the account history in front of them.",
      },
      {
        title: "Block is permanent",
        body: "One account per person means a blocked member cannot return as somebody new.",
      },
      {
        title: "Zero tolerance on fraud",
        body: "Any request for money, any scam script, and the account is gone — first offence.",
      },
    ],
    tone: "dark",
  },
  {
    kicker: "Privacy controls",
    title: "You choose what is on show.",
    lede: "Religion, tribe and language are yours to display or hide. Location can be blurred to a district. Your profile can be paused without losing your verification.",
    points: [
      {
        title: "Non-religious platform",
        body: "Faith is never used to filter or rank anybody's matches.",
      },
      {
        title: "Location, softened",
        body: "Show your city, or your district — never your street.",
      },
      {
        title: "Pause, don't delete",
        body: "Step away for a month and keep your seal for when you come back.",
      },
    ],
    tone: "paper",
  },
];

export const quotes = [
  {
    quote:
      "The first thing I noticed was that I wasn't reverse-image-searching anybody. That's a whole kind of tiredness I didn't know I had.",
    name: "Amaka U.",
    meta: "Lagos · verified 2025",
    img: "/img/safety/member-amaka.webp",
    alt: "Amaka smiling outdoors in Lagos at golden hour",
  },
  {
    quote:
      "I got a scam script in my DMs on two other apps in one week. Here, that person never made it past the front door.",
    name: "Kelechi N.",
    meta: "Abuja · verified 2025",
    img: "/img/safety/member-kelechi.webp",
    alt: "Kelechi smiling outdoors on an Abuja street at golden hour",
  },
  {
    quote:
      "Both of us put coins down. He came early. I think that told me more than the three weeks before it.",
    name: "Zainab A.",
    meta: "Ibadan · verified 2026",
    img: "/img/safety/member-zainab.webp",
    alt: "Zainab in a green headwrap, seated outdoors at golden hour in Ibadan",
  },
];

export const faqs: [string, string][] = [
  [
    "How does verification actually work?",
    "You confirm a phone number, then record a three-second liveness capture — a small head turn. It is matched against the photos on your profile by an automated check, with a human review on anything borderline. Your profile stays invisible until it passes.",
  ],
  [
    "What happens when someone is reported?",
    "Reports on verified accounts reach a human reviewer in Lagos within 24 hours. Because verification is one-account-per-person, a removal is permanent — they cannot come back under a new name.",
  ],
  [
    "How are coin deposits handled?",
    // REWRITTEN. The prototype ended: "Only a genuine no-show forfeits, and
    // that amount goes to a charity the other person chooses." Charity is
    // rejected (PRD §5.5), and "forfeits" is the punitive framing CLAUDE.md
    // rules out for coin copy.
    "Held, not spent. Both stakes are released when the date is confirmed as happened, or when either person cancels with notice. The only way a stake doesn't come back is a genuine no-show.",
  ],
  [
    "Is my NIN or BVN visible to anyone?",
    "No. It is used once to confirm your identity and is never displayed, shared or sold. Other members only see that a second ring is on your seal.",
  ],
  [
    "Can I hide my religion, tribe or language?",
    "Yes, any of them, with one toggle, at any time. They are display fields only and are never used to filter matching.",
  ],
];

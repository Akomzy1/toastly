/**
 * Diaspora content, transcribed from design/prototype/diaspora.slim.html.
 *
 * Both matching pools stay named and visible — "back home" and
 * diaspora-to-diaspora (SKILL.md). Neither may be collapsed into the other.
 */

export const pools = [
  {
    tag: "Use case one",
    title: "Match back home",
    img: "/img/diaspora/diaspora-back-home.webp",
    alt: "A woman laughing during an evening video call at her desk, city lights behind her",
    body: "Match with verified singles in Lagos, Abuja, Port Harcourt, Ibadan and beyond, from wherever you are.",
    points: [
      "Cultural continuity, and families who already speak the same language.",
      "Gist sessions scheduled across the time difference for you.",
      "Room for whatever comes next — relocation, dual life, or visits.",
    ],
  },
  {
    tag: "Use case two",
    title: "Match within your diaspora",
    img: "/img/diaspora/diaspora-community.webp",
    alt: "A man and woman laughing together on a sofa at home, city skyline through the window",
    body: "Match with other Nigerians in your own country — two people in the UK, the US or Canada, same city if you like.",
    points: [
      "Shared experience of being Nigerian somewhere else.",
      "Same time zone, so a Gist fits into a normal evening.",
      "Meeting in person is a train ride, not a visa application.",
    ],
  },
];

export const steps = [
  {
    n: "1",
    title: "Verify your identity",
    body: "Phone and selfie liveness, with NIN, BVN or passport as the optional second ring.",
  },
  {
    n: "2",
    title: "Set your match pool",
    body: "Back home, your diaspora community, or both at once. Change it any time in settings.",
  },
  {
    n: "3",
    title: "Start gisting",
    body: "Structured voice sessions scheduled around the time difference, with flexible rescheduling.",
  },
];

export type DiasporaBlock = {
  kicker: string;
  title: string;
  lede: string;
  href?: string;
  cta?: string;
  img: string;
  alt: string;
  tone: "light" | "paper" | "dark";
};

export const blocks: DiasporaBlock[] = [
  {
    kicker: "Pricing in USD",
    title: "A separate track, not a converted one.",
    lede: "Diaspora membership is billed in USD by card or Apple Pay, from $15 a month with both matching pools included. Coin packs for date commitments are priced in USD too, so nothing is quoted at a rate that moved last week.",
    href: "/pricing",
    cta: "See USD pricing",
    img: "/img/diaspora/diaspora-usd.webp",
    alt: "Four friends talking over coffee around a kitchen island in a flat abroad",
    tone: "light",
  },
  {
    kicker: "Time zone smart",
    title: "Scheduling that does the maths.",
    lede: "Gist sessions are offered at times that are reasonable at both ends — not 3am in Lagos because it suited Houston. Your match sees your local time, you see theirs, and the app suggests the overlap.",
    // The prototype points this block at "assets/img/diaspora-timezone.jpeg",
    // which is not in its own bundle — a broken reference, so there is no
    // approved time-zone image to use. Substituted with the other photograph
    // the page ships. FLAGGED: this is a stand-in, not a design decision.
    img: "/img/diaspora/home-feature-section-15.webp",
    alt: "A man checking his phone by a window at dusk, city lights below",
    tone: "paper",
  },
  {
    kicker: "Cultural bridge",
    title: "Language and tribe, if they matter to you.",
    lede: "A lot of diaspora members want somebody who understands the double life — the Nigerian house and the country outside it. Language and tribe are display fields you can show; they are never used to filter anybody's matches.",
    href: "/features",
    cta: "How profiles work",
    img: "/img/diaspora/diaspora-language-tribe.webp",
    alt: "Three generations of a family laughing around a shared evening meal in a flat abroad",
    tone: "light",
  },
  {
    kicker: "AriyaPlanner abroad",
    title: "A Nigerian wedding, in Houston or Hackney.",
    lede: "Whether you matched back home or in your own city, AriyaPlanner handles introduction ceremonies, traditional weddings and white weddings abroad — vendor shortlists by city, budgets in USD, and family on two continents kept in the loop.",
    href: "/how-it-works",
    cta: "Meet AriyaPlanner",
    img: "/img/diaspora/diaspora-ariya.webp",
    alt: "Guests in aso ebi and gele at an outdoor wedding reception under string lights",
    tone: "dark",
  },
];

export const testimonials = [
  {
    pool: "Back home",
    quote:
      "I was in Maryland, she was in Surulere. Nine Gist sessions before I flew home to meet her family.",
    name: "Chidi & Ngozi",
    meta: "Maryland, US · engaged 2026",
    img: "/img/diaspora/couple-chidi-ngozi.webp",
    alt: "Chidi and Ngozi sitting together at home, smiling at the camera",
  },
  {
    pool: "Diaspora to diaspora",
    quote:
      "Both of us in London, both of us tired of explaining ourselves. Traditional wedding is in May.",
    name: "Bola & Tunde",
    meta: "London, UK · planning",
    img: "/img/diaspora/couple-bola-tunde.webp",
    alt: "Bola and Tunde laughing together on a London street",
  },
  {
    pool: "Both pools",
    quote:
      "I ran both pools for four months. The person I found was three streets away in Calgary.",
    name: "Ifeanyi O.",
    meta: "Calgary, Canada · dating",
    img: "/img/diaspora/member-ifeanyi.webp",
    alt: "Ifeanyi smiling outdoors on a Calgary street in autumn",
  },
];

/**
 * Home page content, transcribed from
 * design/prototype/home-diaspora-offer.slim.html (which replaced
 * home.slim.html).
 *
 * Copy is the prototype's, not paraphrased. Where it contradicts PRD.md or
 * CLAUDE.md the PRD wording ships instead; each case is marked CORRECTED.
 */

export const heroStats = [
  { label: "Verified members", value: "42,180" },
  { label: "Gist sessions this week", value: "9,340" },
  { label: "Couples in Couple Mode", value: "1,206" },
];

export const verifySteps = [
  {
    n: "01",
    title: "Phone, once",
    body: "One number, one account. No burner numbers, no second profile.",
  },
  {
    n: "02",
    title: "Selfie liveness",
    body: "A three-second head turn proves you are a living person, not a saved photo.",
  },
  {
    n: "03",
    title: "NIN or BVN, optional",
    body: "Adds a second ring to your seal. Never required, never shown to other members.",
  },
];

/** The two tiles under the Verified Real photo. */
export const verifyStats = [
  { value: "100%", label: "of live profiles verified" },
  { value: "0", label: "imported or bought accounts" },
];

export const gistPrompts = [
  { n: "01", text: "What's a thing your family does that you'll definitely carry into your own home?" },
  { n: "02", text: "Lagos or somewhere quieter — where do you see yourself in five years?" },
  { n: "03", text: "What does being taken care of look like to you?" },
];

export const coinCards = [
  {
    stat: "₦500",
    title: "The usual stake",
    body: "Small enough that nobody is risking rent, big enough to mean something.",
  },
  {
    stat: "Both",
    title: "Nobody stakes alone",
    body: "The date is only confirmed once you have both put your coins down.",
  },
  {
    stat: "0",
    title: "Penalty for saying so",
    body: "Cancel with notice and you get everything back. Life happens in Lagos traffic.",
  },
];

/**
 * The callout under the coin cards.
 *
 * CORRECTED. The prototype reads: "If someone genuinely no-shows, their coins
 * go to a charity the other person picks. Toastly keeps nothing." The charity
 * mechanic was never ratified and is rejected (PRD §5.5, CLAUDE.md). The
 * decided rule: the absent member's stake moves to the coin balance of the
 * member who showed up, and Toastly keeps none of it (live since 0023). The
 * last sentence is PRD §5.5's override — a safety cancellation always returns
 * the stake — so the line can never read as pressure to meet.
 */
export const coinNote = {
  lead: "If someone genuinely no-shows, their coins go to ",
  emphasis: "the person who showed up",
  rest: ". Toastly keeps nothing — and if you cancel because you feel unsafe, yours always come back.",
};

/**
 * "AI, on your side" — new in home-diaspora-offer.
 *
 * Title is PRD §5.9's public pledge, verbatim. CORRECTED body: the prototype
 * reads "It handles the admin and the safety checks." No Toastly AI runs a
 * safety check today — the Trust Sentinel agent is Phase 2 and even then
 * scores for a person to decide (PRD §5.1.1, §5.9 rule 5) — the same reason
 * the privacy policy holds its "AI safety-review summaries" line. The two
 * agents that do ship are named instead: Toastly Help (verification and
 * payment questions) and Answer Mirror (feedback on your own answers).
 */
export const aiPledge = {
  eyebrow: "AI, on your side",
  title: "Toastly AI will never write a word for you.",
  body: "It helps with the admin — verification and payment questions, feedback on your own answers. The talking is always yours.",
};

export const steps = [
  {
    n: "1",
    title: "Get verified",
    body: "Phone and selfie liveness, about four minutes. Your seal goes live before your profile does.",
    img: "/img/home/verify-selfie.webp",
    alt: "Woman holding her phone up for a selfie liveness check at home",
  },
  {
    n: "2",
    title: "Match intentionally",
    body: "Six people a day, chosen from prompt answers rather than a deck of photos.",
    img: "/img/home/match-rooftop.webp",
    alt: "Man reading his daily matches on his phone at a rooftop café at sunset",
  },
  {
    n: "3",
    title: "Start gisting",
    body: "Book a guided voice session. Three of them tells you more than a month of texting.",
    img: "/img/home/gist-call.webp",
    alt: "Woman laughing during a voice call on a rooftop terrace at sunset",
  },
];

export const promptCards = [
  {
    name: "Adaeze, 26",
    meta: "Lekki, Lagos · Verified Real",
    img: "/img/home/home-testimonial-section-0.webp",
    prompt: "Sunday looks like",
    answer: "Church, then jollof at my mum's, then absolutely nothing until Monday.",
    // Prototype alt read "Placeholder portrait: Toastly member in Lagos" —
    // scaffolding text, not alt copy. Rewritten to describe the image.
    alt: "Portrait: Adaeze, a Toastly member in Lekki, Lagos",
  },
  {
    name: "Tobi, 29",
    meta: "Wuse, Abuja · Verified Real",
    img: "/img/home/member-tobi.webp",
    prompt: "I'm looking for",
    answer: "Someone who wants a marriage, not a situationship with better lighting.",
    alt: "Portrait: Tobi, a Toastly member in Abuja, outdoors at golden hour",
  },
  {
    name: "Ifeoma, 24",
    meta: "Port Harcourt · Verified Real",
    img: "/img/home/member-ifeoma.webp",
    prompt: "My love language",
    answer: "Showing up. On time. With small chops nobody asked for.",
    alt: "Portrait: Ifeoma, a Toastly member in Port Harcourt, outdoors at golden hour",
  },
];

export const profileChips = [
  "Yoruba",
  "Igbo · conversational",
  "English",
  "Christian · non-practising",
  "Lagos born",
  "Wants children",
];

export const pwaStats = [
  { value: "4MB", label: "Install size, smaller than one voice note album" },
  { value: "3G", label: "Fully usable on a slow connection" },
  { value: "-74%", label: "Less data per Gist than a standard voice call" },
  { value: "0", label: "App store accounts required" },
];

export const journey = [
  {
    n: "01",
    title: "Match",
    body: "A verified person whose intentions are written down where you can read them.",
  },
  {
    n: "02",
    title: "Gist",
    body: "Guided voice sessions, then video when you both want it. Chemistry before logistics.",
  },
  {
    n: "03",
    title: "Couple Mode",
    body: "A shared, private space for two: milestones, plans, and the conversations that matter.",
  },
  {
    n: "04",
    title: "AriyaPlanner",
    body: "Introduction ceremony, traditional wedding, white wedding — handed over, budget and all.",
  },
];

export const testimonials = [
  {
    quote:
      "I had deleted three apps before this. The difference is everybody here says what they actually want.",
    name: "Chiamaka & Emeka",
    meta: "LAGOS · MARRIED APRIL 2025",
    img: "/img/home/couple-chiamaka-emeka-2.webp",
    alt: "Portrait: Chiamaka and Emeka, married Toastly couple in Lagos",
  },
  {
    quote:
      "We gisted for three weeks before we met. By the time I saw him I already knew his voice.",
    name: "Halima & Yusuf",
    meta: "ABUJA · ENGAGED 2026",
    img: "/img/home/couple-halima-yusuf-2.webp",
    alt: "Portrait: Halima and Yusuf, engaged Toastly couple in Abuja",
  },
  {
    quote:
      "I'm in Manchester, she was in Ibadan. The scheduling did the hard part; AriyaPlanner did the rest.",
    name: "Seyi & Damilola",
    meta: "MANCHESTER · WEDDING JULY",
    img: "/img/home/couple-seyi-damilola-2.webp",
    alt: "Portrait: Seyi and Damilola, diaspora Toastly couple on a UK street",
  },
];

export const posts = [
  {
    cat: "Safety",
    read: "6 min",
    title: "How to spot a catfish before you gist",
    img: "/img/home/blog-catfish.webp",
    alt: "A phone lying face-down on a dark wooden table in a shaft of light",
    dek: "The seven tells that come up again and again in reports our team reviews.",
  },
  {
    cat: "Culture",
    read: "11 min",
    title:
      "The Nigerian dating culture guide: from introduction to white wedding",
    img: "/img/home/blog-culture-guide.webp",
    alt: "Traditional Nigerian wedding textiles, gele and gold jewellery laid out",
    dek: "Who pays for what, who is asked first, and what actually happens on the day.",
  },
  {
    cat: "Product",
    read: "8 min",
    title: "Why we built a marriage-track dating app",
    img: "/img/home/blog-marriage-track.webp",
    alt: "Overhead view of two coffees and two people's hands across a wooden table",
    dek: "Nigerian Gen Z are not short of matches. They are short of intent.",
  },
];

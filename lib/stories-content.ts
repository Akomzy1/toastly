/**
 * Stories content, transcribed from design/prototype/stories.slim.html.
 *
 * Shape note that matters here: the gallery is 16px rounded rectangles, not
 * circles. The prototype writes circles as `999px` and uses them only for
 * small person avatars (44-52px); a 1:1 story tile is a rounded rect and
 * must never be circle-cropped (SKILL.md).
 */

export const featured = [
  {
    meta: "Lagos · married April 2025",
    quote:
      "I had deleted three apps before this. The difference is everybody here says what they actually want.",
    name: "Chiamaka & Emeka",
    img: "/img/stories/couple-chiamaka-emeka-2.webp",
    alt: "Chiamaka and Emeka smiling together outdoors at golden hour in Lagos",
  },
  {
    meta: "Abuja · engaged 2026",
    quote:
      "We gisted for three weeks before we met. By the time I saw him I already knew his voice.",
    name: "Halima & Yusuf",
    img: "/img/stories/couple-halima-yusuf-2.webp",
    alt: "Halima and Yusuf sitting together in a garden courtyard in Abuja at golden hour",
  },
  {
    meta: "Port Harcourt · introduction done",
    quote:
      "The coins made us both serious about a Tuesday evening. That Tuesday turned into all of this.",
    name: "Ifeoma & Dapo",
    img: "/img/stories/couple-ifeoma-dapo.webp",
    alt: "Ifeoma and Dapo laughing together outdoors in Port Harcourt at golden hour",
  },
  {
    meta: "Manchester · wedding in July",
    quote:
      "She was in Ibadan, I was in Manchester. AriyaPlanner is planning the traditional wedding for both families.",
    name: "Seyi & Damilola",
    img: "/img/stories/couple-seyi-damilola-2.webp",
    alt: "Seyi and Damilola embracing on an autumn street in Manchester",
  },
];

export const spotlights = [
  {
    tag: "Verified Real",
    title: "The profile that never appeared",
    body: "A member in Lekki was contacted on another platform by an account using her photos. On Toastly, the same person tried to register twice and failed liveness both times — the profile never went live, and nobody had to be warned about it afterwards.",
    who: "Reported by our trust team, Lagos",
  },
  {
    tag: "Prompt matching",
    title: "Six a day was the whole point",
    body: "“I used to swipe for forty minutes and remember nobody. Six people, with actual answers to read, and I remembered all of them. I replied to one thing he wrote about his mother's shop.”",
    who: "Tolu, 27 · Yaba, Lagos",
  },
  {
    tag: "Gist",
    title: "Three sessions, then a date",
    body: "“By the third Gist we had argued about Burna Boy and agreed about children. Meeting him was almost a formality — the nerves were gone before the restaurant.”",
    who: "Blessing, 25 · Abuja",
  },
  {
    tag: "Coin deposit",
    title: "The date that actually happened",
    body: "“Two people had cancelled on me that month. When we both staked coins, I knew he was coming. He was there before me.”",
    who: "Amaka, 28 · Surulere, Lagos",
  },
  {
    tag: "Couple Mode & AriyaPlanner",
    title: "From a shared timeline to a guest list",
    body: "“Couple Mode had our milestones in it — meeting families, the introduction. When we tapped the handoff, AriyaPlanner already knew both cities and both families.”",
    who: "Kunle & Fatima · Ibadan",
  },
  {
    tag: "Data-light PWA",
    title: "A 2019 Tecno in Ibadan",
    body: "“I could not download another app; my phone had no space and my data is measured. Toastly installed from the browser and it has never once cost me a full gigabyte.”",
    who: "Segun, 24 · Ibadan",
  },
];

export const reviews = [
  {
    stars: 5,
    text: "Verification took four minutes and I have not met a single fake profile since. That is genuinely all I wanted.",
    who: "Ada, Lagos · Premium",
  },
  {
    stars: 5,
    text: "The Gist prompts saved me from my own small talk. I am not good at openings.",
    who: "Musa, Abuja · Starter",
  },
  {
    stars: 4,
    text: "Wish the daily feed was eight instead of six, but I understand why it isn't.",
    who: "Kemi, Port Harcourt · Premium",
  },
  {
    stars: 5,
    text: "As a diaspora member the USD pricing and time-zone scheduling made it usable. Nothing else was.",
    who: "Uche, Houston · Diaspora Plus",
  },
  {
    stars: 5,
    text: "I showed my mother the tribe and language fields and she relaxed. They are not filters, and I explained that too.",
    who: "Ngozi, Enugu · Premium",
  },
  {
    stars: 5,
    text: "Couple Mode pausing both profiles at once is the most respectful thing I have seen an app do.",
    who: "Femi, Ibadan · Premium Plus",
  },
];

export const gallery = [
  {
    img: "/img/stories/gallery-introduction-ibadan.webp",
    caption: "Introduction ceremony · Ibadan",
    alt: "Both families seated together in aso ebi at an introduction ceremony",
  },
  {
    img: "/img/stories/gallery-couple-mode-lagos.webp",
    caption: "Couple Mode, month three · Lagos",
    alt: "A couple on a sofa at home looking through a photo album together",
  },
  {
    img: "/img/stories/gallery-first-date-abuja.webp",
    caption: "First date, second attempt · Abuja",
    alt: "Two people laughing over drinks on a sofa in a warm-lit bar",
  },
  {
    img: "/img/stories/gallery-planning-croydon.webp",
    caption: "Traditional wedding planning · Croydon",
    alt: "A family around a table choosing aso ebi fabrics and colour swatches",
  },
  {
    img: "/img/stories/gallery-engagement-ph.webp",
    caption: "Engagement announced · Port Harcourt",
    alt: "A woman walking a busy street at golden hour, smiling at her ring",
  },
  {
    img: "/img/stories/gallery-white-wedding-lekki.webp",
    caption: "White wedding · Lekki",
    alt: "Bride and groom dancing among guests at an outdoor evening reception under string lights",
  },
];

export const stats = [
  {
    value: "42,180",
    label: "Verified members",
    split: "38,900 Nigeria · 3,280 diaspora",
  },
  { value: "126,400", label: "Matches made", split: "Since launch" },
  {
    value: "8,600",
    label: "Dates committed with coins",
    split: "94% both showed up",
  },
  {
    value: "1,206",
    label: "Couples in Couple Mode",
    split: "Profiles paused together",
  },
  { value: "310", label: "Weddings via AriyaPlanner", split: "48 planned abroad" },
];

export const faqs: [string, string][] = [
  [
    "How do you verify that a story is real?",
    "Every story comes from a verified account, and we confirm the milestone with both people before it is published. Nothing here is written by our marketing team.",
  ],
  [
    "Can I share a story without photos?",
    "Yes. Plenty of members share the words and keep the pictures private. You can also use first names only.",
  ],
  [
    "What if we break up after sharing?",
    "Email us and it comes down the same day, no explanation needed.",
  ],
  [
    "Do you pay members for stories?",
    "No. We do send a small gift to couples whose weddings we cover in full, and we say so on the post.",
  ],
];

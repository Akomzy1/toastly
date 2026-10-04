/**
 * The Toastly privacy policy — the text as supplied, unedited.
 *
 * Anything in [square brackets] is a value still to be confirmed — a date,
 * a retention period, a list of countries. While any remain, PRIVACY_PUBLISHED
 * is false: /privacy returns 404 and the genotype consent step shows no link.
 * Filling in the last one publishes the page with no other change.
 *
 * Every other claim has been checked against the build (October 2026). If
 * the product changes what it collects or keeps, change this text with it.
 *
 * FACT-CHECK — claims added on 3 October 2026, each checked against the build:
 *   - "We don't use your data to train AI models." TRUE today. Toastly trains
 *     no models of its own, and its only AI provider (Anthropic, via the
 *     commercial API) does not train on API inputs or outputs by default.
 *     PHASE 2 WARNING: the Trust Sentinel's scorer is "deterministic rules
 *     plus a classical model" (PRD §5.1.1). A classical model fitted to
 *     member behaviour IS training a model on member data. Before it is
 *     built, either this sentence changes (with notice, section 14) or the
 *     model is fitted on something other than member data.
 *   - Toastly Help sees status codes only (lib/concierge/tools.ts reads
 *     stage, check status and reason codes, plan, coin counts) — never
 *     selfies, ID numbers, chats or Gist data. Enforced by a constraint check.
 *   - Profile feedback "never writes or rewrites anything": the model can
 *     only return one of four fixed labels (lib/answer-mirror.ts). Enforced.
 *   - Toastly Help conversations are deleted after 30 days of quiet
 *     (retention_config, purge_expired_retention in 0018).
 *   - AI never uses genotype, religion, tribe, language, relationship
 *     history, profession or where you live: no agent reads those fields
 *     (constraint check "agents never read protected attributes").
 *
 * HELD from the 3 October drop, because they are not yet true:
 *   - "We also compare it with your main profile photo" (and the matching
 *     section 3 wording). Prompt 14 is blocked: Smile ID cannot compare an
 *     uploaded photo against the enrolled face. Add when a match ships.
 *   - "AI ... safety-review summaries" and the "Safety review" bullet. The
 *     Sentinel reviewer summaries are Phase 2. Add when they ship.
 *   - The drop labelled the ID check "Verified Real (optional)". Verified
 *     Real is the liveness selfie (PRD §5.1 correction); kept as ID check.
 *
 * Section 9's countries were MEASURED, not assumed (2 October 2026): the
 * Supabase database host resolves to AWS eu-west-1 (Ireland), and the
 * x-vercel-id header shows functions running in iad1 (Washington, D.C.). No
 * third-party processor was configured in production at the time. When one
 * is switched on in Vercel, add its country to section 9 before it is.
 *
 * "Within one month", not 30 days: UK GDPR's deadline is one calendar
 * month, which is shorter than 30 days in February.
 */

export const PRIVACY_CONTACT = "support@trytoastly.com";

// The date this version was deployed and published.
export const PRIVACY_EFFECTIVE_DATE = "4 October 2026";

export type PrivacyBlock =
  | { kind: "p"; lead?: string; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][] };

export type PrivacySection = { id: string; title: string; blocks: PrivacyBlock[] };

export const PRIVACY_INTRO: PrivacyBlock[] = [
  {
    kind: "p",
    text: "Toastly is a dating-to-marriage platform for Nigerians at home and abroad. This policy explains what we collect, why, who we share it with, and the choices you have. We've written it to be read, not skimmed past.",
  },
  {
    kind: "p",
    lead: "Who we are.",
    text: "Toastly is operated by Ariya Planner Ltd, a company registered in Nigeria (RC 9662424). We are the data controller for your personal data.",
  },
  {
    kind: "p",
    lead: "Contact us about your data:",
    text: `${PRIVACY_CONTACT} — for questions, requests to see or delete your data, or complaints.`,
  },
];

export const PRIVACY_SECTIONS: PrivacySection[] = [
  {
    id: "short-version",
    title: "1. The short version",
    blocks: [
      {
        kind: "ul",
        items: [
          "You must be 18 or over to use Toastly.",
          "We collect what we need to verify you're real, match you, keep you safe and run your subscription.",
          "Optional details stay optional. Religion, tribe, language, relationship history, profession, education and genotype never decide who you're matched with unless you choose a filter for your own search — and genotype can't be filtered on at all.",
          "Your genotype is health information. It's private by default, shared only with people you choose, and never used by our analytics, AI systems or safety screening.",
          "We don't record your Gist calls, and we never keep transcripts.",
          "We don't store your NIN or BVN, or the official record behind it. When you verify, we keep only the result — plus, for the ID check, a scrambled code so the same ID can't verify two accounts.",
          "We don't sell your personal data.",
          "You can see, correct, download or delete your data at any time.",
        ],
      },
    ],
  },
  {
    id: "what-we-collect",
    title: "2. What we collect",
    blocks: [
      {
        kind: "p",
        lead: "Account details.",
        text: "Name, email address, phone number, date of birth, and the password or sign-in method you use.",
      },
      {
        kind: "p",
        lead: "Your profile.",
        text: "Photos, written answers to profile prompts, the kind of relationship you're looking for, and your city or, if you live abroad, your diaspora city and which matching pool you prefer.",
      },
      {
        kind: "p",
        lead: "Optional profile details.",
        text: "Religion, tribe or ethnicity, languages, relationship history (single, divorced, widowed, single parent, whether you have children), profession and education. You decide whether to add these and who can see them.",
      },
      {
        kind: "p",
        lead: "Your genotype (optional — health information).",
        text: "If you choose to add it, after giving separate permission. See section 5.",
      },
      { kind: "p", lead: "Verification.", text: "" },
      {
        kind: "ul",
        items: [
          "Verified Real (everyone): a check of your phone number, and a selfie liveness capture showing you're a real person present at your phone. To run it, our verification provider receives the selfie, your name and your email address. We keep only the result — whether it passed, and the date.",
          "ID check (optional): your NIN, Virtual NIN or BVN, checked by our verification provider against the official record and matched to a new selfie. We keep only the outcome — whether it passed, and the date. We do not store your number, or the name, date of birth, photo, phone number or address held on the official record. We do keep a scrambled code made from your number — a one-way code that can't be turned back into it — so the same ID can't verify two accounts.",
        ],
      },
      {
        kind: "p",
        lead: "Gist sessions.",
        text: "We record that a session took place, when it started and ended, and each person's private answer to whether they'd like to continue. We do not record the audio or video, and no transcript is ever created or kept.",
      },
      {
        kind: "p",
        lead: "Messages.",
        text: "The messages you send and receive, stored so they can be delivered and so you can read your conversations.",
      },
      {
        kind: "p",
        lead: "Dates and coins.",
        text: "Dates you arrange, venues you accept, check-ins, your coin balance and its history, coin deposits, and whether a date went ahead.",
      },
      {
        kind: "p",
        lead: "Location.",
        text: "Your city and time zone. When we suggest a public venue for a date, we search near your city. When you check in at a date, we confirm you're near the venue at that moment and keep only the result, not your location. We don't track your location. If you use the panic button, your phone adds your exact location to the message it sends your chosen contact — that message goes from your own phone, and Toastly never receives your location.",
      },
      {
        kind: "p",
        lead: "Your emergency contact.",
        text: "If you add one, we hold their name and phone number (see section 6).",
      },
      {
        kind: "p",
        lead: "Payments.",
        text: "Your subscription and coin purchases. Card and bank details are handled by our payment providers — we never see or store your full card number. We keep the country your card was issued in and the country you paid from (never your IP address), to keep pricing fair.",
      },
      {
        kind: "p",
        lead: "Safety information.",
        text: "Reports you make or receive, blocks, and patterns of activity we use to spot scams and fake accounts (see section 7).",
      },
      {
        kind: "p",
        lead: "Toastly Help.",
        text: "If you use our AI help assistant, the questions you ask, its replies, and anything you choose to pass to our team (see section 6a).",
      },
      {
        kind: "p",
        lead: "Usage events.",
        text: "A small set of product events — that you signed up, completed verification, had your first Gist, made your first payment or upgraded — so we can understand how Toastly is used. Our hosting provider also keeps standard technical logs, such as IP address and browser type, to run and secure the service.",
      },
    ],
  },
  {
    id: "why-we-use-it",
    title: "3. Why we use it, and our legal basis",
    blocks: [
      {
        kind: "table",
        head: ["What we do", "Why", "Legal basis"],
        rows: [
          ["Create and run your account; match you; deliver messages and Gist sessions", "To provide the service you signed up for", "Contract"],
          ["Verify you're a real person, and optionally your NIN/BVN", "To keep fake and scam accounts off Toastly", "Your explicit consent (this involves biometric data)"],
          ["Answer your questions through our AI help assistant, and give optional feedback on your profile answers", "To help you use Toastly", "Contract; legitimate interest"],
          ["Store and share your genotype", "Only to show it to the people you choose", "Your explicit consent"],
          ["Show optional profile details", "Because you chose to add them", "Your consent"],
          ["Detect scams, fake accounts and abuse; act on reports", "To keep members safe", "Legitimate interest; legal obligation where applicable"],
          ["Process payments and keep financial records", "To run subscriptions and coins, and meet tax law", "Contract; legal obligation"],
          ["Send emergency alerts and confirm emergency contacts", "To support your safety", "Your consent; vital interests in an emergency"],
          ["Send account emails, such as receipts and security notices", "To run your account", "Contract"],
          ["Understand how Toastly is used and fix problems", "To improve the service", "Legitimate interest"],
        ],
      },
      {
        kind: "p",
        text: "Where we rely on consent, you can withdraw it at any time in your settings, without affecting anything we did before.",
      },
    ],
  },
  {
    id: "who-can-see-it",
    title: "4. Who can see your information",
    blocks: [
      {
        kind: "p",
        lead: "Other members",
        text: "see what's on your profile, according to the visibility settings you choose. Relationship history is hidden until you match unless you choose otherwise. Genotype is hidden from everyone unless you choose to share it.",
      },
      {
        kind: "p",
        lead: "Our team",
        text: "sees account and safety information only when needed to support you, investigate a report or keep Toastly safe. A report includes the category you choose and anything you write in it. Our safety team does not read your messages.",
      },
      {
        kind: "p",
        lead: "Service providers",
        text: "who process data on our behalf, under contract, only for the purposes we set:",
      },
      {
        kind: "table",
        head: ["Provider", "What for"],
        rows: [
          ["Supabase", "Database, storage, and sign-in and confirmation emails"],
          ["Vercel", "Hosting the app and website"],
          ["Smile ID", "Liveness checks and NIN/BVN verification"],
          ["Paystack", "Payments in Naira"],
          ["Stripe", "Payments in US dollars"],
          ["LiveKit", "Delivering Gist voice and video sessions (not recorded)"],
          ["Resend", "Account emails, such as receipts and security notices"],
          ["Termii", "Text messages to Nigerian numbers (emergency contacts and alerts)"],
          ["Twilio", "Text messages to numbers outside Nigeria (emergency contacts and alerts)"],
          ["Google (Places)", "Suggesting public venues for dates"],
          ["PostHog", "Product analytics (never receives your genotype)"],
          ["Anthropic", "AI for our help assistant and profile-answer feedback — never your messages, Gist audio, photos, ID numbers or genotype"],
        ],
      },
      {
        kind: "p",
        lead: "AriyaPlanner.",
        text: "AriyaPlanner is a wedding and event-planning service also run by Ariya Planner Ltd. If you and your partner choose to move from Toastly into planning your wedding with AriyaPlanner, we'll pass across only what you agree to share at that moment. Your genotype is never included.",
      },
      {
        kind: "p",
        lead: "Authorities.",
        text: "We'll share information where the law requires it, or where it's necessary to protect someone's life or safety.",
      },
      {
        kind: "p",
        text: "We do not sell your personal data, and we do not share it with advertisers.",
      },
    ],
  },
  {
    id: "genotype",
    title: "5. Your genotype",
    blocks: [
      { kind: "p", text: "Your genotype is health information, so it has its own rules:" },
      {
        kind: "ul",
        items: [
          "You give separate, explicit permission before adding it. It's optional, and leaving it blank never affects who you're matched with.",
          "Only you can see it until you choose to share it — with your matches, only after a Gist you both continue, or only with your partner in Couple Mode. You'll only see someone else's genotype if you've both chosen to share with each other.",
          "We never use it to choose or rank your matches, never tell anyone whether a pair is \"compatible\", never mark it as verified, and never pass it to our analytics, to any AI system, to our safety screening, or to AriyaPlanner.",
          "It's what you tell us — we don't check it.",
          "It's stored encrypted, and only you and the people you've chosen can read it.",
          "Deleting it removes it from Toastly straight away, together with your permission. Encrypted backup copies are overwritten within 7 days.",
        ],
      },
    ],
  },
  {
    id: "emergency-contacts",
    title: "6. Emergency contacts",
    blocks: [
      {
        kind: "p",
        text: "If you add an emergency contact, we hold their name and phone number. We send them one text message to confirm they've agreed to be your contact, and after that we only contact them if you trigger a safety alert. Your emergency contact never gets access to your Toastly account, matches or messages. Please only add someone who's happy to be your contact. You can remove them at any time.",
      },
    ],
  },
  {
    id: "how-we-use-ai",
    title: "6a. How we use AI",
    blocks: [
      { kind: "p", text: "We use AI in a few limited places, and we'll always tell you when you're dealing with it." },
      {
        kind: "ul",
        items: [
          "Toastly Help, our AI assistant, answers questions about verification, payments and how Toastly works. It sees only things like whether a check passed — never your selfies, ID number, messages or Gist sessions. A person handles refunds, disputes and appeals.",
          "Profile feedback, if you ask for it, tells you whether a prompt answer could be more specific. It never writes or rewrites anything for you. Toastly AI will never write a word for you.",
        ],
      },
      {
        kind: "p",
        text: "Our AI never reads your private messages, never listens to Gist sessions, and never uses your genotype, religion, tribe, language, relationship history, profession or where you live. We don't use your data to train AI models.",
      },
    ],
  },
  {
    id: "keeping-safe",
    title: "7. Keeping Toastly safe",
    blocks: [
      {
        kind: "p",
        text: "To spot scams and fake accounts, we look at patterns of activity — for example, repeatedly declining Gist sessions, unusually fast requests to move a conversation forward, multiple independent reports, or verification that no longer matches.",
      },
      {
        kind: "ul",
        items: [
          "We don't read your messages to do this, and we don't use Gist audio, your genotype, religion, tribe, language, relationship history, profession or diaspora status. To keep pricing fair, we do check whether the country of your payment method, phone number and connection match.",
          "A person reviews every case. Automated tools may flag an account for review; the strongest automatic step is asking you to verify again, and we always tell you why. No account is removed by a machine. You can ask us to look again.",
        ],
      },
    ],
  },
  {
    id: "how-long",
    title: "8. How long we keep it",
    blocks: [
      {
        kind: "ul",
        items: [
          "Your account and profile: while your account is open. When you delete your account in your settings, your data is deleted straight away, except what this section says we keep, and backup copies are overwritten within 7 days.",
          "Genotype: until you delete it or your account, as in section 5.",
          "Verification results, and the scrambled code made from a verified ID number: for as long as your account is open.",
          "Safety records (reports about an account, and their outcome): up to 2 years after the account closes. If an account was removed for breaking our rules, we also keep a scrambled form of its phone number, and of its ID number if it completed the ID check, for that time, so it can't simply sign up again. Its sign-in (email or phone) is kept, blocked, for the same 2 years, then deleted. Every decision by our team about an account is recorded, with the reason category, so it can be checked later.",
          "Toastly Help conversations: 30 days after the last message, then deleted. If you pass something to our team, your words are deleted at the same time; we keep only its reference number and whether it was resolved.",
          "Payment and financial records: 6 years, as tax law requires.",
        ],
      },
    ],
  },
  {
    id: "where-processed",
    title: "9. Where your data is processed",
    blocks: [
      {
        kind: "p",
        text: "We're based in Nigeria and serve members abroad. Our database is hosted in Ireland, in the European Union, and our app runs in the United States; other providers may process your data in further countries. Where data leaves Nigeria or the UK, we rely on appropriate safeguards required by law, such as contractual protections with our providers.",
      },
    ],
  },
  {
    id: "your-rights",
    title: "10. Your rights",
    blocks: [
      { kind: "p", text: "Wherever you live, you can ask us to:" },
      {
        kind: "ul",
        items: [
          "see the personal data we hold about you, and get a copy;",
          "correct anything that's wrong;",
          "delete your data;",
          "download your data in a portable format;",
          "object to or restrict how we use it;",
          "withdraw consent where we rely on it;",
          "review any decision about your account.",
        ],
      },
      {
        kind: "p",
        text: `Many of these you can do directly in your settings. Otherwise, email ${PRIVACY_CONTACT} and we'll respond within one month. We may need to confirm your identity first.`,
      },
      {
        kind: "p",
        text: `If you're unhappy with how we've handled your data, you can complain to the Nigeria Data Protection Commission (NDPC). If you live in the UK, you can contact our UK representative through ${PRIVACY_CONTACT} or complain to the Information Commissioner's Office (ICO). We'd appreciate the chance to put things right first.`,
      },
    ],
  },
  {
    id: "security",
    title: "11. Security",
    blocks: [
      {
        kind: "p",
        text: "We use encryption, access controls and secure providers to protect your data, and we limit who on our team can see it. No system is perfectly secure, so if we ever have a breach that puts you at risk, we'll tell you and the regulator as the law requires.",
      },
    ],
  },
  {
    id: "under-18s",
    title: "12. Under-18s",
    blocks: [
      {
        kind: "p",
        text: "Toastly is only for people aged 18 and over, and we ask for your date of birth when you sign up. If we learn an account belongs to someone under 18, we'll close it and delete their data.",
      },
    ],
  },
  {
    id: "cookies",
    title: "13. Cookies",
    blocks: [
      {
        kind: "p",
        text: "Our website uses only the cookies needed to keep you signed in and keep the service working. We don't use advertising or analytics cookies.",
      },
    ],
  },
  {
    id: "changes",
    title: "14. Changes to this policy",
    blocks: [
      {
        kind: "p",
        text: "If we make a meaningful change, we'll tell you in the app before it takes effect. If a change affects something you consented to — such as your genotype — we'll ask for your permission again.",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Publication gate
// ---------------------------------------------------------------------------

const PLACEHOLDER = /\[[^\]\n]{1,120}\]/g;

function blockText(b: PrivacyBlock): string[] {
  if (b.kind === "p") return [b.lead ?? "", b.text];
  if (b.kind === "ul") return b.items;
  return [...b.head, ...b.rows.flat()];
}

const ALL_TEXT = [
  PRIVACY_EFFECTIVE_DATE,
  ...PRIVACY_INTRO.flatMap(blockText),
  ...PRIVACY_SECTIONS.flatMap((s) => [s.title, ...s.blocks.flatMap(blockText)]),
].join("\n");

/** Values still to be confirmed, e.g. "[DATE]". Empty once the policy is complete. */
export const PRIVACY_PLACEHOLDERS: string[] = Array.from(new Set(ALL_TEXT.match(PLACEHOLDER) ?? []));

/** True only when no placeholder remains. Gates /privacy and every link to it. */
export const PRIVACY_PUBLISHED = PRIVACY_PLACEHOLDERS.length === 0;

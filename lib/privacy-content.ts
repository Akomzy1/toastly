/**
 * The Toastly privacy policy — the text as supplied, unedited.
 *
 * Anything in [square brackets] is a value still to be confirmed — a date,
 * a retention period, a list of countries. While any remain, PRIVACY_PUBLISHED
 * is false: /privacy returns 404 and the genotype consent step shows no link.
 * Filling in the last one publishes the page with no other change.
 *
 * The 4 October claims were checked against the build; the 6 October
 * version adds some that are not yet true (listed below). If the product
 * changes what it collects or keeps, change this text with it.
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
 * 6 OCTOBER 2026 — transcribed from the member-facing Toastly-Privacy-Policy.md
 * (with Toastly-Verification-Consent-Wording.md). That version wins where it
 * differs from the 4 October text. Its bracketed values ([7], [30], [2], [6],
 * the section 9 countries, the UK representative, the cookie choice) are open
 * questions, so this version is withheld until they are settled.
 *
 * Kept from the 4 October text because each is true and the new version does
 * not contradict it: what Smile ID receives (name, email), the panic-button
 * location sentence, card and paying country, Toastly Help conversations
 * and their 30-day retention, hosting logs, the pricing-fairness country
 * check, the removed member's blocked sign-in and the record of decisions.
 *
 * 6 OCTOBER 2026, LATER — made to say exactly what the code does, against
 * port-live-profile (0027–0029, which this text assumes has shipped):
 *   - Section 4: reviewers see the report reason, the reporter's own note
 *     and a COUNT of messages (staff_item, components/staff/case-view.tsx) —
 *     never message text. Was "our safety team can see that message".
 *   - Surname (section 2, and the Anthropic row): sent to Smile ID only, never
 *     kept (scripts/selfie-privacy.test.mjs, privacy-claims.test.mjs, and the
 *     constraint check "the surname goes to Smile ID only").
 *   - Smile ID registers the face under the member's account (the onboarding
 *     Compare enrols it) for later re-checks (sections 2 and 7).
 *   - Photos are stripped of embedded data before storage (lib/strip-image.ts).
 *   - Country of residence vs phone code, paying country and card country
 *     (0027's review signals; section 7). Age range (section 2).
 *   - Removed, not yet true: "safety-review summaries" and the "Safety review"
 *     bullet (Phase 2); "approximate location" for venues (city search);
 *     "device type, app version" (analytics records only lib/analytics.ts's
 *     eight events); "voice answers" (voice notes are out); Resend sending
 *     "verification emails" (Supabase sends sign-in and confirmation mail);
 *     analytics cookies (PostHog runs server-side only; the one non-sign-in
 *     cookie, gists_seen, remembers when the Gists tab was last opened).
 *   - Unspent coins shown before deletion (section 8): true on
 *     port-live-profile (components/account/delete-flow.tsx).
 *
 * THE BRACKETS, settled 6 October 2026 (owner's decisions):
 *   Deletion   "deleted from our live systems straight away, and from backups
 *              within 7 days" — lib/account-actions.ts deletes in the same
 *              request; Supabase Pro keeps daily backups 7 days, PITR off.
 *   [7] [2] [6]  filled from the code: backups 7 days; retain_until now() +
 *              2 years (safety) and + 6 years (payments), 0015/0016/0025.
 *   Countries  section 4's "Where" column, provider by provider, and section 9:
 *     - Supabase Ireland, Vercel US (iad1): measured 2 October 2026.
 *     - PostHog Germany: NEXT_PUBLIC_POSTHOG_HOST is eu.i.posthog.com (AWS
 *       eu-central-1); staff/subprocessor access from outside the EU per its DPA.
 *     - LiveKit (owner, 6 October 2026): "routed through LiveKit's servers
 *       nearest the callers" — unless the owner confirms a pinned region.
 *       No claim about where call records are kept until the project's data
 *       region is checked in LiveKit's dashboard.
 *     - Anthropic: stored in the US; inference may run in any geography. Our
 *       model (claude-haiku-4-5) can't take inference_geo "us" (4.6+ only).
 *     - Twilio US: lib/sms.ts calls api.twilio.com (US1, the default).
 *     - Resend US: account data is stored in the US whatever the sending
 *       region (lib/email.ts).
 *     - Smile ID US (its privacy policy §10.1), Paystack Ireland (its help
 *       centre), Stripe US/EU/India (its privacy policy), Google US.
 *     - Termii: no location published (api.ng.termii.com resolves to Google
 *       Cloud). BRACKETED until Termii replies in writing (owner, 6 October
 *       2026) — so the page stays withheld until then.
 *   Cookie choice  removed: PostHog runs server-side only (lib/analytics.ts);
 *              nothing it does touches cookies or browser storage. The one
 *              non-sign-in cookie is gists_seen; localStorage remembers two
 *              dismissed notices (announce-bar, feed-fallback-notice) — both
 *              disclosed in section 13.
 *   Device, IP, app version  no Sentinel event records any of them
 *              (trust_events.meta holds labels and counts only; payments keep
 *              a country code from x-vercel-ip-country, never the IP). The
 *              hosting-log sentence covers IP and browser type.
 *   STILL OPEN: [UK REPRESENTATIVE] (the owner's), [Termii's processing
 *              location] (Termii's written reply), and [DATE] twice (set on
 *              the day this version is published).
 *
 * 8 OCTOBER 2026 — release-3 (0035–0037), checked against the build:
 *   - Woman or man (0036): asked at sign-up, needed to go live; a man is
 *     matched only with women and a woman only with men. Gender is locked once live; support (and
 *     a reviewer, on a "Not who they say they are" report, 0037) changes it.
 *   - The women's launch offer (0035): launch_offer_grants keeps the phone
 *     number's one-way hash (phone_identities, never the number) after the
 *     account is deleted — profile_id goes to null, the hash stays — so the
 *     offer is once per number. NOTHING PURGES IT YET: its period is
 *     12 months after the account is deleted (owner, 8 October 2026): 0038's
 *     released_at and the nightly purge (retention_config.launch_offer_phone).
 *   - No waitlist: built, then removed the same day (owner, 8 October 2026).
 *   Settled 8 October 2026: the launch-offer retention, 12 months.
 *   SMILE-RETENTION notes sit above each "keeps the images" sentence: if
 *              Smile ID confirms it uses images to improve its technology and
 *              we can't opt out, append "Smile ID may also use them to improve
 *              its own technology." (owner to confirm).
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
          "Optional details stay optional. Religion, denomination, tribe, language, relationship history, profession, education and genotype never decide who you're matched with unless you choose a filter for your own search — and denomination and genotype can't be filtered on at all.",
          "Your genotype is health information. It's private by default, shared only with people you choose, and never used by our analytics, AI systems or safety screening.",
          "We don't record your Gist calls, and we never keep transcripts.",
          "We don't store your NIN or BVN record. When you verify, we keep only the result.",
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
        lead: "Whether you're a woman or a man.",
        text: "We use it to match you: men are matched with women, and women with men. Once your profile is live, it can only be changed through Toastly Help — or by our team, after a review, if a report shows it isn't right.",
      },
      {
        kind: "p",
        lead: "Your profile.",
        text: "Photos, written answers to profile prompts, the kind of relationship you're looking for, the age range you'd like to meet, and where you live: your country and city, and, if you live abroad, which matching pool you prefer. Before we store a photo, we remove the hidden information it carries — such as where and when it was taken, and the device it was taken on.",
      },
      {
        kind: "p",
        lead: "Optional profile details.",
        text: "Religion and denomination, tribe or ethnicity, languages, relationship history (single, divorced, widowed, single parent, whether you have children), profession and education. You decide whether to add these and who can see them.",
      },
      {
        kind: "p",
        lead: "Your religion and denomination (optional — sensitive data).",
        text: "We add them only with your explicit consent, which we record, with the date and the wording you agreed to, the first time you add either. One setting shows or hides both; hiding religion hides denomination. They appear only on your full profile — never on the cards in anyone's daily six — and never decide who sees you. Removing them deletes them; we keep the record of your consent, marked withdrawn with the date, as evidence of what you agreed to and when — and ask again if you add them later.",
      },
      {
        kind: "p",
        lead: "Your filters (paid plans).",
        text: "If you set filters for your own six — religion and tribe — we store them to choose your six. Nobody else can see them, they never change who sees you, and they're deleted with your account. Our analytics hear only that you changed your filters, never which ones.",
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
          // SMILE-RETENTION: if Smile ID confirms it uses images to improve its technology and we can't opt out, append "Smile ID may also use them to improve its own technology."
          "Liveness check (everyone): a selfie and short liveness capture showing you're a real person present at your phone. This earns your Verified Real seal. We also compare it with your main profile photo to confirm your photos are really you. We keep only the result of each check — never your face data. Smile ID, which runs these checks, keeps the images for up to five years under its own terms (see section 8). Smile ID also registers your face against your Toastly account, so that a later selfie — when you change your main photo, or if our team asks you to check again — can be compared with it.",
          "What Smile ID receives: the selfie, your first name, your email address and your surname. You type your surname in only for this check: we pass it to Smile ID and don't keep it. It's never shown on your profile, and never goes to our analytics, our AI systems or AriyaPlanner.",
          "ID check (optional): your NIN, Virtual NIN or BVN, checked by our verification provider against the official record and matched to a new selfie — which is also checked against the face registered when you verified, so the ID is yours. You give the names on your ID for the check; like your surname, we pass them to Smile ID and don't keep them. We keep only the outcome — whether it passed, a reference number and the date — plus a one-way fingerprint of your ID number, so the same ID can't be used on more than one account and removed members can't return. We can't turn the fingerprint back into your number. We do not store the name, date of birth, photo, phone number or address held on the official record.",
        ],
      },
      {
        kind: "p",
        lead: "Gist sessions.",
        text: "We record that a session took place, when, how long it lasted, which questions from the structured question set were covered, and whether you both chose to continue. We do not record the audio or video, and no transcript is ever created or kept.",
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
        text: "Your city and time zone. When we suggest a public venue for a date, we search near your city — we don't use your location for this. When you check in at a date, we confirm you're near the venue at that moment and keep only the result, not your location. We don't track your location continuously. If you use the panic button, your phone adds your exact location to the message it sends your chosen contact — that message goes from your own phone, and Toastly never receives your location.",
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
        lead: "Usage information.",
        text: "Which key steps you've reached — such as signing up, getting verified, a first Gist, a first date deposit or upgrading — and when you use our AI help or profile feedback (never what you asked or wrote), so we can fix problems and improve the product. Our hosting provider also keeps standard technical logs, such as IP address and browser type, to run and secure the service.",
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
          ["Verify you're a real person, that your main photo is you, and optionally your NIN/BVN", "To keep fake and scam accounts off Toastly", "Your explicit consent (this involves biometric data)"],
          ["Answer your questions through our AI help assistant, and give optional feedback on your profile answers", "To help you use Toastly", "Contract; legitimate interest"],
          ["Store and share your genotype", "Only to show it to the people you choose", "Your explicit consent"],
          ["Show optional profile details", "Because you chose to add them", "Your consent"],
          ["Show your religion and denomination", "Because you chose to show them", "Your explicit consent (sensitive data)"],
          ["Detect scams, fake accounts and abuse; act on reports", "To keep members safe", "Legitimate interest; legal obligation where applicable"],
          ["Process payments and keep financial records", "To run subscriptions and coins, and meet tax law", "Contract; legal obligation"],
          ["Send emergency alerts and confirm emergency contacts", "To support your safety", "Your consent; vital interests in an emergency"],
          ["Send account and verification emails", "To run your account", "Contract"],
          ["Give the women's launch offer once per phone number", "To keep the offer fair", "Legitimate interest"],
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
        text: "sees account and safety information only when needed to support you, investigate a report or keep Toastly safe. Our team never sees the text of your messages. If you report someone, the person reviewing it sees the reason you chose, any note you add, and how many messages they sent you — not what the messages said. If you want us to see something they wrote, you can quote it in your note.",
      },
      {
        kind: "p",
        lead: "Service providers",
        text: "who process data on our behalf, under contract, only for the purposes we set:",
      },
      {
        kind: "table",
        head: ["Provider", "What for", "Where"],
        rows: [
          ["Supabase", "Database, storage, and sign-in and confirmation emails", "Ireland (EU)"],
          ["Vercel", "Hosting the app and website", "United States"],
          ["Smile ID", "Liveness checks, the face check on your main photo, and NIN/BVN verification", "United States, and its affiliates or subcontractors in other countries"],
          ["Paystack", "Payments in Naira", "Ireland (EU), and Paystack group companies outside Nigeria"],
          ["Stripe", "Payments in US dollars", "United States, and also the EU and India"],
          ["LiveKit", "Delivering Gist voice and video sessions (not recorded)", "Routed through LiveKit's servers nearest the callers; calls are never recorded"],
          ["Resend", "Receipts and account notices", "United States"],
          ["Termii", "Text messages to Nigerian numbers (emergency contacts and alerts)", "[Termii's processing location — awaiting Termii's written reply]"],
          ["Twilio", "Text messages to numbers outside Nigeria (emergency contacts and alerts)", "United States"],
          ["Google (Places)", "Suggesting public venues for dates", "United States"],
          ["PostHog", "Product analytics (never receives your genotype, religion or denomination)", "Germany (EU); its staff or subcontractors may access it from outside the EU"],
          ["Anthropic", "AI for our help assistant and profile-answer feedback — never your messages, Gist audio, photos, ID numbers, surname or genotype", "Stored in the United States; processing may take place in the US or other countries"],
        ],
      },
      {
        kind: "p",
        lead: "AriyaPlanner.",
        text: "AriyaPlanner is a wedding and event-planning service also run by Ariya Planner Ltd. If you and your partner choose to move from Toastly into planning your wedding with AriyaPlanner, we'll pass across only what you agree to share at that moment. Your genotype, religion and denomination are never included.",
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
        text: "Our AI never reads your private messages, never listens to Gist sessions, and never uses your genotype, religion, denomination, tribe, language, relationship history, profession or where you live. We don't use your data to train AI models.",
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
          "We don't read your messages to do this, and we don't use Gist audio, your genotype, religion, denomination, tribe, language, relationship history, profession or where you live.",
          "To keep pricing fair, we check whether the country you tell us you live in matches your phone number's country code, the country you pay from and the country your card was issued in. A mismatch is looked at by a person; it never blocks you on its own.",
          "If our team asks you to check again, you take a fresh selfie, which Smile ID compares with the face registered when you verified.",
          "A person makes every decision. Automated tools may flag an account for review, but no account is restricted or removed by a machine alone. If we restrict your account, we'll tell you why, and you can ask us to look again.",
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
          "Your account and profile: while your account is open. When you delete your account, it's deleted from our live systems straight away, and from backups within 7 days — except the records below that we have to keep.",
          "Genotype: until you delete it or your account, as in section 5.",
          "Verification results: for as long as your account is open.",
          // SMILE-RETENTION: if Smile ID confirms it uses images to improve its technology and we can't opt out, append "Smile ID may also use them to improve its own technology."
          "Images held by Smile ID: Smile ID keeps the selfie and photo images from verification checks for up to five years, under its own terms. Toastly never holds them.",
          "Safety records (reports, restrictions and removals): up to 2 years after your account closes, so removed members can't simply sign up again. For a removed member, this includes a one-way fingerprint of their phone number and ID number. If an account is under review when it's deleted, these records are kept until the review is settled. A removed member's sign-in (email or phone) is kept, blocked, for the same period, then deleted. Every decision by our team about an account is recorded, with the reason category, so it can be checked later.",
          "Coins: unspent coins are lost when you delete your account. We'll show you your balance and offer you the chance to use them before you confirm.",
          "Toastly Help conversations: 30 days after the last message, then deleted. If you pass something to our team, your words are deleted at the same time; we keep only its reference number and whether it was resolved.",
          "Payment and financial records: 6 years, as tax law requires.",
          "The women's launch offer: when a member who received it deletes their account, we keep a one-way fingerprint of their phone number — never the number — so the offer can be given only once per number. We keep it for 12 months after the account is deleted, then delete it.",
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
        text: "We're based in Nigeria and serve members abroad. Our database is hosted in Ireland, in the European Union, and our app runs in the United States. Each of our providers, and where it processes your data, is listed in section 4. Where data leaves Nigeria or the UK, we rely on appropriate safeguards required by law, such as contractual protections with our providers.",
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
        text: `Many of these you can do directly in your settings. Otherwise, email ${PRIVACY_CONTACT} and we'll respond within one month. We may need to confirm your identity first. Where the law allows, we may withhold some safety records — for example, where sharing them would help someone get around our protections against fraud.`,
      },
      {
        kind: "p",
        text: `If you're unhappy with how we've handled your data, you can complain to the Nigeria Data Protection Commission (NDPC). If you live in the UK, you can contact our UK representative, [UK REPRESENTATIVE NAME AND CONTACT DETAILS], or complain to the Information Commissioner's Office (ICO). We'd appreciate the chance to put things right first.`,
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
        text: "Toastly is only for people aged 18 and over. If we learn an account belongs to someone under 18, we'll close it and delete their data.",
      },
    ],
  },
  {
    id: "cookies",
    title: "13. Cookies",
    blocks: [
      {
        kind: "p",
        text: "Our website uses only the cookies needed to keep you signed in and keep the service working, plus one that remembers when you last looked at your Gists. Your browser also remembers when you've closed one of our notices, so it isn't shown again. We don't use advertising or analytics cookies, and our analytics store nothing in your browser: the few product steps we record (section 2) are recorded on our servers.",
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

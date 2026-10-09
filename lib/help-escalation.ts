/**
 * Toastly Help → a person (owner, 9 October 2026). The decision, in one place.
 *
 * PURE: no imports, no I/O — the Help route calls it, the tests call it.
 *
 *   1. The member asks for a person: always honoured (a ticket is filed).
 *   2. Rule topics — refunds, disputes, charged with no plan, appeals,
 *      restrictions, repeated verification failure, data access or
 *      deletion: a ticket is filed and the assistant never decides.
 *   3. Safety topics — threats, harassment, feeling unsafe, asked for money,
 *      a possible scam, a possible under-18, self-harm: URGENT. The member
 *      sees the safety tools at once (self-harm: crisis lines first) and the
 *      assistant never handles it.
 *   4. Not resolved after N member turns (support_config, default 4): a
 *      person is offered.
 *
 * The model returns {handoff, category}; a separate keyword check here can
 * raise it on its own, and the HIGHER of the two wins. The server also
 * enforces each category's floor, so the model can't answer a refund itself.
 */

export const HANDOFF_LEVELS = ["none", "normal", "urgent"] as const;
export type Handoff = (typeof HANDOFF_LEVELS)[number];

export const SAFETY_CATEGORIES = ["threat", "harassed", "unsafe", "money_request", "scam", "under_18", "self_harm"] as const;
export const RULE_CATEGORIES = [
  "refund",
  "dispute",
  "charged_no_plan",
  "appeal",
  "restriction",
  "verification_repeat",
  "data_request",
] as const;
export const EVERYDAY_CATEGORIES = ["verification", "payment", "coins", "plan", "how_it_works", "other"] as const;
export const HELP_CATEGORIES = [...SAFETY_CATEGORIES, ...RULE_CATEGORIES, ...EVERYDAY_CATEGORIES] as const;
export type HelpCategory = (typeof HELP_CATEGORIES)[number];

export type Trigger = "member_asked" | "rule_topic" | "safety" | "not_resolved";

const RANK: Record<Handoff, number> = { none: 0, normal: 1, urgent: 2 };

export const isSafety = (c: string | null | undefined): boolean => (SAFETY_CATEGORIES as readonly string[]).includes(c ?? "");
export const isRule = (c: string | null | undefined): boolean => (RULE_CATEGORIES as readonly string[]).includes(c ?? "");
export const isCategory = (c: unknown): c is HelpCategory => (HELP_CATEGORIES as readonly string[]).includes(c as string);

/** The least a category may get: safety is urgent, a rule topic goes to a person. */
export function floorFor(category: string | null | undefined): Handoff {
  return isSafety(category) ? "urgent" : isRule(category) ? "normal" : "none";
}

// ---------------------------------------------------------------------------
// The keyword check — server-side, independent of the model
// ---------------------------------------------------------------------------

/**
 * Safety signals, English and Nigerian Pidgin. Checked in this order, so a
 * message about self-harm is always treated as self-harm (crisis lines
 * first), whatever else it mentions. Broad on purpose: a false alarm costs a
 * person a look; a miss costs far more.
 */
const SAFETY_SIGNALS: [HelpCategory, RegExp][] = [
  [
    "self_harm",
    /\b(kill(ing)? myself|suicid\w*|self[- ]?harm\w*|hurt(ing)? myself|end (it all|my life)|take my (own )?life|don'?t want to (live|be alive)|no reason to live|better off dead|i wan (kill|die) myself|make i just die)\b/i,
  ],
  [
    "under_18",
    /\b(under ?18|underage|under-age|(is|she'?s|he'?s|they'?re|i'?m) (a|still a) minor|(1[0-7]|[5-9]) ?(years?|yrs?) old|(i'?m|i am|she'?s|he'?s|she is|he is) (only )?1[0-7]\b(?! ?(min|hour|hr|sec|day|week|month|k\b|%|naira))|still in (secondary|primary|high) school|small (girl|boy) wey)/i,
  ],
  [
    "threat",
    /\b(threat(en)?\w*|blackmail\w*|extort\w*|kill (me|you|her|him)|going to hurt|will hurt me|leak my (pictures|photos|nudes|videos?)|expose me|dem wan kill|im wan kill|go deal with me|kidnap\w*|rap(e|ed|ing)|assault\w*|attack(ed)? me|beat me|he hit me|she hit me|stalk\w*|follow(ed|ing) me home)\b/i,
  ],
  [
    "unsafe",
    /\b((don'?t|do not|no) feel safe|(i|i'?m|i am|i feel) (so |really |very )?(unsafe|not safe)|in danger|scared for my (life|safety)|afraid for my (life|safety)|i no (dey )?safe|(this is an?|it'?s an?|i have an?) emergency)\b/i,
  ],
  [
    "money_request",
    /\b(ask(ed|ing|s)? (me )?for (money|cash|a loan|tran[s]fer|airtime|data bundle)|send (him|her|them) money|wants? (my )?money|borrow (me|him|her) money|asking for (money|cash)|beg(ged|ging)? (me )?for money|abeg send (money|cash)|make i send am money)\b/i,
  ],
  [
    "scam",
    /\b(scam\w*|fraud\w*|419|yahoo ?(boy|girl)s?|fake (profile|account|person)|catfish\w*|romance scam|investment (scheme|plan|opportunity)|crypto (scheme|trading)|forex (trading|account))\b/i,
  ],
  [
    "harassed",
    /\b(harass\w*|abus(e|ed|ive|ing)|insult(ed|ing)? me|bully\w*|keeps? (messaging|calling|texting) me|won'?t leave me alone|sexual(ly)? (messages|comments|harass\w*)|unsolicited (nudes|pictures)|sent me nudes|dey disturb me)\b/i,
  ],
];

/** "I want a person." Honoured every time, however it's put. */
const PERSON_SIGNAL =
  /\b((talk|speak|chat) (to|with) (a |an |your )?(real |actual )?(person|human|someone|somebody|agent|staff|team|customer (care|service))|real (person|human)|(human|person|agent) please|i (want|need) (a |an )?(real )?(person|human|agent)|customer (care|service|support)|not (a |an )?(bot|ai|robot)|i wan (talk|yarn) (to|with) (person|human)|make (person|human) (help|answer) me)\b/i;

export type KeywordHit = { handoff: Handoff; category: HelpCategory | null; trigger: Trigger };

export function keywordCheck(text: string): KeywordHit | null {
  for (const [category, re] of SAFETY_SIGNALS) {
    if (re.test(text)) return { handoff: "urgent", category, trigger: "safety" };
  }
  if (PERSON_SIGNAL.test(text)) return { handoff: "normal", category: null, trigger: "member_asked" };
  return null;
}

// ---------------------------------------------------------------------------
// The decision
// ---------------------------------------------------------------------------

/** How many failed selfie checks make a verification question a person's job. */
export const REPEAT_VERIFICATION_FAILURES = 3;

export type ModelVerdict = { handoff: Handoff; category: HelpCategory } | null;

export type Decision = {
  handoff: Handoff;
  category: HelpCategory;
  trigger: Trigger | null;
  /** Offer a person (the member taps): not resolved after N turns. */
  offerPerson: boolean;
};

export function decideHandoff(input: {
  /** The model's structured output; null when the model wasn't reached. */
  model: ModelVerdict;
  /** keywordCheck() on the member's latest message. */
  keyword: KeywordHit | null;
  /** Member turns in this conversation, including this one. */
  memberTurns: number;
  /** support_config offer_person_after_turns. */
  offerAfterTurns: number;
  /** A ticket is already open for this conversation. */
  ticketOpen: boolean;
  /** Failed selfie checks on record (verification_sessions). */
  failedVerifications?: number;
}): Decision {
  const { model, keyword } = input;

  // The model's verdict, with each category's floor enforced.
  let mCategory: HelpCategory = model?.category ?? "other";
  let mLevel: Handoff = model ? higher(model.handoff, floorFor(mCategory)) : "none";
  if (
    (mCategory === "verification" || mCategory === "verification_repeat") &&
    (input.failedVerifications ?? 0) >= REPEAT_VERIFICATION_FAILURES
  ) {
    mCategory = "verification_repeat";
    mLevel = higher(mLevel, "normal");
  }
  // Urgent always means a safety category.
  if (mLevel === "urgent" && !isSafety(mCategory)) mCategory = "unsafe";

  const kLevel: Handoff = keyword?.handoff ?? "none";
  const handoff = higher(mLevel, kLevel);

  let category: HelpCategory;
  if (handoff === "urgent") {
    // Self-harm from either side wins: it changes what the member sees first.
    if (keyword?.category === "self_harm" || mCategory === "self_harm") category = "self_harm";
    else if (RANK[kLevel] === RANK.urgent && keyword?.category) category = keyword.category;
    else category = mCategory;
  } else {
    category = isRule(mCategory) ? mCategory : (keyword?.category ?? mCategory);
  }

  const trigger: Trigger | null =
    handoff === "none" ? null : isSafety(category) ? "safety" : isRule(category) ? "rule_topic" : "member_asked";

  const offerPerson = handoff === "none" && !input.ticketOpen && input.memberTurns >= input.offerAfterTurns;
  return { handoff, category, trigger, offerPerson };
}

export function higher(a: Handoff, b: Handoff): Handoff {
  return RANK[a] >= RANK[b] ? a : b;
}

// ---------------------------------------------------------------------------
// What the member is told
// ---------------------------------------------------------------------------

/** 60 → "1 hour", 1440 → "24 hours", 30 → "30 minutes". */
export function slaText(minutes: number): string {
  if (minutes < 60 || minutes % 60 !== 0) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const h = minutes / 60;
  return `${h} hour${h === 1 ? "" : "s"}`;
}

export function slaLine(minutes: number, language: "en" | "pcm" = "en"): string {
  return language === "pcm"
    ? `Person for our team go reply you within ${slaText(minutes)}.`
    : `A person from our team will reply within ${slaText(minutes)}.`;
}

// ---------------------------------------------------------------------------
// Staff alerts — the ticket number, its urgency and a console link. NOTHING
// else: no name, no category, no words. The builders take only those fields,
// so nothing else can reach an SMS or an inbox.
// ---------------------------------------------------------------------------

export type AlertTicket = { reference: string; urgency: "normal" | "urgent" };

export function consoleLink(base: string, reference: string): string {
  return `${base.replace(/\/+$/, "")}/staff/support/${encodeURIComponent(reference)}`;
}

export function alertSms(t: AlertTicket, base: string, realert = false): string {
  const { reference, urgency } = { reference: t.reference, urgency: t.urgency };
  const head = realert ? `Toastly: URGENT ticket ${reference} still not opened.` : `Toastly: ${urgency === "urgent" ? "URGENT" : "new"} ticket ${reference}.`;
  return `${head} ${consoleLink(base, reference)}`;
}

export function alertEmail(t: AlertTicket, base: string, realert = false): { subject: string; text: string; html: string } {
  const { reference, urgency } = { reference: t.reference, urgency: t.urgency };
  const label = urgency === "urgent" ? "URGENT" : "Normal";
  const link = consoleLink(base, reference);
  const subject = realert
    ? `[URGENT] ${reference} not opened yet`
    : `[${label}] Toastly Help ticket ${reference}`;
  const lead = realert ? `Urgent ticket ${reference} hasn't been opened within its reply time.` : `${label} Toastly Help ticket ${reference} is waiting.`;
  return {
    subject,
    text: `${lead}\n\nOpen it in the console: ${link}`,
    html: `<p>${esc(lead)}</p><p><a href="${esc(link)}">Open it in the console</a></p>`,
  };
}

export type DigestRow = { reference: string; urgency: "normal" | "urgent"; created_at: string };

export function digestEmail(rows: DigestRow[], base: string, now: number): { subject: string; text: string; html: string } {
  const list = [...rows]
    .map((r) => ({ reference: r.reference, urgency: r.urgency, created_at: r.created_at }))
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const age = (iso: string) => {
    const h = Math.max(0, Math.floor((now - Date.parse(iso)) / 3_600_000));
    return h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`;
  };
  const line = (r: (typeof list)[number]) => `${r.reference} · ${r.urgency === "urgent" ? "URGENT" : "normal"} · waiting ${age(r.created_at)}`;
  const subject = `Toastly Help: ${list.length} open ticket${list.length === 1 ? "" : "s"}`;
  const text = list.length
    ? `Open tickets, oldest first:\n\n${list.map((r) => `${line(r)}\n${consoleLink(base, r.reference)}`).join("\n\n")}`
    : "No open tickets this morning.";
  const html = list.length
    ? `<p>Open tickets, oldest first:</p><ul>${list
        .map((r) => `<li><a href="${esc(consoleLink(base, r.reference))}">${esc(line(r))}</a></li>`)
        .join("")}</ul>`
    : "<p>No open tickets this morning.</p>";
  return { subject, text, html };
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

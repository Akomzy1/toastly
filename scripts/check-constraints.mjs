/**
 * Product-constraint checks.
 *
 * CLAUDE.md lists rules that are "not just product decisions — they have
 * direct technical implications. Do not implement around them." Several are
 * the kind of thing reintroduced by accident months later, by someone who
 * never read the doc. These assert a few of them mechanically.
 *
 *   node scripts/check-constraints.mjs
 *
 * A failure here is a product violation, not a style nit.
 */
import fs from "node:fs";
import path from "node:path";

const ROOTS = ["app", "components", "lib", "supabase"];
const failures = [];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|sql)$/.test(p)) out.push(p);
  }
  return out;
}

const files = ROOTS.flatMap((r) => walk(r));

/** Strip comments, so a rule written ABOUT a banned word doesn't trip it. */
function stripComments(src, file) {
  if (file.endsWith(".sql")) return src.replace(/--[^\n]*/g, "");
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/[^\n]*/gm, "");
}

/** Strip string literals, leaving only code. */
function stripStrings(src) {
  return src
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

/** Pull the double-quoted string literals out of a source file. */
function stringsIn(src) {
  return src.match(/"(?:[^"\\\n]|\\.)*"/g) ?? [];
}

function check(name, test) {
  const hits = [];
  for (const f of files) {
    const src = stripComments(fs.readFileSync(f, "utf8"), f);
    const hit = test(src, f);
    if (hit) hits.push(`${f}${hit === true ? "" : ` — ${hit}`}`);
  }
  if (hits.length) failures.push({ name, hits });
  console.log(`${hits.length ? "FAIL" : "ok  "}  ${name}`);
}

// --- No swipe mechanic ----------------------------------------------------
//
// Copy may SAY "swipe": the marketing pages argue against swiping at length
// ("Nothing to swipe", "not another swipe deck"). What must not exist is a
// swipe MECHANIC, so string literals are stripped and only code identifiers
// and imports are examined.
// JSX prose is bare text in the source, not a string literal, so stripping
// strings is not enough — "Nothing to swipe" survives it. A real swipe
// mechanic looks like an identifier, a handler or an import, so match those
// shapes rather than the bare word.
const SWIPE_MECHANIC =
  /\bon[A-Z]\w*Swipe\w*|\bSwipe[A-Z]\w*|\bswipe[A-Z]\w*|\buse\w*Swipe\w*|\bswipeable\b|from\s+["'][^"']*(swipe|tinder-card|use-gesture)/i;

check("no swipe mechanic or swipe gesture handling", (s) =>
  SWIPE_MECHANIC.test(stripStrings(s)),
);

check("no heart / flame / super-like iconography", (s) =>
  /superlike|super_like|flame/i.test(stripStrings(s)),
);

// PRD §7.2: Boosts and Super Likes are cut from the product. With a fixed
// six-a-day feed a Boost can only mean appearing in more people's six, which
// is buying attention — the thing the brand is built against. Coins buy
// exactly four things, none of which raise a member's visibility to others.
check("no Boost or paid-visibility purchase", (s) =>
  /\bboost(s|ed|ing|Count|Credits?)?\b|paidPlacement|promoteProfile/i.test(
    stripStrings(s),
  ),
);

// PRD §5.4: 18 minutes, extendable once. The superseded 5–7 minute figure
// must not reappear as a constant.
check("Gist time-box is not a superseded short value", (s, f) => {
  if (!/GIST_\w*MINUTES/.test(s)) return false;
  const bad = s.match(/GIST_\w*MINUTES\s*=\s*(\d+)/g) ?? [];
  const offending = bad.filter((m) => {
    const n = Number(m.match(/(\d+)$/)?.[1]);
    return n < 18;
  });
  return offending.length ? offending.join(", ") : false;
});

// --- The daily feed is six, on every tier --------------------------------
check("daily match count is not derived from tier or entitlement", (s) => {
  if (!/daily_match_count|DAILY_MATCH_COUNT/.test(s)) return false;
  return /daily_match_count\s*\([^)]*tier|DAILY_MATCH_COUNT\s*[*+]|limit\s+\w*tier/i.test(
    s,
  );
});

check("feed query does not filter on optional display-only fields", (s, f) => {
  if (!f.endsWith(".sql") || !/build_daily_feed/.test(s)) return false;
  const body = s.slice(s.indexOf("build_daily_feed"));
  const where = body.slice(body.indexOf("where"), body.indexOf("order by"));
  const banned = [
    "religion",
    "tribe",
    "languages",
    "history",
    "has_children",
    "profession",
    "education",
  ].filter((c) => new RegExp(`\\b${c}\\b`).test(where));
  return banned.length ? `filters on ${banned.join(", ")}` : false;
});

// --- Money copy -----------------------------------------------------------
check("no charity destination copy for forfeited stakes", (s) =>
  /charity/i.test(s),
);

// CLAUDE.md rules out "forfeit" and "penalty" as FRAMING for the coin
// deposit. Using either word to DENY it is the approved copy, so approved
// negations are listed explicitly: a new punitive string still fails.
const APPROVED_NEGATIONS = [
  "not a penalty system", // Pricing: "a mutual promise... not a penalty system"
  "Penalty for saying so", // Home coin card, whose stat is "0"
  "not a punishment", // Features: "Coins as a promise, not a punishment"
];

check("coin copy avoids punitive framing", (s) => {
  const bad = stringsIn(s)
    .filter((t) => /\bforfeits?\b|\bpenalt(y|ies)\b/i.test(t))
    .filter((t) => !APPROVED_NEGATIONS.some((ok) => t.includes(ok)));
  return bad.length ? bad[0].slice(0, 70) : false;
});

// --- Verification is never paywalled -------------------------------------
check("verification path reads no tier or entitlement", (s, f) => {
  if (!/verify/.test(f.replace(/\\/g, "/"))) return false;
  return /current_tier|entitlements|\btier\b/i.test(stripStrings(s));
});

// --- Gist: video is top-tier only, and calls are VoIP --------------------
check("live video Gist is gated to Premium Plus / Diaspora Plus only", (s) => {
  if (!/can_use_video_gist/.test(s) || !/create or replace function/.test(s)) {
    return false;
  }
  const fn = s.slice(s.indexOf("function public.can_use_video_gist"));
  const body = fn.slice(0, fn.indexOf("$$;", fn.indexOf("$$") + 2));
  const ok =
    /premium_plus/.test(body) &&
    /diaspora_plus/.test(body) &&
    !/'starter'|'premium'\s*[,)]|'diaspora'\s*[,)]/.test(body);
  return ok ? false : "video entitlement includes a tier it should not";
});

// The pages SAY "nobody sees anybody's phone number" — that is the promise,
// and JSX prose is bare text rather than a string literal, so match the
// shapes a real telephony integration would take instead of the bare word.
check("no carrier number or real phone number in the call path", (s, f) => {
  const p = f.replace(/\\/g, "/");
  if (!/(gist|livekit)/i.test(p)) return false;
  return /\bphone_number\b|\bphoneNumber\b|\bmsisdn\b|\bdialOut\b|from\s+["'][^"']*(twilio|vonage|africastalking)/i.test(
    stripStrings(s),
  );
});

// --- Free on every tier ---------------------------------------------------
//
// Couple Mode and the AriyaPlanner handoff are the platform's core LTV
// mechanic and are free on EVERY tier including Starter. Three separate
// prototype pages sold them as a Premium Plus feature, so this asserts the
// entitlement table cannot quietly acquire a false.
const TIER_COUNT = 5;
for (const [cap, label] of [
  ["coupleMode", "Couple Mode"],
  ["ariyaHandoff", "AriyaPlanner handoff"],
  ["verification", "verification"],
  ["safetyTools", "safety tools"],
]) {
  check(`${label} is free on every tier`, (s, f) => {
    if (!/lib[\\/]entitlements\.ts$/.test(f)) return false;
    const trues = (s.match(new RegExp(`${cap}:\\s*true`, "g")) ?? []).length;
    const falses = (s.match(new RegExp(`${cap}:\\s*false`, "g")) ?? []).length;
    if (falses > 0) return `${cap} is false on ${falses} tier(s)`;
    return trues >= TIER_COUNT ? false : `${cap} set on only ${trues} tiers`;
  });
}

check("daily matches is 6 on every tier in the entitlement table", (s, f) => {
  if (!/lib[\\/]entitlements\.ts$/.test(f)) return false;
  const values = (s.match(/dailyMatches:\s*(\d+)/g) ?? []).map((m) =>
    Number(m.split(":")[1]),
  );
  if (values.length < TIER_COUNT) return `only ${values.length} tiers listed`;
  return values.every((v) => v === 6) ? false : `found ${values.join(", ")}`;
});

// --- SMS stays out of the call path ---------------------------------------
//
// SMS exists for emergency-contact confirmation and panic alerts only. The
// moment Gist or LiveKit code can reach it, "no carrier number in the call
// path" depends on someone remembering rather than on structure.
check("SMS is never reachable from the call path", (s, f) => {
  const p = f.replace(/\\/g, "/");
  if (!/(gist|livekit)/i.test(p)) return false;
  return /@\/lib\/sms|termii|twilio/i.test(stripStrings(stripComments(s, f)))
    ? "call-path code can reach SMS"
    : false;
});

// --- Blind report and block -----------------------------------------------
//
// The whole point is that the reporting member never learns who sent it. A
// function taking a sender id, or returning anything at all, hands the client
// something to read.
check("blind report and block disclose no sender", (s, f) => {
  if (!f.endsWith(".sql") || !/blind_report_locked/.test(s)) return false;
  const report = /create or replace function public\.blind_report_locked\(([\s\S]*?)\)\s*returns\s+(\w+)/.exec(s);
  const block = /create or replace function public\.blind_block_locked\(([\s\S]*?)\)\s*returns\s+(\w+)/.exec(s);
  if (!report || !block) return "one of the blind functions is missing";
  if (/uuid/i.test(report[1]) || /uuid/i.test(block[1])) {
    return "a blind function takes a member id";
  }
  if (report[2] !== "void" || block[2] !== "void") {
    return "a blind function returns something the client could read";
  }
  return false;
});

// --- Analytics boundary ---------------------------------------------------
//
// Sentinel events live in Supabase because they feed an auditable human
// review queue. Mirroring them into an analytics tool would put safety
// signals somewhere with none of those guarantees.
check("Sentinel events never go to the analytics tool", (s, f) => {
  const p = f.replace(/\\/g, "/");
  if (!/lib\/analytics\.ts$/.test(p)) return false;
  if (/trust_event|gist_invitation_|report_filed|verification_recheck|stake_forfeited/.test(s)) {
    return "a Sentinel event name appears in the analytics module";
  }
  const union = /export type AnalyticsEvent =([\s\S]*?);/.exec(s);
  if (!union) return "the event union is missing";
  const count = (union[1].match(/"/g) ?? []).length / 2;
  return count > 6 ? `${count} analytics events — keep the set small` : false;
});

// --- The emergency contact is not a matching input ------------------------
// Scoped to the FUNCTION BODY, not the file. 0012 both rewrites the feed and
// creates the emergency_contacts table, and a file-level selector failed it
// for that co-location alone — the check being wrong about the file rather
// than the file being wrong.
check("the emergency contact never reaches matching", (s, f) => {
  if (!f.endsWith(".sql") || !/build_daily_feed/.test(s)) return false;
  const fn = s.slice(s.indexOf("function public.build_daily_feed"));
  const body = fn.slice(0, fn.indexOf("$$;", fn.indexOf("$$") + 2));
  return /emergency_contacts/.test(body)
    ? "the feed can see emergency contacts"
    : false;
});

// --- Date spots -----------------------------------------------------------
//
// PRD §5.5 calls the public-venue nudge a soft safety signal, so "never a
// bar or lounge" is an allowlist in both the enum and the provider mapping —
// not something that depends on remembering to omit a query parameter.
check("date spot categories exclude drinking venues", (s, f) => {
  if (f.endsWith(".sql")) {
    const m = /create type date_spot_category as enum \(([\s\S]*?)\);/.exec(s);
    if (!m) return false;
    return /bar|lounge|club|casino|liquor/i.test(m[1])
      ? "a drinking venue is in the category enum"
      : false;
  }
  if (!/lib\/places\.ts$/.test(f.replace(/\\/g, "/"))) return false;
  const map = /const TYPE_MAP[\s\S]*?\};/.exec(s);
  if (!map) return "TYPE_MAP is missing from places.ts";
  return /bar|night_club|lounge|casino|liquor/i.test(map[0])
    ? "a drinking venue type is mapped"
    : false;
});

// A suggestion before both answers would disclose the other person's private
// "continue" — which 0003 exists to protect.
check("a date spot needs a mutual continue first", (s, f) => {
  if (!f.endsWith(".sql") || !/create table public\.date_spots/.test(s)) {
    return false;
  }
  return /gist_mutual_continue\(/.test(s) &&
    /before insert on public\.date_spots/.test(s)
    ? false
    : "nothing requires a mutual continue before a suggestion";
});

// A browser-visible maps key is billable by anyone who finds it.
check("the maps key is never exposed to the browser", (s) => {
  return /NEXT_PUBLIC_[A-Z_]*PLACES|NEXT_PUBLIC_[A-Z_]*MAPS/.test(s)
    ? "a maps key carries the NEXT_PUBLIC_ prefix"
    : false;
});

// --- Diaspora pools -------------------------------------------------------
//
// PRD §5.6: diaspora-to-diaspora "unlocked per diaspora city only once that
// city has enough verified users, not switched on globally at launch". The
// pre-0010 feed opened every city at once by matching on country.
check("diaspora-to-diaspora is per-city and off by default", (s, f) => {
  if (!f.endsWith(".sql") || !/create table public\.diaspora_cities/.test(s)) {
    return false;
  }
  if (!/active boolean not null default false/.test(s)) {
    return "cities are not seeded closed";
  }
  const seed = /insert into public\.diaspora_cities[\s\S]*?;/.exec(s);
  if (seed && /\btrue\b/.test(seed[0])) return "a city is seeded already open";
  return false;
});

// Pools change who the six are drawn from. They must never change the six.
check("pool choice never changes the daily count", (s, f) => {
  if (!f.endsWith(".sql") || !/build_daily_feed/.test(s)) return false;
  return /limit daily_match_count\(\)/.test(s)
    ? false
    : "the feed limit is not daily_match_count()";
});

// --- Stake credits --------------------------------------------------------
// Selects on the ledger TABLE, not on the words "stake_credit". 0009 names
// stake_credit_received as a trust-event kind and creates no ledger row at
// all; the older selector failed it for the mere mention, which is the check
// being wrong about the file rather than the file being wrong.
check("stake credits can never be withdrawable", (s, f) => {
  if (!f.endsWith(".sql") || !/coin_ledger/.test(s)) return false;
  const hasConstraint = /kind <> 'stake_credit' or withdrawable = false/.test(s);
  const excluded = /withdrawable_balance[\s\S]*?withdrawable = true/.test(s);
  if (!hasConstraint) return "no constraint forcing stake credits non-withdrawable";
  if (!excluded) return "withdrawable_balance does not exclude locked entries";
  return false;
});

check("pricing-integrity signals trigger no automatic consequence", (s, f) => {
  if (!/integrity_(signal|reviews)/.test(s)) return false;
  return /auto_?(suspend|ban|lock)|suspend\(\)|autoSuspend/i.test(
    stripStrings(stripComments(s, f)),
  )
    ? "found an automatic action on an integrity signal"
    : false;
});

// --- Couple Mode ----------------------------------------------------------
//
// Free on every tier. The Couple Mode surface must not read a tier at all:
// the moment it does, an upgrade prompt is one edit away, and that is the
// error three separate prototype pages made.
check("Couple Mode surface reads no tier or entitlement", (s, f) => {
  const p = f.replace(/\\/g, "/");
  if (!/\/couple\/|lib\/couple\.ts$|couple_mode/.test(p)) return false;
  return /current_tier|capabilities\(|premium|\btier\b/i.test(
    stripStrings(stripComments(s, f)),
  );
});

// Couple data never gates matching (Prompt 8). None of these tables may be
// consulted while building someone's feed.
check("feed does not consult couple data", (s, f) => {
  if (!f.endsWith(".sql") || !/build_daily_feed/.test(s)) return false;
  const body = s.slice(s.indexOf("build_daily_feed"));
  const fn = body.slice(0, body.indexOf("$$;"));
  const hit = /couples|couple_briefs|couple_milestones/.exec(fn);
  return hit ? `feed references ${hit[0]}` : false;
});

// The live AriyaPlanner integration is explicitly out of MVP scope and needs
// an explicit decision before any of it is written. The contract may exist;
// a client, endpoint or outbound call may not.
check("no live AriyaPlanner integration code", (s, f) => {
  // Identify AriyaPlanner code from the RAW source and the filename: an
  // endpoint usually lives in a string literal, so stripping strings first
  // would delete the very evidence that this file is the integration.
  const relevant = /ariya/i.test(s) || /ariya/i.test(f);
  if (!relevant) return false;

  // Then look for an outbound call in the CODE, so prose and comments about
  // the handoff stay legal.
  const code = stripStrings(stripComments(s, f));
  const hit = /\bfetch\s*\(|\baxios\b|new\s+\w*Client\s*\(|\.post\s*\(|\.send\s*\(/.exec(
    code,
  );
  return hit ? `outbound call in AriyaPlanner code: ${hit[0].trim()}` : false;
});

// A brief is assembled only with both consents. Typed as literal `true` so an
// unconsented brief is not representable.
check("couple brief cannot be assembled without both consents", (s, f) => {
  if (!/lib[\\/]couple\.ts$/.test(f)) return false;
  const literal = /bothConsented:\s*true;/.test(s);
  const guard = /if\s*\(!source\.aConsentedAt \|\| !source\.bConsentedAt\)\s*return null;/.test(
    s,
  );
  if (!literal) return "bothConsented is not a literal true in the type";
  if (!guard) return "assembleBrief does not refuse without both consents";
  return false;
});

// --- The locked inbox ----------------------------------------------------
//
// A locked inbox must be representable ONLY as a number. If the type ever
// grows an optional sender, preview or blurred body, the leak has already
// happened in the payload — redaction at render time is not a lock.
check("locked inbox type cannot carry sender or preview", (s, f) => {
  if (!/type LockedInbox/.test(s)) return false;
  const t = s.slice(s.indexOf("type LockedInbox"));
  const body = t.slice(0, t.indexOf("};") + 2);
  const leak = /sender|preview|avatar|initial|snippet|blur|body/i.exec(body);
  return leak ? `LockedInbox mentions "${leak[0]}"` : false;
});

// The locked branch must not merely discard message rows — it must not ask
// for them. RLS would refuse them anyway; not querying is the second lock,
// and it keeps bodies out of the RSC payload entirely.
check("locked inbox branch queries no message rows", (s, f) => {
  if (!/canReadInbox/.test(s) || !/unread_count/.test(s)) return false;
  const start = s.indexOf("if (!canReadInbox");
  if (start < 0) return false;
  const locked = s.slice(start, s.indexOf("} else {", start));
  return /from\(["']messages["']\)|from\(["']threads["']\)/.test(locked)
    ? "locked branch selects message or thread rows"
    : false;
});

// CLAUDE.md: message content is NEVER scanned, parsed or flagged for phone
// numbers or contact info. This is a hard privacy boundary, not a soft
// preference — no moderation hook may be added for that purpose.
check("no scanning of message content for contact info", (s, f) => {
  const p = f.replace(/\\/g, "/");
  if (!/(inbox|messag)/i.test(p)) return false;
  const code = stripStrings(stripComments(s, f));
  return /\b(detect|scan|extract|redact|flag)\w*(Phone|Contact|Number)|phoneRegex|\\d\{7,\}/i.test(
    code,
  );
});

// No countdown timers, no fabricated scarcity in the upgrade prompt.
check("locked inbox copy uses no fake scarcity", (s, f) => {
  if (!/LOCKED_COPY/.test(s)) return false;
  const hit = /expires? (in|soon)|only \d+ (hours?|days?) left|countdown|hurry|act now/i.exec(
    s,
  );
  return hit ? hit[0] : false;
});

// --- The safety kit -------------------------------------------------------
//
// Prompt 9: confirm none of the safety kit is paywalled at any tier,
// "including via a shared component that's gated for unrelated reasons".
// The kit's files must not read a plan at all.
check("safety kit reads no tier or entitlement", (s, f) => {
  const p = f.replace(/\\/g, "/");
  if (!/safety-kit|components\/safety\/|lib\/safety(-actions)?\.ts$|0007_safety/.test(p)) {
    return false;
  }
  return /current_tier|capabilities\(|can_read_inbox|entitlement|\btier\b|premium/i.test(
    stripStrings(s),
  );
});

// Unsolicited-image protection hides EVERY image and lets the recipient
// choose. It must never classify content: PRD 5.1 says chat is never
// scanned, and an image classifier is a scanner.
check("image protection never classifies content", (s, f) => {
  const p = f.replace(/\\/g, "/");
  if (!/components\/safety\/|lib\/safety|message_attachments/.test(p)) return false;
  return /nsfw|classif(y|ier)|detectNudity|moderat(e|ion)Image|nudenet|rekognition|safeSearch|tensorflow/i.test(
    stripStrings(s),
  );
});

// PRD 5.1: a number-sharing affordance is withheld until a trust threshold
// (completed video Gist + mutual continue, or Couple Mode entry). None is
// built yet. When one is, replace this with a check that asserts the gate.
check("no contact-sharing affordance ahead of the trust threshold", (s) =>
  /shareContact|share_contact|revealPhone|exchangeNumbers/i.test(stripStrings(s)),
);

// Photo reveal is enforced by the database AND the files are in a private
// bucket — row-level security on a table is decorative if the image files
// themselves are publicly fetchable.
check("photo reveal enforced in RLS, with private storage", (s, f) => {
  if (!f.endsWith(".sql") || !/create table public\.profile_photos/.test(s)) return false;
  if (!/can_see_photos\(auth\.uid\(\)/.test(s)) {
    return "profile_photos select policy does not use can_see_photos";
  }
  if (/'profile-photos'\s*,\s*'profile-photos'\s*,\s*true/.test(s)) {
    return "profile-photos bucket is public";
  }
  if (!/on storage\.objects for select/.test(s)) {
    return "no storage.objects policy guarding the photo files";
  }
  return false;
});

// --- Agents in the infrastructure, never in the intimacy ------------------
//
// CLAUDE.md's governing rule for every AI agent in this product: none writes
// messages for members, suggests replies, coaches a live conversation, or
// speaks as a member. Matched as identifiers so that prose about the rule,
// and the Gist question deck (shared questions, not written replies), stay
// legal.
check("no AI that writes, suggests or coaches messages", (s, f) => {
  const code = stripStrings(stripComments(s, f));
  const hit =
    /\b(suggestRepl|smartRepl|composeMessage|draftMessage|generateMessage|messageSuggestion|replySuggestion|coachConversation|autoReply|aiReply|rewriteMessage)\w*/i.exec(
      code,
    );
  return hit ? `found ${hit[0]}` : false;
});

// --- Trust Sentinel, Phase 1 ----------------------------------------------
//
// The Sentinel reasons about behaviour, never words, and never about
// protected attributes. Both are enforced by a CHECK on the event metadata
// rather than by convention.
check("trust events cannot carry content or protected attributes", (s, f) => {
  if (!f.endsWith(".sql") || !/create table public\.trust_events/.test(s)) return false;
  if (!/trust_meta_is_clean/.test(s)) return "no metadata guard function";
  if (!/check \(public\.trust_meta_is_clean\(meta\)\)/.test(s)) {
    return "trust_events has no CHECK using the guard";
  }
  for (const key of ["body", "transcript", "audio", "tribe", "religion", "profession"]) {
    if (!new RegExp(`'${key}'`).test(s)) return `guard does not reject '${key}'`;
  }
  return false;
});

// PRD §5.1.1 phases this deliberately: instrumentation now, the scoring agent
// only once there is data to set thresholds from. Scoring in Phase 1 would
// mean thresholds invented from nothing.
check("trust instrumentation stays events-only (no Phase 2 scoring)", (s, f) => {
  const p = f.replace(/\\/g, "/");
  if (!/trust[-_]events/.test(p)) return false;
  const code = stripStrings(stripComments(s, f));
  const hit = /\b(risk_?score|trust_?score|threshold|confidence_?score|auto_?restrict|auto_?ban)\w*/i.exec(
    code,
  );
  return hit ? `found ${hit[0]} — that is Phase 2` : false;
});

// --- No live profile, no access (PRD §5.1.2) -------------------------------
//
// "You can't look at people who can't see you." Every feed, profile-view,
// invite, message and date route must carry the live-profile guard, in the
// app AND in the database. These checks look at both, because either one
// alone leaves a door open: the app guard is skipped by anyone calling the
// API directly, and the database guard alone leaves members staring at empty
// screens with no explanation.

/** Like check(), for rules that need the whole repo rather than one file. */
function checkOnce(name, test) {
  const hits = [].concat(test() || []);
  if (hits.length) failures.push({ name, hits });
  console.log(`${hits.length ? "FAIL" : "ok  "}  ${name}`);
}

const posix = (f) => f.replace(/\\/g, "/");

// Route segments that ARE feed, profile-view, invite, message or date
// routes. A new one (say app/(app)/messages or app/(app)/profile/[id]) is
// guarded the moment it exists, by name.
const GUARDED_ROUTE =
  /^app\/\(app\)\/(feed|gist|inbox|messages?|chat|threads?|dates?|matches|members?|people|profiles?\/\[)/;

// Routes that must stay open whatever the member's status (PRD §5.1.2):
// verification, photo upload, Toastly Help, settings, data export and
// deletion, plus the safety kit. A guard here would lock a member out of the
// very screens that restore their profile.
//
// Decided 2026-10-05: Couple Mode also stays open while access is paused for
// profile reasons (it closes only on a review restriction or removal), and so
// does the coin balance and buying coins or a plan. Stakes and dates do not.
const ALWAYS_OPEN_ROUTE =
  /^app\/\(app\)\/(verify|photos|help|settings|export|delete|account|safety-kit|couple|coins|profile\/(page|actions|profile-form))/;

// Reading or writing any of these is, by definition, one of the five kinds
// of route — wherever the file lives.
const GUARDED_DATA =
  /from\(\s*["'](daily_feed|replies|gist_sessions|gist_outcomes|threads|messages|message_attachments|date_spots|date_commitments)["']\s*\)|rpc\(\s*["'](build_daily_feed|unread_count)["']/;

const GUARD_CALL = /\brequireLiveProfile\s*\(/;
const GUARD_USED = /!\s*\(?\s*(await\s+requireLiveProfile\([^)]*\)\s*\)|\w+)\.live\b/;

/** A server entry point: a page, layout, route handler or "use server" file. */
function entryKind(f, src) {
  if (/\/(page|layout)\.tsx$/.test(f)) return "page";
  if (/\/route\.ts$/.test(f)) return "route";
  if (/^\s*["']use server["']/.test(src)) return "actions";
  return null;
}

/** Each exported function in a "use server" file, with its body. */
function serverActions(src) {
  const starts = [...src.matchAll(/export\s+async\s+function\s+(\w+)/g)];
  return starts.map((m, i) => ({
    name: m[1],
    body: src.slice(m.index, starts[i + 1]?.index ?? src.length),
  }));
}

function lacksGuard(f, raw) {
  const src = stripComments(raw, f);
  const kind = entryKind(f, src);
  if (!kind) return [];
  if (kind === "actions") {
    return serverActions(src)
      .filter((a) => !GUARD_CALL.test(a.body) || !GUARD_USED.test(a.body))
      .map((a) => `${f} — ${a.name}() has no live-profile guard`);
  }
  return GUARD_CALL.test(src) && GUARD_USED.test(src)
    ? []
    : [`${f} — no live-profile guard`];
}

const appFiles = ["app", "lib"]
  .flatMap((r) => walk(r))
  .map((f) => posix(f))
  .filter((f) => /\.tsx?$/.test(f));

checkOnce("every feed, profile-view, invite, message and date route is live-guarded", () =>
  appFiles
    .filter((f) => GUARDED_ROUTE.test(f))
    .flatMap((f) => lacksGuard(f, fs.readFileSync(f, "utf8"))),
);

checkOnce("any route touching feed, invite, message or date data is live-guarded", () =>
  appFiles
    .filter((f) => !GUARDED_ROUTE.test(f))
    .filter((f) => GUARDED_DATA.test(stripComments(fs.readFileSync(f, "utf8"), f)))
    .flatMap((f) => lacksGuard(f, fs.readFileSync(f, "utf8"))),
);

checkOnce("verification, photos, help, settings, export and deletion stay open", () =>
  appFiles
    .filter((f) => ALWAYS_OPEN_ROUTE.test(f))
    .filter((f) => GUARD_CALL.test(stripComments(fs.readFileSync(f, "utf8"), f)))
    .map((f) => `${f} — calls requireLiveProfile on an always-open route`),
);

// The database side. Migrations are replayed in order so that only the
// policies and functions that actually survive are judged — a guard added in
// 0013 and silently dropped by 0020 must fail.
const MIGRATIONS = fs.existsSync("supabase/migrations")
  ? fs
      .readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => ({
        file: `supabase/migrations/${f}`,
        sql: stripComments(fs.readFileSync(`supabase/migrations/${f}`, "utf8"), f),
      }))
  : [];

function survivingPolicies() {
  const live = new Map();
  for (const { file, sql } of MIGRATIONS) {
    const re =
      /(drop policy (?:if exists )?"([^"]+)" on ([\w.]+)\s*;)|(create policy "([^"]+)"\s+on ([\w.]+)[\s\S]*?;)/g;
    for (const m of sql.matchAll(re)) {
      if (m[1]) live.delete(`${m[3]}::${m[2]}`);
      else live.set(`${m[6]}::${m[5]}`, { file, text: m[4] });
    }
  }
  return live;
}

function latestFunction(name) {
  let found = null;
  for (const { file, sql } of MIGRATIONS) {
    const re = new RegExp(
      `create or replace function public\\.${name}\\s*\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`,
      "g",
    );
    for (const m of sql.matchAll(re)) found = { file, body: m[1] };
  }
  return found;
}

// Tables whose every policy must require the caller to be live.
const GUARDED_TABLES = [
  "daily_feed",
  "replies",
  "gist_sessions",
  "gist_outcomes",
  "threads",
  "messages",
  "date_spots",
  "date_commitments",
];

checkOnce("every feed, invite, message and date policy requires a live caller", () => {
  const hits = [];
  for (const [key, p] of survivingPolicies()) {
    const table = key.split("::")[0].replace(/^public\./, "");
    if (!GUARDED_TABLES.includes(table)) continue;
    if (!/profile_is_live\(\s*auth\.uid\(\)\s*\)/.test(p.text)) {
      hits.push(`${p.file} — policy ${key} has no profile_is_live(auth.uid())`);
    }
  }
  return hits;
});

// Profiles and prompt answers: a member always reads their OWN row; any
// policy that shows them someone else's must require both sides live.
checkOnce("other members' profiles and answers are visible only live-to-live", () => {
  const hits = [];
  const ownOnly =
    /^create policy "[^"]+"\s+on [\w.]+\s+for (select|update|insert|all)\s+(using|with check)\s*\(\s*auth\.uid\(\)\s*=\s*(id|profile_id)\s*\)(\s*with check\s*\(\s*auth\.uid\(\)\s*=\s*(id|profile_id)\s*\))?\s*;$/;
  for (const [key, p] of survivingPolicies()) {
    const table = key.split("::")[0].replace(/^public\./, "");
    if (table !== "profiles" && table !== "prompt_answers") continue;
    const text = p.text.replace(/\s+/g, " ").trim();
    if (ownOnly.test(text)) continue;
    const both =
      /profile_is_live\(\s*auth\.uid\(\)\s*\)/.test(text) &&
      /profile_is_live\(\s*(prompt_answers\.profile_id|id)\s*\)/.test(text);
    if (!both) hits.push(`${p.file} — policy ${key} shows other members without the live guard`);
  }
  return hits;
});

checkOnce("feed, inbox count and photos refuse a member who isn't live", () => {
  const hits = [];
  for (const fn of ["build_daily_feed", "unread_count"]) {
    const f = latestFunction(fn);
    if (!f) hits.push(`${fn}() is missing`);
    else if (!/assert_live\(/.test(f.body)) hits.push(`${f.file} — ${fn}() never calls assert_live`);
  }
  const feed = latestFunction("build_daily_feed");
  if (feed && !/p_profile_id is distinct from auth\.uid\(\)/.test(feed.body)) {
    hits.push(`${feed.file} — build_daily_feed() does not refuse another member's feed`);
  }
  if (feed && !/profile_is_live\(p\.id\)/.test(feed.body)) {
    hits.push(`${feed.file} — build_daily_feed() can place a profile that isn't live`);
  }
  const photos = latestFunction("can_see_photos");
  if (
    !photos ||
    !/profile_is_live\(p_viewer\)/.test(photos.body) ||
    !/profile_is_live\(p_owner\)/.test(photos.body)
  ) {
    hits.push("can_see_photos() does not require both viewer and owner to be live");
  }
  return hits;
});

// The definition itself is the ruling: phone, Verified Real, four photos,
// a face-matched main photo. Loosening any of them is a product decision.
checkOnce("a live profile means phone, Verified Real, 4 photos and a matched main photo", () => {
  const live = latestFunction("profile_is_live");
  const min = latestFunction("min_live_photos");
  if (!live) return "profile_is_live() is missing";
  const hits = [];
  if (!/phone_verified_at is not null/.test(live.body)) hits.push("phone is not required");
  if (!/stage in \('verified_real', 'id_confirmed'\)/.test(live.body)) hits.push("Verified Real is not required");
  if (!/face_match = 'matched'/.test(live.body)) hits.push("a face-matched main photo is not required");
  if (!/>= min_live_photos\(\)/.test(live.body)) hits.push("the photo minimum is not applied");
  if (!min || !/select 4::smallint/.test(min.body)) hits.push("min_live_photos() is not 4");
  return hits.map((h) => `${live.file} — ${h}`);
});

// A member who could write their own `stage` or main-photo pointer could
// make themselves live. Those columns are server-owned.
checkOnce("members cannot write their own verification or live state", () => {
  const fn = latestFunction("protect_server_owned_profile_state");
  if (!fn) return "protect_server_owned_profile_state() is missing";
  const missing = ["stage", "phone_verified_at", "liveness_verified_at", "main_photo_id", "pending_main_photo_id"]
    .filter((c) => !new RegExp(`new\\.${c} is distinct from old\\.${c}`).test(fn.body));
  const face = latestFunction("protect_face_match");
  if (!face || !/new\.face_match is distinct from old\.face_match/.test(face.body)) {
    missing.push("face_match");
  }
  return missing.length ? `${fn.file} — client can still write ${missing.join(", ")}` : [];
});

// --- Coins are not a "wallet" ---------------------------------------------
//
// Decided 2026-10-05: never say "wallet" in UI copy. Coins are a promise
// between two people, not money Toastly holds — "wallet" implies custody and
// cash-out. Checked across code, copy AND file paths, because a route segment
// is copy too: members see it in the address bar.
check("UI never says 'wallet'", (s, f) => {
  const p = posix(f);
  if (!/^(app|components|lib)\//.test(p)) return false;
  if (/wallet/i.test(p)) return "a route or file is named wallet";
  const hit = /wallet/i.exec(s);
  return hit ? `"${s.slice(Math.max(0, hit.index - 30), hit.index + 20).trim()}"` : false;
});

// --- Marital status is never presented as verifiable ---------------------
check("no marital-status verification", (s) =>
  /marital_status_verified|verified_single|maritalStatusVerified/i.test(s),
);

// --- Report categories ---------------------------------------------------
check("'user is married' is a first-class report reason", (s) => {
  if (!/create type report_reason/.test(s)) return false;
  return /user_is_married/.test(s) ? false : "missing from report_reason enum";
});

console.log("");
if (failures.length) {
  console.log("CONSTRAINT VIOLATIONS:\n");
  for (const f of failures) {
    console.log(`  ${f.name}`);
    for (const h of f.hits) console.log(`      ${h}`);
  }
  process.exit(1);
}
console.log("all product constraints hold");

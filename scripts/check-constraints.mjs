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

// --- Profile photos (PRD §5.1.2, Prompt 14) -------------------------------
//
// The selfie taken for a main-photo check goes to Smile ID and nowhere
// else: Toastly keeps only the outcome, never the image, a score or a face
// template.
check("selfies are passed through, never stored", (s, f) => {
  if (!/\.(tsx?)$/.test(f) || !/selfie/i.test(s)) return false;
  const code = stripComments(s, f);
  const hit =
    /\.upload\([^)]*selfie|selfie[^;\n]*\.upload\(|\.insert\([^)]*selfie|selfie_(url|path|image_path)|livenessFrames[^;\n]*\.upload\(/i.exec(
      code,
    );
  return hit ? `selfie written somewhere: ${hit[0].slice(0, 60)}` : false;
});

check("face-match records keep outcomes only", (s, f) => {
  if (!f.endsWith(".sql") || !/create table public\.face_match_jobs/.test(s)) return false;
  const table = /create table public\.face_match_jobs \(([\s\S]*?)\n\);/.exec(s);
  if (!table) return "face_match_jobs definition not found";
  const leak = /\b(score|confidence|similarity|image|selfie|template|embedding|vector)\w*/i.exec(table[1]);
  return leak ? `face_match_jobs stores "${leak[0]}"` : false;
});

check("'these photos aren't them' is a first-class report reason", (s, f) => {
  if (posix(f) !== "lib/safety.ts") return false;
  return /value: "photos_not_them"/.test(s) ? false : "missing from REPORT_REASONS";
});

checkOnce("'these photos aren't them' exists in the database enum", () =>
  MIGRATIONS.some(({ sql }) => /alter type report_reason add value[^;]*'photos_not_them'/.test(sql))
    ? []
    : "no migration adds photos_not_them to report_reason",
);

checkOnce("photos: four to go live, six at most", () => {
  const max = latestFunction("max_profile_photos");
  const hits = [];
  if (!max || !/select 6::smallint/.test(max.body)) hits.push("max_profile_photos() is not 6");
  const editor = "app/(app)/photos/photos-editor.tsx";
  if (fs.existsSync(editor)) {
    const src = fs.readFileSync(editor, "utf8");
    if (!/const MIN = 4;/.test(src)) hits.push(`${editor} — MIN is not 4`);
    if (!/const MAX = 6;/.test(src)) hits.push(`${editor} — MAX is not 6`);
  }
  return hits;
});

// PRD §5.1.2 and the §5.9 do-not-build list: no camera-roll or photo-library
// scanning, no AI attractiveness scoring, no AI photo enhancement.
check("no photo-library scanning, attractiveness scoring or AI enhancement", (s, f) => {
  const code = stripStrings(stripComments(s, f));
  const hit =
    /\b(attractiveness\w*|beautyScore|faceScore|hotness\w*|rateFace\w*|enhancePhoto\w*|beautify\w*|faceRetouch\w*|showDirectoryPicker|cameraRoll\w*|scanLibrary\w*|photoLibrary\w*)\b/i.exec(
      code,
    );
  return hit ? `found ${hit[0]}` : false;
});

// --- Download your data, delete your account (privacy policy §8, §10) -----
//
// Both are promised and both are always open: no plan, no live profile.
check("data download and account deletion read no tier", (s, f) => {
  if (!/^app\/\(app\)\/account\//.test(posix(f))) return false;
  return /current_tier|capabilities\(|can_read_inbox|\btier\b|requireLiveProfile/i.test(stripStrings(s))
    ? "the account route reads a plan or the live-profile guard"
    : false;
});

checkOnce("the export keeps the locked inbox locked and the Sentinel log out", () => {
  const fn = latestFunction("export_my_data");
  if (!fn) return "export_my_data() is missing";
  const hits = [];
  if (!/can_read_inbox\(/.test(fn.body)) hits.push("the export doesn't check can_read_inbox");
  const locked = /else\s*\(select coalesce\(jsonb_agg[\s\S]*?\)\s*end,/.exec(fn.body);
  if (!locked || !/m\.sender_id = me\.id/.test(locked[0])) {
    hits.push("the Starter branch can return messages the member didn't send");
  }
  if (/trust_events|integrity_reviews/.test(fn.body)) hits.push("the export reads the Sentinel or integrity log");
  if (/gist_outcomes[^)]*profile_id\s*<>/.test(fn.body)) hits.push("the export reads the other side of a Gist outcome");
  return hits.map((h) => `${fn.file} — ${h}`);
});

checkOnce("deleting an account keeps payment and safety records, de-linked", () => {
  const hits = [];
  for (const fk of ["payments_profile_id_fkey", "reports_reporter_id_fkey", "reports_reported_id_fkey"]) {
    let last = null;
    for (const { sql } of MIGRATIONS) {
      for (const m of sql.matchAll(new RegExp(`add constraint ${fk}[\\s\\S]*?;`, "g"))) last = m[0];
    }
    if (!last || !/on delete set null/.test(last)) hits.push(`${fk} does not survive deletion (needs on delete set null)`);
  }
  return hits;
});

// --- Verification consent wording ------------------------------------------
//
// The consent a member agrees to must be the approved wording, word for word
// (Toastly-Verification-Consent-Wording.md), and stored with its version.
// The bracketed retention line stays visible until Smile ID confirms it.
checkOnce("consent screens show the approved wording, exactly", () => {
  const doc = "Toastly-Verification-Consent-Wording.md";
  const lib = "lib/consent.ts";
  if (!fs.existsSync(doc)) return `${doc} is missing`;
  if (!fs.existsSync(lib)) return `${lib} is missing`;
  const plain = (s) => s.replace(/\*\*/g, "").replace(/\\'/g, "'").replace(/\s+/g, " ").trim();
  const quoted = fs
    .readFileSync(doc, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.startsWith("> ") && !/^> \*\*\[/.test(l) && !/^> \*\*[^*]+\*\*$/.test(l))
    .map((l) => plain(l.slice(2).replace(/^☐ /, "")));
  const libText = plain(fs.readFileSync(lib, "utf8").replace(/"\s*,?\s*\n\s*"/g, " "));
  const missing = quoted.filter((q) => q && !libText.includes(q));
  const hits = missing.map((q) => `${lib} — not shown verbatim: "${q.slice(0, 70)}…"`);
  if (!/\[Purpose of retention, and any way to request earlier deletion — to be confirmed with Smile ID\.\]/.test(libText)) {
    hits.push(`${lib} — the bracketed retention line must stay visible until Smile ID confirms it`);
  }
  return hits;
});

checkOnce("every verification check records consent, with its version, first", () => {
  const hits = [];
  const rules = [
    ["app/(app)/verify/actions.ts", "startSelfieCheck", "verification_selfie"],
    ["app/(app)/verify/actions.ts", "submitIdNumber", "id_check"],
    ["app/(app)/photos/actions.ts", "checkMainPhoto", "replace_main_photo"],
  ];
  for (const [file, fn, kind] of rules) {
    if (!fs.existsSync(file)) { hits.push(`${file} missing`); continue; }
    const src = stripComments(fs.readFileSync(file, "utf8"), file);
    const body = serverActions(src).find((a) => a.name === fn)?.body;
    if (!body) { hits.push(`${file} — ${fn}() missing`); continue; }
    const at = body.indexOf(`recordConsent(supabase, user.id, "${kind}"`);
    if (at < 0) { hits.push(`${file} — ${fn}() never records "${kind}" consent`); continue; }
    // The first thing that ACTS: a provider call, a recorded outcome, or the
    // ID stand-in writing the stage (`stage: "id_confirmed"`, not a read of it).
    const vendor = body.search(/submitCompare\(|submitAuthentication\(|record_onboarding_check|record_main_photo_match|stage: "id_confirmed"/);
    if (vendor >= 0 && vendor < at) hits.push(`${file} — ${fn}() acts before recording consent`);
  }
  const record = fs.existsSync("lib/consent-record.ts") ? fs.readFileSync("lib/consent-record.ts", "utf8") : "";
  if (!/version: CONSENT\[kind\]\.version/.test(record)) hits.push("lib/consent-record.ts — the version isn't the server's own");
  return hits;
});

// --- The human review queue (PRD §9, CLAUDE.md, 0018) ----------------------
//
// A person decides; every decision is logged with who, when and why; nothing
// restricts or removes an account on its own; reviewers never see message
// bodies, Gist content, genotype or raw biometric data.
checkOnce("every review-console page and action is staff-only", () =>
  appFiles
    .filter((f) => /^app\/\(staff\)\//.test(f))
    .filter((f) => entryKind(f, stripComments(fs.readFileSync(f, "utf8"), f)))
    .flatMap((f) => {
      const src = stripComments(fs.readFileSync(f, "utf8"), f);
      if (entryKind(f, src) === "actions") {
        return serverActions(src)
          .filter((a) => !/\brequireStaff\s*\(/.test(a.body))
          .map((a) => `${f} — ${a.name}() isn't staff-only`);
      }
      return /\brequireStaff\s*\(/.test(src) ? [] : [`${f} — no requireStaff()`];
    }),
);

checkOnce("review functions are staff-only and decisions are logged first", () => {
  const hits = [];
  for (const fn of ["review_queue", "review_case_detail", "review_history"]) {
    const f = latestFunction(fn);
    if (!f || !/if not is_staff\(\) then raise/.test(f.body)) hits.push(`${fn}() doesn't refuse non-staff`);
  }
  const d = latestFunction("decide_case");
  if (!d) return "decide_case() is missing";
  if (!/from staff_members where user_id = auth\.uid\(\)/.test(d.body)) hits.push("decide_case() doesn't check the caller is staff");
  const logAt = d.body.indexOf("insert into review_decisions (case_id, staff_id, staff_name, action, note)\n  values (c.id, v_me.user_id, v_me.display_name, p_action");
  const actAt = d.body.search(/update profiles set standing|record_main_photo_match|record_onboarding_check|block_identifiers_of/);
  if (logAt < 0) hits.push("decide_case() doesn't log the decision");
  else if (actAt >= 0 && actAt < logAt) hits.push("decide_case() acts before logging");
  if (!/interval '2 years'/.test(d.body)) hits.push("removal doesn't keep the blocklist for two years");
  const trig = MIGRATIONS.some(({ sql }) => /before update or delete on public\.review_decisions/.test(sql));
  if (!trig) hits.push("review_decisions isn't append-only");
  return hits;
});

checkOnce("only a reviewer's decision changes an account's standing", () => {
  const hits = [];
  for (const { file, sql } of MIGRATIONS) {
    for (const m of sql.matchAll(/create or replace function public\.(\w+)\s*\([\s\S]*?\$\$([\s\S]*?)\$\$/g)) {
      if (m[1] === "decide_case") continue;
      if (/set standing\s*=\s*'(restricted|removed)'/.test(m[2])) hits.push(`${file} — ${m[1]}() restricts or removes an account`);
    }
  }
  return hits;
});

checkOnce("reviewers never see message text, Gist content, genotype or selfies", () => {
  const f = latestFunction("review_case_detail");
  if (!f) return "review_case_detail() is missing";
  const leak = /\bm\.body\b|messages\.body|\bbody\b|transcript|audio|genotype|selfie_image|liveness_images|wants_to_continue|phone_hash|fingerprint/i.exec(f.body);
  return leak ? `${f.file} — review evidence reads "${leak[0]}"` : [];
});

// --- The coin balance (PRD §5.5, Prompt 17, 0019) --------------------------
//
// Replaces the stake-credit check: the "future-deposit-only credit" model is
// superseded. Coins are a closed loop — never withdrawn, refunded as cash or
// sent between members by choice; they move between members only as a stake
// outcome, and Toastly keeps none of it.
checkOnce("coins are never withdrawable, refundable as cash or sent between members", () => {
  // Replay creates and drops, so only functions that survive are judged.
  const live = new Map();
  for (const { file, sql } of MIGRATIONS) {
    for (const m of sql.matchAll(/(create or replace|drop) function (?:if exists )?public\.(\w+)/g)) {
      if (m[1] === "drop") live.delete(m[2]);
      else live.set(m[2], file);
    }
  }
  return [...live]
    .filter(([name]) => /withdraw|payout|cash_?out|refund_coins|send_coins|transfer_coins|gift_coins/i.test(name))
    .map(([name, file]) => `${file} — ${name}() moves coins out of the closed loop`);
});

checkOnce("a stake outcome pays only the two members — Toastly keeps nothing", () => {
  const f = latestFunction("settle_commitment");
  if (!f) return "settle_commitment() is missing";
  const targets = [...f.body.matchAll(/insert into coin_ledger[^;]*?values \((\w+(?:\.\w+)?)/g)].map((m) => m[1]);
  const bad = targets.filter((t) => !["c.member_a", "c.member_b", "v_present"].includes(t));
  return bad.length ? `${f.file} — settle_commitment() credits ${bad.join(", ")}` : [];
});

checkOnce("safety always returns the stake", () => {
  const hits = [];
  const cancel = latestFunction("cancel_date");
  if (!cancel || !/if p_safety or[\s\S]*?settle_commitment\(c\.id, 'cancelled'\)/.test(cancel.body)) {
    hits.push("a safety cancellation doesn't return the stakes");
  }
  const answer = latestFunction("answer_no_show");
  if (!answer || !/p_answer = 'unsafe' then[\s\S]*?settle_commitment\(c\.id, 'cancelled'\)/.test(answer.body)) {
    hits.push("'I didn't feel safe' doesn't return the stake");
  }
  if (!MIGRATIONS.some(({ sql }) => /after insert on public\.reports\s+for each row execute function public\.safety_report_returns_stakes/.test(sql))) {
    hits.push("a safety report doesn't return the reporter's stake");
  }
  return hits;
});

checkOnce("only purchased coins are staked, and coins never pay a Diaspora plan", () => {
  const hits = [];
  const stake = latestFunction("stake_date");
  if (!stake || !/stakeable_balance\(v_me\) < c\.stake_coins/.test(stake.body)) hits.push("stake_date() doesn't check purchased coins");
  if (!MIGRATIONS.some(({ sql }) => /constraint promotional_never_staked/.test(sql))) hits.push("bonus coins can enter a stake");
  const price = latestFunction("plan_naira_price");
  if (!price || /diaspora/.test(price.body)) hits.push("a Diaspora plan has a naira price, so coins could pay it");
  const quote = latestFunction("coin_checkout_quote");
  if (!quote || !/coins_naira_only/.test(quote.body)) hits.push("coin_checkout_quote() doesn't refuse a Diaspora plan");
  return hits;
});

// PRD §11: held from production until the legal check confirms a closed-loop
// coin balance is outside CBN e-money licensing.
checkOnce("coin and date actions are held from production until legal clears", () => {
  const hits = [];
  for (const [file, fns] of [
    ["app/(app)/coins/actions.ts", ["buyCoins", "payPlanWithCoins"]],
    ["app/(app)/dates/actions.ts", ["createDate", "stakeDate"]],
  ]) {
    if (!fs.existsSync(file)) { hits.push(`${file} missing`); continue; }
    const acts = serverActions(stripComments(fs.readFileSync(file, "utf8"), file));
    for (const fn of fns) {
      const a = acts.find((x) => x.name === fn);
      if (!a || !/if \(!coinsOpen\(\)\) return/.test(a.body)) hits.push(`${file} — ${fn}() isn't held`);
    }
  }
  const lib = fs.existsSync("lib/coins.ts") ? fs.readFileSync("lib/coins.ts", "utf8") : "";
  if (!/process\.env\.COINS_LEGAL_CLEARED === "true"/.test(lib)) hits.push("lib/coins.ts — coinsOpen() doesn't wait for COINS_LEGAL_CLEARED");
  return hits;
});

// Arranging and staking a date need a live profile (0013). Checking in,
// cancelling and answering a no-show on a date ALREADY arranged are the
// only exemptions — a stake must never pressure anyone, and a safety exit
// is never blocked — and they refuse only a member a reviewer removed.
checkOnce("dates: only attendance and safety are exempt from the live guard", () => {
  const file = "app/(app)/dates/actions.ts";
  if (!fs.existsSync(file)) return [];
  const acts = serverActions(stripComments(fs.readFileSync(file, "utf8"), file));
  const hits = [];
  for (const a of acts) {
    const strict = /if \(!live\.live\) return \{ error: notLiveError\(live\) \};/.test(a.body);
    const exempt = ["checkIn", "cancelDate", "answerNoShow"].includes(a.name);
    if (!exempt && !strict) hits.push(`${file} — ${a.name}() isn't behind the live guard`);
    if (exempt && strict) hits.push(`${file} — ${a.name}() blocks attendance or a safety exit`);
  }
  return hits;
});

// PRD §5.5 rule 1 and the warm framing: none of these in coin or date copy.
// "Bank transfer" names a way to pay Paystack — the one approved use, kept
// in lib/coins.ts and nowhere else (flagged for confirmation).
check("coin and date copy never says escrow, transfer, cash out or fine", (s, f) => {
  const p = posix(f);
  if (!/^(app|components|lib)\//.test(p) || !/\.(tsx?)$/.test(p)) return false;
  if (!/coins?|dates?|stake/i.test(p)) return false;
  const text = (stringsIn(s).join(" ") + " " + s.replace(/<[^>]+>/g, " ")).replace(/Bank transfer/g, "");
  const hit = /\bescrow\b|\btransfer(s|red|ring)?\b|\bcash(ed)? out\b|\bfined?\b/i.exec(stripComments(text, f));
  return hit ? `"${hit[0]}"` : false;
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

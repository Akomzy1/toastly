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

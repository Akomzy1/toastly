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
// shapes rather than the bare word. `\bon\w*Swipe` catches onSwipe and
// onSwipeLeft, which the first version missed (found 9 October 2026).
const SWIPE_MECHANIC =
  /\bon\w*Swipe\w*|\bSwipe[A-Z]\w*|\bswipe[A-Z]\w*|\buse\w*Swipe\w*|\bswipeable\b|from\s+["'][^"']*(swipe|tinder-card|use-gesture)/i;

// The one exception (owner, 9 October 2026): swiping the Gist question card
// to the next question, in components/gist/deck-card.tsx only. Never in
// matching, the feed, profiles or anywhere else.
check("no swipe mechanic or swipe gesture handling", (s, f) =>
  !/components[\\/]gist[\\/]deck-card\.tsx$/.test(f) && SWIPE_MECHANIC.test(stripStrings(s)),
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

// --- Genotype (PRD §5.2) --------------------------------------------------
//
// Health data, and the strictest-handled field in the product. The only code
// allowed to touch its storage is the display path below. Matching, ranking,
// the feed, the Sentinel, the AriyaPlanner brief, analytics or a model
// reading it is a bug, and this fails the build.
const GENOTYPE_DISPLAY_PATH = [
  "supabase/migrations/0014_genotype.sql",
  // can_see_genotype's "all matches" rule, and profile_for handing a
  // permitted viewer the value to display — and nothing else (checked below).
  "supabase/migrations/0033_fields_for_the_viewer.sql",
  "lib/genotype.ts",
  "lib/genotype-actions.ts",
  "components/genotype/",
];
const onGenotypePath = (f) => {
  const p = f.replace(/\\/g, "/");
  return GENOTYPE_DISPLAY_PATH.some((a) => (a.endsWith("/") ? p.startsWith(a) : p === a));
};
// String literals are deliberately NOT stripped for TS: an RPC name is one.
const GENOTYPE_STORAGE =
  /\b(genotypes|genotype_consents|get_genotype_for|get_own_genotype|set_genotype\w*|record_genotype_consent|delete_genotype|can_see_genotype|genotype_key)\b/;

check("genotype is read only on the display path", (s, f) => {
  if (onGenotypePath(f)) return false;
  const hit = f.endsWith(".sql") ? /\bgenotype\w*/i.exec(s) : GENOTYPE_STORAGE.exec(s);
  return hit ? `found ${hit[0]} outside the display path` : false;
});

// 0033 is on the display path for two functions only.
check("0033 touches genotype only in can_see_genotype and profile_for", (s, f) => {
  if (!/0033_fields_for_the_viewer\.sql$/.test(f.replace(/\\/g, "/"))) return false;
  let rest = s;
  for (const name of ["can_see_genotype", "profile_for"]) {
    rest = rest.replace(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`), "");
    rest = rest.replace(new RegExp(`revoke all on function public\\.${name}\\([^;]*;`, "g"), "");
  }
  const hit = /\bgenotype\w*/i.exec(rest);
  if (hit) return `found ${hit[0]} outside can_see_genotype and profile_for`;
  const pf = (s.match(/create or replace function public\.profile_for\([\s\S]*?\n\$\$;/) ?? [""])[0];
  const uses = [...pf.matchAll(/\bgenotype\w*/gi)].map((m) => m[0]);
  // Only the value a permitted viewer may see, from the one client-facing read.
  return uses.every((u) => u === "genotype" || u === "get_genotype_for") && /'genotype', get_genotype_for\(p\.id\)/.test(pf)
    ? false
    : `profile_for reads genotype other than through get_genotype_for: ${uses.join(", ")}`;
});

check("genotype has no compatibility verdict and no verified badge", (s, f) => {
  if (!onGenotypePath(f)) return false;
  const code = f.endsWith(".sql") ? s : stripStrings(s);
  const hit =
    /\b\w*compatib\w*\s*[(:=]|\bverdict\w*|\bis_?verified\b|\bgenotype_?verified\w*|\bverified_?genotype\w*|\b(risk|carrier)_?(score|match|level)\w*/i.exec(code) ||
    /variant=["']verified["']/.exec(s);
  return hit ? `found ${hit[0]}` : false;
});

check("genotype is stored encrypted, behind no client policy or trigger", (s, f) => {
  if (!f.endsWith(".sql") || !/create table public\.genotypes/.test(s)) return false;
  const table = /create table public\.genotypes \(([\s\S]*?)\n\);/.exec(s)?.[1] ?? "";
  if (!/ciphertext bytea not null/.test(table)) return "no ciphertext column";
  if (/\b(value|genotype|plaintext)\s+(text|varchar|char)/i.test(table)) {
    return "a plaintext genotype column exists";
  }
  if (/create policy[^;]*on public\.(genotypes|genotype_consents)/i.test(s)) {
    return "a client policy exposes a genotype table";
  }
  if (/create trigger[^;]*on public\.(genotypes|genotype_consents)/i.test(s)) {
    return "a trigger watches genotype — event streams must never see it";
  }
  if (!/revoke all on function public\.genotype_key\(\) from public, anon, authenticated/.test(s)) {
    return "the key function is callable by clients";
  }
  if (!/revoke all on function public\.can_see_genotype\(uuid, uuid\) from public, anon, authenticated/.test(s)) {
    return "the permission check is callable by clients";
  }
  return false;
});

check("the Sentinel and analytics guards reject genotype", (s, f) => {
  const p = f.replace(/\\/g, "/");
  if (p.endsWith("lib/analytics.ts")) {
    return /FORBIDDEN_PROPERTIES[\s\S]*?"genotype"[\s\S]*?\];/.test(s)
      ? false
      : "analytics does not drop a genotype property";
  }
  if (p.endsWith("0014_genotype.sql")) {
    return /function public\.trust_meta_is_clean[\s\S]*?'genotype'/.test(s)
      ? false
      : "the Sentinel metadata guard does not reject genotype";
  }
  return false;
});

// --- Relationship history is enforced where it lives ----------------------
//
// "Revealed when we match" was promised in the profile form and enforced
// nowhere: profiles rows are readable by every verified member. 0013 moves
// history into its own table behind RLS.
check("relationship history is enforced by RLS, not by omission", (s, f) => {
  if (!f.endsWith(".sql") || !/create table public\.profile_history/.test(s)) return false;
  if (!/drop column history,/.test(s) || !/drop column has_children,/.test(s)) {
    return "history still lives on the readable profiles table";
  }
  if (!/alter table public\.profile_history enable row level security/.test(s)) {
    return "profile_history has no RLS";
  }
  if (!/for select using \(history_visible_to_me\(profile_id, visibility\)\)/.test(s)) {
    return "no select policy enforcing the owner's choice";
  }
  if (!/revoke all on function public\.are_matched\(uuid, uuid\) from public, anon, authenticated/.test(s)) {
    return "are_matched is callable by clients";
  }
  return false;
});

check("relationship history is never read from profiles", (s, f) => {
  if (f.endsWith(".sql")) return false;
  return /from\(["']profiles["']\)[^;]*?select\(["'][^"']*\b(history|has_children|history_visibility)\b/.test(s)
    ? "a profiles query selects relationship history"
    : false;
});

// The consent wording the app shows must be the one the database accepts.
{
  const name = "genotype consent version matches between app and database";
  let hit = null;
  try {
    const ts = fs.readFileSync("lib/genotype.ts", "utf8");
    const sql = fs.readFileSync("supabase/migrations/0014_genotype.sql", "utf8");
    const app = /GENOTYPE_CONSENT_VERSION = "([^"]+)"/.exec(ts)?.[1];
    const db = /function public\.genotype_consent_version\(\)[\s\S]*?select '([^']+)'/.exec(sql)?.[1];
    if (!app || !db) hit = "version not found in lib/genotype.ts or migration 0014";
    else if (app !== db) hit = `app says ${app}, database says ${db}`;
  } catch (e) {
    hit = String(e.message);
  }
  if (hit) failures.push({ name, hits: [hit] });
  console.log(`${hit ? "FAIL" : "ok  "}  ${name}`);
}

// --- The privacy policy is withheld while it has placeholders --------------
//
// A legal page must not go live reading "[DATE]". The page 404s and the
// genotype consent link disappears while any [placeholder] remains.
check("privacy policy is withheld while placeholders remain", (s, f) => {
  const p = f.replace(/\\/g, "/");
  if (p.endsWith("lib/privacy-content.ts")) {
    return /export const PRIVACY_PUBLISHED = PRIVACY_PLACEHOLDERS\.length === 0/.test(s)
      ? false
      : "PRIVACY_PUBLISHED is not derived from the placeholder scan";
  }
  if (p.endsWith("app/(marketing)/privacy/page.tsx")) {
    return /if \(!PRIVACY_PUBLISHED[^)]*\) notFound\(\)/.test(s)
      ? false
      : "the privacy page renders while unpublished";
  }
  if (p.endsWith("lib/genotype.ts")) {
    return /GENOTYPE_PRIVACY_URL[^=]*= PRIVACY_PUBLISHED \?/.test(s)
      ? false
      : "the consent step links to an unpublished privacy page";
  }
  return false;
});

// --- Date of birth is private, and 18+ is enforced by the database ---------
check("date of birth is private and adults-only", (s, f) => {
  if (f.endsWith(".sql")) {
    if (!/create table public\.profile_birthdates/.test(s)) return false;
    if (!/alter table public\.profiles drop column date_of_birth/.test(s)) {
      return "date of birth is still on the readable profiles table";
    }
    if (!/interval '18 years'/.test(s)) return "no 18+ rule in the database";
    if (!/create policy "own birthdate" on public\.profile_birthdates\s+for all using \(auth\.uid\(\) = profile_id\)/.test(s)) {
      return "profile_birthdates is not own-only";
    }
    return false;
  }
  // Stops at the next .from( so a separate query on the member's own
  // profile_birthdates row (in the same Promise.all) isn't mistaken for it.
  return /from\(["']profiles["']\)(?:(?!\.from\()[^;])*?select\(["'][^"']*\bdate_of_birth\b/.test(s)
    ? "a profiles query selects date_of_birth"
    : false;
});

// --- Deleting an account keeps only what the policy says, first ------------
check("account deletion keeps the required records before deleting", (s, f) => {
  if (!f.replace(/\\/g, "/").endsWith("lib/account-actions.ts")) return false;
  const keep = s.indexOf('rpc("prepare_account_deletion")');
  const del = s.indexOf("auth.admin.deleteUser(");
  if (keep < 0) return "deletion does not call prepare_account_deletion";
  if (del < 0) return "deletion does not delete the auth user";
  return keep < del ? false : "the account is deleted before its records are kept";
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

// SMS has exactly two senders (lib/sms.ts, "what SMS is for"): emergency
// contacts and panic alerts (lib/emergency-actions.ts), and the on-call
// staff alert for an urgent Toastly Help ticket (lib/support-alerts.ts).
check("SMS is sent only for emergency contacts and on-call staff alerts", (s, f) => {
  const p = f.replace(/\\/g, "/");
  if (p.endsWith("lib/sms.ts") || p.endsWith("lib/emergency-actions.ts") || p.endsWith("lib/support-alerts.ts")) return false;
  return /@\/lib\/sms\b|from "\.\.?\/[^"]*sms"/.test(stripComments(s, f)) ? "a new SMS sender" : false;
});

// Staff alerts carry the ticket number, its urgency and a console link —
// never a name, a category or the member's words: the SMS and email bodies
// come only from alertSms / alertEmail / digestEmail, which take nothing else.
check("staff alerts carry no member data", (s, f) => {
  if (!f.replace(/\\/g, "/").endsWith("lib/support-alerts.ts")) return false;
  const code = stripComments(s, f);
  const sms = [...code.matchAll(/sendSms\(([^,]+),\s*([^)]+\))/g)].map((m) => m[2]);
  if (!sms.length || sms.some((b) => !/^alertSms\(t,/.test(b.trim()))) return "an SMS body isn't alertSms(t, …)";
  const mails = [...code.matchAll(/sendEmail\(\{([^}]*)\}\)/g)].map((m) => m[1]);
  if (!mails.length || mails.some((b) => !/^\s*to: inbox\(\),\s*\.\.\.(alertEmail\(t,|digestEmail\(rows,)/.test(b))) return "an alert email isn't built by alertEmail / digestEmail";
  if (!/const t: AlertTicket = \{ reference: ticket\.reference, urgency: ticket\.urgency \}/.test(code)) return "the alert ticket isn't narrowed to reference and urgency";
  return false;
});

const supportFnBody = (src, name) => (src.match(new RegExp("function public\\." + name + "\\([\\s\\S]*?\\n\\$\\$;")) ?? [])[0] ?? "";
// The Support tab shows the Toastly Help conversation and nothing else of the
// member's: no member-to-member messages, Gist data, photos or genotype.
check("the Support tab reads only Toastly Help's own records", (s, f) => {
  if (!f.endsWith(".sql")) return false;
  const names = [...s.matchAll(/create or replace function public\.(staff_support_[a-z_]+|_support_transcript|file_support_ticket)\(/g)].map((m) => m[1]);
  for (const n of names) {
    const hit = /\b(from|join)\s+(public\.)?(messages|replies|threads|message_attachments|gist_\w+|profile_photos|member_genotypes|genotype\w*|verification_images|profile_history|prompt_answers)\b/i.exec(supportFnBody(s, n));
    if (hit) return `${n} reads ${hit[3]}`;
  }
  return false;
});

// Vercel Hobby (owner, 10 October 2026: no Pro for now) runs a cron at most
// once a day, and refuses a deploy that asks for more. Anything more frequent
// runs in the database (pg_cron), like the urgent re-alert (0042).
{
  const name = "Vercel crons run at most once a day (Hobby plan)";
  const crons = JSON.parse(fs.readFileSync("vercel.json", "utf8")).crons ?? [];
  const hits = crons
    .filter((c) => !/^\d{1,2} \d{1,2} \* \* [*\d,-]+$/.test(c.schedule))
    .map((c) => `vercel.json — ${c.path} runs "${c.schedule}", more often than daily`);
  if (hits.length) failures.push({ name, hits });
  console.log(`${hits.length ? "FAIL" : "ok  "}  ${name}`);
}

// The company (owner, 10 October 2026): "Toastly, operated by Ariya Planner
// Ltd" — the name in privacy policy section 1. "Toastly Technologies Ltd"
// doesn't exist and must not appear anywhere.
check("the operator is Ariya Planner Ltd, never Toastly Technologies", (s) =>
  /Toastly\s+Technologies/i.test(s) ? "names Toastly Technologies" : false,
);

// Toastly Help's safety card always names Nigeria's 112 (owner, 10 October
// 2026): a member whose profile says abroad may be in Nigeria right now.
check("Toastly Help's safety card always names 112 for Nigeria", (s, f) => {
  if (!f.replace(/\\/g, "/").endsWith("components/help/help-panel.tsx")) return false;
  const hits = (s.match(/112 if you’re in Nigeria/g) ?? []).length;
  return hits >= 2 ? false : "the danger line or the self-harm line abroad doesn't name 112 for Nigeria";
});

// "Tonight on Toastly" (owner, 10 October 2026): hidden until 500 verified
// members, then live counts only. The card renders only what
// getTonightStats() returns (home_live_stats, 0043) — never a typed-in figure.
check("Tonight on Toastly shows live counts only, behind the threshold", (s, f) => {
  const p = f.replace(/\\/g, "/");
  if (p.endsWith("app/(marketing)/page.tsx")) {
    if (!/const tonight = await getTonightStats\(\)/.test(s)) return "the card isn't fed by getTonightStats()";
    if (!/\{tonight \? \(\s*<Reveal>[\s\S]*?Tonight on Toastly/.test(s)) return "the card isn't hidden when there are no stats";
    if (!/tonight\.map\(/.test(s) || /heroStats/.test(s)) return "the card renders figures that aren't live";
    return false;
  }
  if (p.endsWith("lib/home-content.ts")) return /heroStats/.test(s) ? "typed-in hero figures are back" : false;
  if (p.endsWith("lib/home-stats.ts")) {
    if (!/rpc\("home_live_stats"\)/.test(s)) return "not read from home_live_stats";
    return /value:\s*"/.test(s) ? "a typed-in figure" : false;
  }
  if (p.endsWith("0043_tonight_stats.sql")) {
    if (!/if v_verified < coalesce\(v_min, 500\) then\s*return null;/.test(s)) return "the counts aren't withheld below the threshold";
    if (!/\('tonight_min_verified_members', 500\)/.test(s)) return "the threshold isn't 500";
    return false;
  }
  return false;
});

// --- Blind report and block -----------------------------------------------
//
// The whole point is that the reporting member never learns who sent it. A
// function taking a sender id, or returning anything at all, hands the client
// something to read.
check("blind report and block disclose no sender", (s, f) => {
  if (!f.endsWith(".sql") || !/blind_report_locked/.test(s)) return false;
  // Each definition is checked on its own: a later migration may redefine one
  // (0025 marks blind reports) without the other.
  const defs = [
    /create or replace function public\.blind_report_locked\(([\s\S]*?)\)\s*returns\s+(\w+)/.exec(s),
    /create or replace function public\.blind_block_locked\(([\s\S]*?)\)\s*returns\s+(\w+)/.exec(s),
  ].filter(Boolean);
  if (!defs.length) return false;
  if (defs.some((d) => /uuid/i.test(d[1]))) return "a blind function takes a member id";
  if (defs.some((d) => d[2] !== "void")) return "a blind function returns something the client could read";
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
  const names = [...union[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  // Agent events are required by CLAUDE.md (metadata only) and counted apart.
  const funnel = names.filter((n) => !n.startsWith("agent_"));
  const agent = names.filter((n) => n.startsWith("agent_"));
  if (funnel.length > 6) return `${funnel.length} funnel events — keep the set small`;
  return agent.length > 4 ? `${agent.length} agent events — keep the set small` : false;
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
// Prompt 17 retired stake credits (0023 issues none), but rows from before
// it keep the guarantee, so the check stays on the file that defines them.
check("stake credits can never be withdrawable", (s, f) => {
  if (!f.endsWith(".sql") || !/coin_ledger/.test(s) || !/withdrawable/.test(s)) return false;
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
  if (!/LOCKED_COPY|lockedCopy/.test(s)) return false;
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

// --- Marital status is never presented as verifiable ---------------------
check("no marital-status verification", (s) =>
  /marital_status_verified|verified_single|maritalStatusVerified/i.test(s),
);

// --- Report categories ---------------------------------------------------
check("'user is married' is a first-class report reason", (s) => {
  if (!/create type report_reason/.test(s)) return false;
  return /user_is_married/.test(s) ? false : "missing from report_reason enum";
});

// --- Smile ID: secrets, outcome-only storage, held copy ------------------
//
// The API key mints tokens and checks callback signatures. It must never be
// reachable from the browser: no client file may touch it or the server
// library, and it must never be renamed into a NEXT_PUBLIC_ variable.
const isClient = (s) => /^\s*["']use client["']/.test(s);

check("Smile ID API key and server library stay server-side", (s, f) => {
  if (/NEXT_PUBLIC_SMILE/i.test(s)) return "NEXT_PUBLIC_ Smile ID variable";
  if (!isClient(s)) return false;
  if (/SMILE_ID_API_KEY|SMILE_ID_PARTNER_ID/.test(s)) return "client file reads a Smile ID secret";
  if (/from\s+["']@\/lib\/smile-id["']/.test(s)) return "client file imports lib/smile-id";
  return false;
});

// The callback reads status, reason, product, the job id, our nonce and —
// transiently, for the HMAC — the ID number. Nothing else from the record.
// Marital status above all: Toastly never verifies it (PRD §5.2.1).
check("Smile ID callback never reads identity-record PII", (s, f) => {
  if (!/smile-id[\/]callback/.test(f)) return false;
  const hit =
    /\b(full_name|first_name|last_name|other_names|date_of_birth|dob|photo_url|phone_number(_2)?|address(_unparsed)?|marital_status|gender|image_links|kyc_receipt|user_provided_info|antifraud|device_signals|document_link)\b/.exec(
      s,
    );
  return hit ? `reads ${hit[0]}` : false;
});

check("ID numbers are never stored — only a keyed HMAC", (s, f) => {
  if (!f.endsWith(".sql")) return false;
  return /\bid_number\b/i.test(s) ? "id_number appears in SQL" : false;
});

check("verification uses SmartSelfie and Biometric KYC only", (s) =>
  /enhanced_kyc|basic_kyc|enhanced_document|["']enhanced_kyc["']/i.test(stripComments(s, "x.ts"))
    ? "Enhanced or Basic KYC referenced"
    : false,
);

// HELD until Smile ID's retention terms are confirmed (user decision).
check("held Smile ID image-processing copy does not ship", (s, f) => {
  if (/uses your images only/i.test(s)) return "unconfirmed retention wording";
  if (!/SMILE_PROCESSING_SENTENCE/.test(s) || /export const SMILE_PROCESSING_SENTENCE/.test(s)) return false;
  return /SMILE_TERMS_CONFIRMED\s*\?/.test(s) ? false : "processing sentence rendered without the SMILE_TERMS_CONFIRMED gate";
});

check("Smile ID terms stay held until confirmed", (s, f) => {
  if (!/verification-copy\.ts$/.test(f)) return false;
  return /export const SMILE_TERMS_CONFIRMED = false;/.test(s)
    ? false
    : "SMILE_TERMS_CONFIRMED flipped — confirm Smile ID's retention terms, then update this check";
});

check("verification columns guarded from member writes", (s, f) => {
  if (!/0016_smile_id\.sql$/.test(f)) return false;
  return /create trigger guard_verification_columns/.test(s) && /liveness_verified_at is distinct/.test(s)
    ? false
    : "guard_verification_columns trigger missing";
});

check("Smile ID path reads no tier or entitlement", (s, f) => {
  if (!/smile-id|verification-view|components[\/]verify/.test(f)) return false;
  return /current_tier|entitlements|\btier\b/i.test(stripStrings(s));
});

// --- RLS: a policy must never query its own table ------------------------
// 0001's profiles policy did, and Postgres rejected every read of profiles
// with 42P17 (infinite recursion). Fixed in 0017. A policy that needs the
// viewer's own row calls a security-definer function instead.
{
  const all = files.filter((f) => f.endsWith(".sql")).sort();
  const latest = new Map();
  for (const f of all) {
    const src = fs.readFileSync(f, "utf8").replace(/--[^\n]*/g, "");
    for (const m of src.matchAll(/(?:drop policy if exists|create policy)\s+"([^"]+)"\s+on\s+(?:public\.)?(\w+)([\s\S]*?);/g)) {
      const key = `${m[2]}|${m[1]}`;
      if (/^drop/.test(m[0])) latest.delete(key);
      else latest.set(key, { file: f, table: m[2], body: m[3] });
    }
  }
  const hits = [...latest.values()]
    .filter((p) => new RegExp(`from\\s+(public\\.)?${p.table}\\b`).test(p.body))
    .map((p) => `${p.file} — policy on ${p.table} reads ${p.table}`);
  if (hits.length) failures.push({ name: "no RLS policy queries its own table", hits });
  console.log(`${hits.length ? "FAIL" : "ok  "}  no RLS policy queries its own table`);
}

// --- AI agents (PRD §5.9; CLAUDE.md agent rules) ---------------------------
const norm = (f) => f.replace(/\\/g, "/");
const isAgentFile = (f) =>
  /lib\/ai\/|lib\/concierge\/|lib\/answer-mirror\.ts$|app\/api\/help\//.test(norm(f));

check("Claude only — no second LLM vendor or hosted agent runtime", (s) => {
  const code = stripComments(s, "x.ts");
  if (/from\s+["'](openai|@openai\/|langchain|@langchain\/|ai\/openai|@ai-sdk\/openai)/.test(code)) return "imports another LLM vendor";
  if (/\.beta\.(agents|sessions|environments|deployments)\b/.test(code)) return "uses a vendor-hosted agent runtime";
  return false;
});

check("every model call goes through lib/ai/client.ts", (s, f) => {
  if (norm(f).endsWith("lib/ai/client.ts")) return false;
  return /new\s+Anthropic\s*\(/.test(stripComments(s, "x.ts")) ? "constructs its own Anthropic client" : false;
});

// The concierge may read status codes; it may never move money, change an
// account or read chats. Hand-offs are its structured answer, not a tool
// (owner, 9 October 2026): the server files the ticket.
check("Toastly Help tools are read-only", (s, f) => {
  if (!/lib\/concierge\/tools\.ts$/.test(norm(f))) return false;
  const code = stripComments(s, f);
  const names = (code.match(/CONCIERGE_TOOL_NAMES = \[([\s\S]*?)\]/) ?? [])[1] ?? "";
  const listed = [...names.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]).sort();
  const allowed = ["get_coin_balance", "get_subscription_status", "get_verification_status"];
  if (listed.join() !== allowed.join()) return `tool list changed: ${listed.join(", ")}`;
  if (/\.(insert|update|upsert|delete)\s*\(/.test(code)) return "a tool writes to the database";
  const rpcs = [...code.matchAll(/\.rpc\(\s*"([a-z_]+)"/g)].map((m) => m[1]);
  const okRpcs = ["current_tier", "coin_balance", "purchased_balance", "promo_balance"];
  const bad = rpcs.find((r) => !okRpcs.includes(r));
  if (bad) return `calls ${bad}`;
  if (/\.from\(\s*"(messages|replies|message_attachments|gist_sessions|threads)"/.test(code)) return "reads chats or Gist data";
  return false;
});

// Payloads are built from permitted fields; protected attributes, genotype,
// chats, Gist data, selfies and ID numbers never reach an agent.
check("agents never read protected attributes, chats or biometrics", (s, f) => {
  if (!isAgentFile(f)) return false;
  const code = stripComments(s, f);
  const sel = [...code.matchAll(/\.select\(\s*"([^"]*)"/g)].map((m) => m[1]).join(",");
  const hit = /\b(religion|tribe|languages|history|has_children|profession|education|genotype\w*|pool|city|diaspora\w*|date_of_birth|gender|display_name|bio|id_hash|job_id)\b/.exec(sel);
  if (hit) return `selects ${hit[1]}`;
  if (/\.from\(\s*"(messages|replies|message_attachments|gist_sessions|threads|profile_history|member_genotypes|genotype\w*|profile_birthdates|phone_identities)"/.test(code)) return "reads a forbidden table";
  if (/image_links|selfie_image|id_number/.test(code)) return "touches selfie or ID data";
  return false;
});

check("Answer Mirror returns only a fixed label — no free text", (s, f) => {
  if (!/lib\/answer-mirror\.ts$/.test(norm(f))) return false;
  const schema = (s.match(/FEEDBACK_SCHEMA = \{([\s\S]*?)\} as const;/) ?? [])[1];
  if (!schema) return "FEEDBACK_SCHEMA missing";
  const props = (schema.match(/properties:\s*\{([\s\S]*?)\},\s*required/) ?? [])[1] ?? "";
  const keys = [...props.matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]);
  if (keys.join() !== "feedback") return `schema fields: ${keys.join(", ")}`;
  if (!/enum:\s*\[\.\.\.FEEDBACK_LABELS\]/.test(props)) return "feedback is not an enum";
  if (!/additionalProperties:\s*false/.test(schema)) return "schema allows extra fields";
  if (!/keys\.length !== 1/.test(s)) return "response is not re-validated to a single key";
  return false;
});

check("AI is labelled at first contact; the pledge is shown", (s, f) => {
  const p = norm(f);
  if (p.endsWith("components/help/help-panel.tsx")) {
    return /Toastly Help is an AI assistant\./.test(s) ? false : "AI label missing from Toastly Help";
  }
  if (p.endsWith("components/profile/answer-editor.tsx")) {
    if (!/Toastly AI will never write a word for you\./.test(s)) return "pledge missing";
    return /AI feedback/.test(s) ? false : "AI feedback label missing";
  }
  return false;
});

// The assistant never files anything itself: it returns {handoff, category}
// and the server decides (owner, 9 October 2026; lib/help-escalation.ts).
check("the assistant never files a ticket itself", (s, f) => {
  if (!/lib\/concierge\//.test(norm(f))) return false;
  return /support_tickets|file_support_ticket|fileTicket/.test(stripComments(s, f)) ? "the assistant writes a ticket itself" : false;
});

// The server decides the hand-off: the keyword check runs before the model,
// an urgent hit never reaches the model, and the decision goes through
// decideHandoff (each category's floor; the higher of model and keyword).
check("Toastly Help hand-offs are decided on the server, keyword check first", (s, f) => {
  if (!/app\/api\/help\/route\.ts$/.test(norm(f))) return false;
  const code = stripComments(s, f);
  const k = code.indexOf("keywordCheck(message)");
  const m = code.indexOf("runHelp(");
  if (k < 0) return "no keyword check on the member's message";
  if (m < 0 || k > m) return "the keyword check doesn't run before the model";
  if (!/if \(keyword\?\.handoff !== "urgent"\)[\s\S]*?runHelp\(/.test(code)) return "an urgent keyword hit can still reach the model";
  if (!/decideHandoff\(/.test(code)) return "the hand-off isn't decided by decideHandoff";
  if (!/fileTicket\(/.test(code)) return "a hand-off doesn't file a ticket";
  return false;
});

// A member's tap is always honoured, but never pages the on-call phone:
// urgent comes only from the server's own decision.
check("a member's tap files a normal ticket, never an urgent one", (s, f) => {
  if (!/app\/api\/help\/handoff\/route\.ts$/.test(norm(f))) return false;
  const code = stripComments(s, f);
  if (!/fileTicket\([^)]*handoff: "normal"/.test(code)) return "the tap route doesn't file as normal";
  if (/handoff: "urgent"|"urgent"/.test(code)) return "the tap route can file urgent";
  return false;
});

// Crisis lines reach a member only once reviewed: through crisisLinesFor(),
// never the raw list.
check("crisis lines are shown only once reviewed", (s, f) => {
  const p = norm(f);
  if (p.endsWith("lib/crisis-lines.ts")) return /\.filter\(isReviewed\)/.test(s) ? false : "crisisLinesFor doesn't filter to reviewed lines";
  return /allCrisisLines\(|CRISIS_LINES\b/.test(stripComments(s, f)) ? "reads the unreviewed list" : false;
});

// --- Gist calls: voice first, 18 minutes kept by the server -----------------
// A token grants the camera only when video is already on in that Gist (both
// accepted; 0040) — never by plan alone, never at the start of a call.
check("Gist tokens grant the camera only while video is on", (s, f) => {
  if (!/app[\\/]api[\\/]gist[\\/]/.test(f)) return false;
  if (!/createGistToken/.test(s)) return false;
  return /canPublishVideo:\s*(false\b|clock\?\.video\?\.state === "on")/.test(stripComments(s, f))
    ? false
    : "a Gist token may grant camera rights without video being on";
});

check("the Gist clock is 18 minutes, server-kept, extendable once", (s, f) => {
  if (!/00(19_gist_clock|20_gist_invites)\.sql$/.test(f)) return false;
  const intervals = [...s.matchAll(/interval '(\d+) minutes'/g)].map((m) => m[1]);
  if (intervals.some((m) => m !== "18" && m !== "2" && m !== "5")) return `Gist intervals: ${intervals.join(", ")}`;
  if (!/create trigger guard_gist_timing/.test(s) && /0019/.test(f)) return "timing guard missing";
  if (/function public\.gist_extend/.test(s) && !/extended_at is not null then\s*raise/.test(s)) return "extension not limited to once";
  return false;
});

// Starter's Gist cap (decided 8 October 2026; PRD §7.1, 0035): it counts only
// a Gist the member STARTED, and only when the call CONNECTS. Accepting an
// invitation is free and never counts, so nothing checks the allowance on
// accepting, and the moment of connecting checks only the proposer's.
check("Starter Gists count only a Gist the member started, once it connects", (s, f) => {
  if (!/lib\/countries\.ts$/.test(f.replace(/\\/g, "/"))) return false; // run once
  const latest = (name) => {
    let body = "";
    for (const m of fs.readdirSync("supabase/migrations").filter((x) => /\.sql$/.test(x)).sort()) {
      const sql = fs.readFileSync(`supabase/migrations/${m}`, "utf8");
      const re = new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`, "g");
      for (const x of sql.matchAll(re)) body = x[0];
    }
    return body.replace(/--[^\n]*/g, "");
  };
  const count = latest("voice_gists_this_month");
  if (!/g\.proposer_id = p_profile_id/.test(count) || /invitee_id/.test(count)) return "the count isn't only the member's own started Gists";
  if (!/g\.started_at >= date_trunc\('month', now\(\)\)/.test(count)) return "not counted when the call connects";
  if (/gist_has_room|allowance/i.test(latest("gist_respond"))) return "accepting an invitation checks the allowance";
  const join = latest("gist_join");
  if (!/gist_has_room\(s\.proposer_id\)/.test(join) || /gist_has_room\(auth\.uid\(\)\)|gist_has_room\(v_other\)/.test(join)) {
    return "connecting checks someone other than the proposer";
  }
  if (!/from plan_config/.test(latest("voice_gist_allowance"))) return "the Starter cap isn't read from plan_config";
  return false;
});

// One number per plan rule (decided 8 October 2026): lib/plan-numbers.ts
// holds what screens say, the database what's enforced and charged. They
// must agree, and nothing else may write the numbers out.
{
  const name = "plan numbers in lib/plan-numbers.ts match the database";
  let hit = null;
  try {
    const ts = fs.readFileSync("lib/plan-numbers.ts", "utf8");
    const num = (k) => Number((ts.match(new RegExp(`export const ${k} = (\\d+);`)) ?? [])[1]);
    const migs = fs.readdirSync("supabase/migrations").filter((x) => /\.sql$/.test(x)).sort()
      .map((x) => fs.readFileSync(`supabase/migrations/${x}`, "utf8").replace(/--[^\n]*/g, ""));
    let cap = null;
    const price = {};
    for (const sql of migs) {
      for (const m of sql.matchAll(/insert into public\.plan_config \(id, starter_monthly_gists\) values \(true, (\d+)\)/g)) cap = Number(m[1]);
      for (const m of sql.matchAll(/\('([a-z_]+)',\s*'plan',\s*'(?:paystack|stripe)',\s*'(?:NGN|USD)',\s*(\d+),/g)) price[m[1]] = Number(m[2]);
      for (const m of sql.matchAll(/update public\.price_list set amount_minor = (\d+) where sku = '([a-z_]+)'/g)) price[m[2]] = Number(m[1]);
    }
    const want = [
      ["STARTER_MONTHLY_GISTS", cap],
      ["PREMIUM_NGN", price.premium / 100],
      ["PREMIUM_PLUS_NGN", price.premium_plus / 100],
      ["DIASPORA_USD", price.diaspora / 100],
      ["DIASPORA_PLUS_USD", price.diaspora_plus / 100],
    ];
    const bad = want.filter(([k, v]) => num(k) !== v).map(([k, v]) => `${k} is ${num(k)}, the database says ${v}`);
    if (bad.length) hit = bad.join("; ");
  } catch (e) {
    hit = e.message;
  }
  if (hit) failures.push({ name, hits: [hit] });
  console.log(`${hit ? "FAIL" : "ok  "}  ${name}`);
}

check("no Starter Gist count or Diaspora price is written out by hand", (s, f) => {
  const n = f.replace(/\\/g, "/");
  if (f.endsWith(".sql") || /lib\/plan-numbers\.ts$/.test(n)) return false;
  const hit =
    s.match(/\b\d+\s+(?:free\s+|voice\s+)?Gists?(?:\s+sessions?)?\s+(?:a|per|this)\s+month/i) ||
    s.match(/your \d+ Gists?\b/i) ||
    s.match(/\bof your \d+\b/i) ||
    s.match(/\$(?:15|30)\b(?!\d)/);
  return hit ? `writes out "${hit[0]}" — read it from lib/plan-numbers.ts` : false;
});

// The Gist deck (decided 8 October 2026; PRD §5.4): one count, in config and
// lib/gist.ts, equal; "Question X of N" reads it; and no card in the bank asks
// about religion, tribe or genotype.
{
  const name = "Gist deck: one size in config and code; no card on religion, tribe or genotype";
  const hits = [];
  const ts = fs.readFileSync("lib/gist.ts", "utf8");
  const code = Number((ts.match(/export const GIST_DECK_SIZE = (\d+);/) ?? [])[1]);
  let db = null;
  const banned = /(relig|church|mosque|\bgod\b|\bfaith|\bpray|muslim|christian|islam|tribe|tribal|ethnic|yoruba|igbo|hausa|genotype|sickle|\bAS\b|\bSS\b|\bAA\b)/i;
  for (const f of fs.readdirSync("supabase/migrations").filter((x) => x.endsWith(".sql")).sort()) {
    const sql = fs.readFileSync(`supabase/migrations/${f}`, "utf8").replace(/--[^\n]*/g, "");
    for (const m of sql.matchAll(/insert into public\.gist_config \(id, deck_size\) values \(true, (\d+)\)/g)) db = Number(m[1]);
    // Every question text written to the bank, by insert or update.
    for (const block of sql.matchAll(/(?:insert into public\.gist_questions[\s\S]*?;|update public\.gist_questions[\s\S]*?;)/g)) {
      for (const q of block[0].matchAll(/'((?:[^']|'')+)'/g)) {
        if (q[1].length > 12 && banned.test(q[1])) hits.push(`${f} — a card asks about a protected topic: "${q[1]}"`);
      }
    }
  }
  if (code !== db) hits.push(`lib/gist.ts GIST_DECK_SIZE is ${code}, gist_config.deck_size is ${db}`);
  const card = fs.readFileSync("components/gist/deck-card.tsx", "utf8");
  if (!/of \{GIST_DECK_SIZE\}/.test(card)) hits.push("components/gist/deck-card.tsx — \"Question X of N\" doesn't read GIST_DECK_SIZE");
  for (const f of files) {
    if (/check-constraints/.test(f) || f.endsWith(".sql")) continue;
    const s = stripComments(fs.readFileSync(f, "utf8"), f);
    const m = s.match(/Question \{?[^}\n]*\}? of (\d+)/);
    if (m) hits.push(`${f} — writes "Question … of ${m[1]}" by hand; read GIST_DECK_SIZE`);
  }
  if (hits.length) failures.push({ name, hits });
  console.log(`${hits.length ? "FAIL" : "ok  "}  ${name}`);
}

// Upgrade prompts (decided 8 October 2026): every one names its price, read
// from lib/plan-numbers.ts, and offers "Not now"; the Gist limit opens the
// in-app plan screen, not the public pricing page.
{
  const name = "upgrade prompts show the price from config and offer Not now";
  const PROMPTS = {
    "lib/inbox.ts": /offer\.price/,
    "app/(app)/inbox/locked-row.tsx": /lockedCopy\(offer\)/,
    "components/profile/filters-screen.tsx": /offer\.price/,
    "components/app/pool-plan-notice.tsx": /offer\.price/,
    "components/profile/pool-choice.tsx": /usd\(DIASPORA_USD\)/,
    "components/gist/reply-screen.tsx": /offer\.(price|short)/,
  };
  const NOT_NOW = ["lib/inbox.ts", "components/profile/filters-screen.tsx", "components/app/pool-plan-notice.tsx",
    "components/profile/pool-choice.tsx", "components/gist/reply-screen.tsx"];
  const hits = [];
  for (const [f, price] of Object.entries(PROMPTS)) {
    const s = fs.existsSync(f) ? stripComments(fs.readFileSync(f, "utf8"), f) : "";
    if (!price.test(s)) hits.push(`${f} — no price from lib/plan-numbers.ts`);
    if (NOT_NOW.includes(f) && !/Not now/.test(s)) hits.push(`${f} — no "Not now"`);
  }
  const reply = fs.readFileSync("components/gist/reply-screen.tsx", "utf8");
  if (/href="\/pricing"/.test(reply)) hits.push("components/gist/reply-screen.tsx — the Gist limit links to /pricing, not /profile/plan");
  const inbox = fs.readFileSync("app/(app)/inbox/page.tsx", "utf8");
  if (!(inbox.indexOf("<BlindSafety") > -1 && inbox.indexOf("<BlindSafety") < inbox.indexOf("<LockedRow")))
    hits.push("app/(app)/inbox/page.tsx — report and block must come before the locked-inbox upgrade");
  if (hits.length) failures.push({ name, hits });
  console.log(`${hits.length ? "FAIL" : "ok  "}  ${name}`);
}

// Payments (decided 8 October 2026): Stripe's card issuing country reaches
// the pricing-integrity check on every Stripe settlement, and refunds from
// both providers are processed — by payment_refund, which never pays out.
{
  const name = "Stripe settles with the card country; both providers' refunds are handled";
  const s = stripComments(fs.readFileSync("lib/payments/events.ts", "utf8"), "events.ts");
  const hits = [];
  if (/p_card_country:\s*null/.test(s)) hits.push("lib/payments/events.ts — a settlement passes no card country");
  if (!/case "charge\.refunded"/.test(s)) hits.push("lib/payments/events.ts — Stripe charge.refunded isn't handled");
  if (!/case "refund\.processed"/.test(s)) hits.push("lib/payments/events.ts — Paystack refund.processed isn't handled");
  for (const f of ["app/api/webhooks/stripe/route.ts", "app/api/payments/stripe/return/route.ts"]) {
    if (!/cardCountry:\s*stripeCardCountry/.test(fs.readFileSync(f, "utf8"))) hits.push(`${f} — no card-country lookup`);
  }
  if (hits.length) failures.push({ name, hits });
  console.log(`${hits.length ? "FAIL" : "ok  "}  ${name}`);
}

// Unbuilt paid features (decided 8 October 2026). Live video and see who
// liked you are listed only while their flags are on (lib/features.ts): with
// both flags OFF and payments ON, nothing may list them — the same check the
// build runs (scripts/check-launch-flags.mjs), here for every flag state's
// worst case. Incognito isn't built and has no flag: listed nowhere, ever.
{
  const name = "live video and see-who-liked-you listed only behind their flags; incognito nowhere";
  const { collectListings, findViolations } = await import("./check-launch-flags.mjs");
  const off = { videoGist: false, seeWhoLiked: false };
  const hits = findViolations(collectListings(off), off, true);
  for (const { source, text } of collectListings({ videoGist: true, seeWhoLiked: true })) {
    if (/incognito/i.test(text)) hits.push(`${source} lists incognito, which isn't built`);
  }
  for (const f of ["lib/pricing-content.ts", "lib/schema.ts", "lib/llms.ts", "lib/concierge/system.ts", "app/llms.txt/route.ts", "app/(marketing)/pricing/page.tsx", "components/plan/plan-page.tsx"]) {
    if (fs.existsSync(f) && /incognito/i.test(stripComments(fs.readFileSync(f, "utf8"), f))) hits.push(`${f} — lists incognito, which isn't built`);
  }
  if (hits.length) failures.push({ name, hits });
  console.log(`${hits.length ? "FAIL" : "ok  "}  ${name}`);
}

// "Photos match their selfie" is only true once the photo match ships
// (Prompt 14, parked).
check("no claim that photos match a selfie before the photo match exists", (s, f) => {
  if (!/\.(tsx|ts)$/.test(f) || /check-constraints/.test(f)) return false;
  return /Photos match their selfie/.test(stripComments(s, f)) ? "photo-match claim shipped before Prompt 14" : false;
});

// Video in a Gist (Phase 2, 0040; decided 8 October 2026). The camera is
// touched in one place — the call component — and only video the server has
// turned on (both accepted) reaches it: the clock carries video only behind
// VIDEO_GIST_ENABLED, and the join token grants a camera only when video is on.
check("a camera is touched only by the Gist call, behind the server's video state", (s, f) => {
  // The /audit transport harness tries the camera on purpose, to prove the
  // token refuses it; it only runs with AUDIT_HARNESS set.
  if (!/\.(tsx?)$/.test(f) || /components[\\/]gist[\\/]gist-call\.tsx$/.test(f) || /app[\\/]\(audit\)[\\/]/.test(f)) return false;
  return /setCameraEnabled|getUserMedia\(\s*\{[^}]*video:\s*true|Track\.Source\.Camera\b(?!\s*\|\|)/.test(stripComments(s, f)) &&
    !/lib[\\/]livekit\.ts$/.test(f)
    ? "touches a camera outside components/gist/gist-call.tsx"
    : false;
});
{
  const name = "video reaches a call only behind the flag and the server's 'on'";
  const hits = [];
  const call = stripComments(fs.readFileSync("components/gist/gist-call.tsx", "utf8"), "x.tsx");
  if (/setCameraEnabled\(\s*true/.test(call) && !/const videoOn = clock\?\.video\?\.state === "on"/.test(call))
    hits.push("components/gist/gist-call.tsx — the camera turns on without following the server's video state");
  const clock = stripComments(fs.readFileSync("lib/gist-clock.ts", "utf8"), "x.ts");
  if (!/if \(featureFlags\(\)\.videoGist\)/.test(clock)) hits.push("lib/gist-clock.ts — video isn't behind VIDEO_GIST_ENABLED");
  const join = stripComments(fs.readFileSync("app/api/gist/[id]/join/route.ts", "utf8"), "x.ts");
  if (!/canPublishVideo: clock\?\.video\?\.state === "on"/.test(join)) hits.push("join route — the camera grant doesn't follow the server's video state");
  const route = stripComments(fs.readFileSync("app/api/gist/[id]/video/route.ts", "utf8"), "x.ts");
  if (!/if \(!featureFlags\(\)\.videoGist\)/.test(route)) hits.push("video route — not refused while VIDEO_GIST_ENABLED is off");
  if (hits.length) failures.push({ name, hits });
  console.log(`${hits.length ? "FAIL" : "ok  "}  ${name}`);
}
// Every /audit page renders only with AUDIT_HARNESS set: the page calls
// requireAuditHarness, or a layout between it and app/(audit) does. A client
// page can't call it, so a missed layout would publish a harness page.
{
  const name = "every /audit page is behind AUDIT_HARNESS";
  const hits = [];
  const gated = (p) => fs.existsSync(p) && /requireAuditHarness\(\)/.test(fs.readFileSync(p, "utf8"));
  for (const f of files) {
    const n = f.replace(/\\/g, "/");
    if (!/^app\/\(audit\)\/.*\/page\.tsx$/.test(n)) continue;
    let dir = path.dirname(n);
    let ok = gated(n);
    while (!ok && dir.startsWith("app/(audit)")) {
      ok = gated(`${dir}/layout.tsx`);
      dir = path.dirname(dir);
    }
    if (!ok) hits.push(`${n} — renders without requireAuditHarness`);
  }
  if (hits.length) failures.push({ name, hits });
  console.log(`${hits.length ? "FAIL" : "ok  "}  ${name}`);
}

// No recording, anywhere (PRD §5.4): no LiveKit egress, no MediaRecorder.
check("no call is ever recorded", (s, f) =>
  /\b(Egress|egress\w*|MediaRecorder|startRecording|RoomCompositeEgress|TrackEgress)\b/.test(stripStrings(s))
    ? "starts or configures a recording"
    : false,
);
// Being recorded (PRD §5.4, decided 9 October 2026). A web app can't block
// screenshots or screen recording, so no copy may say or imply it can.
// "Toastly never records calls" is true and allowed; "can't be recorded" is not.
const NO_RECORDING_CLAIM =
  /\bblock(s|ed|ing)?\s+(screenshots?|screen[- ]?(recording|capture|shots?)|recordings?)|\b(screenshots?|screen[- ]?(recording|capture)s?)\s+(are|is)\s+(blocked|disabled|prevented|not (possible|allowed))|\b(can'?t|cannot|can ?not|won'?t)\s+be\s+(screenshotted|screenshot|recorded|captured|screen[- ]?recorded)|\b(screenshot|record(ing)?)[- ]proof\b|\bno ?one can (record|screenshot)|\bimpossible to (record|screenshot)|\bprotected from (screenshots?|recording)/i;
check("no copy says or implies calls can't be screenshotted or recorded", (s, f) => {
  if (!/\.(tsx?)$/.test(f)) return false;
  const m = NO_RECORDING_CLAIM.exec(s);
  return m ? `claims "${m[0]}" — a web app can't stop screen recording` : false;
});
{
  const name = "the video watermark is the viewer's own name and date, drawn on screen, never in the stream";
  const hits = [];
  const call = stripComments(fs.readFileSync("components/gist/gist-call.tsx", "utf8"), "x.tsx");
  if (!/watermark=\{`\$\{myName\.split\(" "\)\[0\]\} · \$\{new Date\(\)/.test(call))
    hits.push("components/gist/gist-call.tsx — the watermark isn't the viewer's own first name and today's date");
  const screen = stripComments(fs.readFileSync("components/gist/call-screen.tsx", "utf8"), "x.tsx");
  if (!/aria-hidden="true" className="pointer-events-none absolute inset-0[^"]*">\s*<span[^>]*animate-watermark/.test(screen))
    hits.push("components/gist/call-screen.tsx — no moving watermark over the incoming video");
  // Never into the stream: nothing draws on or re-encodes a video track.
  for (const f of files.filter((x) => /components[\\/]gist[\\/]|lib[\\/](gist|livekit)/.test(x))) {
    const s = stripComments(fs.readFileSync(f, "utf8"), f);
    if (/captureStream|drawImage|MediaStreamTrackProcessor|TrackProcessor|insertableStreams|createEncodedStreams|setProcessor/.test(s))
      hits.push(`${f} — processes a video stream; the watermark must stay on screen only`);
  }
  // Before a member's camera first turns on — asking or accepting — the
  // one-time recording notice comes first.
  if (!/if \(passed === null && v && !v\.notice_seen\) return setNotice\(\{ kind: "recording"/.test(call) ||
      !/Toastly never records calls, but we can't stop someone recording their screen\. Only turn on video if you're comfortable\./.test(call))
    hits.push("components/gist/gist-call.tsx — the one-time recording notice doesn't come before a member's first video");
  if (!/value: "recorded_or_shared", label: "They recorded or shared me"/.test(fs.readFileSync("lib/safety.ts", "utf8")))
    hits.push("lib/safety.ts — the report reason \"They recorded or shared me\" is missing");
  if (hits.length) failures.push({ name, hits });
  console.log(`${hits.length ? "FAIL" : "ok  "}  ${name}`);
}

// No upgrade prompts during any call (PRD §5.4).
check("no upgrade prompt on the call screens", (s, f) => {
  if (!/components[\\/]gist[\\/](gist-call|call-screen|deck-card)\.tsx$/.test(f)) return false;
  return /\/profile\/plan|\/pricing|\bupgrade\b|Premium Plus|Diaspora Plus|See plans/i.test(s) ? "an upgrade prompt during a call" : false;
});

// The Gist deck records which questions were answered or skipped — never
// what was said (PRD 5.1.1: outcomes yes, audio and transcripts never).
check("Gist deck steps store outcomes only, never content", (s, f) => {
  if (!f.endsWith(".sql")) return false;
  const m = s.match(/create table if not exists public\.gist_deck_steps \(([\s\S]*?)\n\);/);
  if (!m) return false;
  const cols = [...m[1].matchAll(/^\s*([a-z_]+)\s+(text|varchar|jsonb|bytea)/gm)].map((x) => x[1]);
  const extra = cols.filter((c) => c !== "outcome");
  return extra.length ? `content-capable column(s): ${extra.join(", ")}` : false;
});

// --- Coin balance (Prompt 17, PRD §5.5) ------------------------------------
// Closed-loop, never a wallet: CLAUDE.md bans the words in UI copy, because
// they describe a stored-value product Toastly isn't (the legal check in
// PRD §11). Comments may name them; strings and JSX text may not.
check("coin copy never says wallet, escrow, transfer or cash out", (s, f) => {
  if (f.endsWith(".sql")) return false;
  const hit = /\b(wallets?|escrow|cash[ -]?out|transfers?)\b/i.exec(s);
  return hit ? `says "${hit[1]}"` : false;
});

// Coins pay naira subscriptions only. The database refuses a diaspora plan;
// this keeps the allow-list exactly Premium and Premium Plus.
check("coins pay only Premium and Premium Plus, enforced in the database", (s, f) => {
  if (!f.endsWith(".sql") || !/function public\.subscribe_with_coins/.test(s)) return false;
  const m = s.match(/if p_tier not in \(([^)]*)\)/);
  if (!m) return "subscribe_with_coins has no tier allow-list";
  const tiers = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort().join();
  return tiers === "premium,premium_plus" ? false : `allow-list is ${tiers}`;
});

// No withdrawal, payout, or member-to-member send: coins only ever move
// between members as a date stake's outcome, decided by the database.
check("no coin withdrawal, payout or member-to-member send", (s, f) => {
  if (f.endsWith(".sql")) {
    const fn = /create (or replace )?function public\.(\w*(withdraw|payout|cash_?out|send_coins|transfer|gift_coins)\w*)\s*\(/i.exec(s);
    // _date_payout settles a stake inside the database; members cannot call it.
    if (fn && fn[2] !== "withdrawable_balance" && fn[2] !== "_date_payout") return `defines ${fn[2]}`;
    return false;
  }
  const rpc = /\.rpc\(\s*"(\w*(withdraw|payout|cash_?out|send_coins|transfer|gift_coins)\w*)"/i.exec(s);
  return rpc ? `calls ${rpc[1]}` : false;
});

// The ledger is append-only: history is never edited, only added to.
check("the coin ledger is append-only", (s, f) => {
  if (!/0023_coin_balance\.sql$/.test(norm(f))) return false;
  if (!/create trigger \w+\s+before update or delete on public\.coin_ledger/i.test(s)) return "no append-only trigger";
  if (!/revoke insert, update, delete on public\.coin_ledger from anon, authenticated/i.test(s)) return "members can write the ledger";
  return false;
});

// --- Payments (0024) ----------------------------------------------------------
// The server sets every amount: payment_open takes a sku and a mode, never a
// price, and checkout code never reads an amount from a form.
check("checkout never takes an amount from the browser", (s, f) => {
  if (/0024_payments_live\.sql$/.test(norm(f))) {
    const sig = (s.match(/function public\.payment_open\(([\s\S]*?)\)\s*returns/) ?? [])[1] ?? "";
    if (!sig) return "payment_open not found";
    return /amount|price/i.test(sig) ? "payment_open accepts an amount" : false;
  }
  if (/(lib\/payments\/checkout\.ts|app\/\(app\)\/profile\/plan\/actions\.ts|app\/\(app\)\/coins\/actions\.ts)$/.test(norm(f))) {
    return /formData\.get\(\s*"(amount|price|amount_minor|coins)"/.test(s) ? "reads an amount from the form" : false;
  }
  return false;
});

// A webhook is trusted only after its signature checks out.
check("payment webhooks verify the signature before parsing", (s, f) => {
  if (!/app\/api\/webhooks\/(paystack|stripe)\/route\.ts$/.test(norm(f))) return false;
  const verify = s.search(/verify(Paystack|Stripe)Signature\(/);
  const parse = s.indexOf("JSON.parse(");
  if (verify < 0) return "no signature check";
  return parse >= 0 && parse < verify ? "parses before verifying" : false;
});

// Live keys charge real cards: read in one place, honoured only in production.
check("live payment keys are honoured only in production, read in one place", (s, f) => {
  if (f.endsWith(".sql")) return false;
  const reads = /process\.env\.(PAYSTACK_SECRET_KEY|STRIPE_SECRET_KEY)/.test(s);
  if (/lib\/payments\/config\.ts$/.test(norm(f))) {
    const guard = /_live_\/\.test\(v\) && !isProduction\(\)\) return null/.test(s);
    return /VERCEL_ENV === "production"/.test(s) && guard ? false : "no live-key guard";
  }
  return reads ? "reads a payment secret outside lib/payments/config.ts" : false;
});

// Pricing-integrity signals queue a review; payment code never blocks.
check("payment code never blocks or restricts on a pricing signal", (s, f) => {
  if (!/(lib\/payments\/|app\/api\/webhooks\/|0024_payments_live\.sql$)/.test(norm(f))) return false;
  return /(restrict|suspend|ban|lock)_(member|account|profile|user)|update\s+profiles\s+set\s+stage/i.test(s)
    ? "acts on a member's account"
    : false;
});

// --- Review queue (0025) -----------------------------------------------------
const fnBody = (src, name) => (src.match(new RegExp("function public\\." + name + "\\([\\s\\S]*?\\n\\$\\$;")) ?? [])[0] ?? "";

// Every staff function checks the caller is staff, in the database.
check("staff functions check the caller is staff", (s, f) => {
  if (!f.endsWith(".sql")) return false;
  const names = [...s.matchAll(/create or replace function public\.(staff_[a-z_]+)\(/g)].map((m) => m[1]);
  const open = names.filter((n) => n !== "staff_audit_append_only" && !/_require_staff\(\)/.test(fnBody(s, n)));
  return open.length ? `no staff check in ${open.join(", ")}` : false;
});

// The case view never queries message bodies, Gist content, genotype or
// biometric images (CLAUDE.md; PRD §9). Counting a member's messages is
// allowed — reading what they say is not. Checked in the database function
// that builds a case (staff_item, its latest definition) and in every file
// of the console.
const CASE_CONTENT = new RegExp(
  [
    "\\.body\\b", "\\bbody\\s*(,|from|\\))", "string_agg\\(", "\\btranscript", // message and Gist content
    "\\bfrom\\s+(replies|gist_deck_steps|support_conversations)\\b",
    "\\b(member_genotypes|genotype\\w*)\\b", // genotype
    "\\b(image_links|selfie_image\\w*|id_image\\w*|photo_url\\w*|storage\\.objects)\\b", // biometric images
  ].join("|"),
  "i",
);
check("the case view never queries message bodies, genotype or biometric images", (s, f) => {
  if (f.endsWith(".sql")) {
    const defs = [...s.matchAll(/create or replace function public\.staff_item\([\s\S]*?\n\$\$;/g)].map((m) => m[0]);
    const hit = defs.map((d) => CASE_CONTENT.exec(d)).find(Boolean);
    return hit ? `staff_item touches "${hit[0]}"` : false;
  }
  if (!/(app\/\(staff\)\/|components\/staff\/)/.test(norm(f))) return false;
  if (/\.from\(\s*"(messages|replies|member_genotypes|genotype\w*|profile_photos|verification_images)"/.test(s)) return "the console queries content tables directly";
  const hit = /\b(member_genotypes|image_links|selfie_image\w*|storage\.from)\b/.exec(s);
  return hit ? `the console touches "${hit[0]}"` : false;
});

// A person decides: only staff_decide restricts, asks for re-verification or
// removes. Nothing automatic (CLAUDE.md: no auto-ban, no shadow-restriction).
check("only a staff decision restricts, re-verifies or removes", (s, f) => {
  if (!f.endsWith(".sql")) return false;
  const writes = /insert into (public\.)?(account_restrictions|reverification_requests)\b|perform _remove_account\(/g;
  const outside = s.replace(fnBody(s, "staff_decide"), "").match(writes);
  return outside ? `writes outside staff_decide: ${outside.join(", ")}` : false;
});

// Phase 1: the Sentinel is events-only, so nothing may create a Sentinel item.
check("no Sentinel review items in Phase 1", (s, f) => {
  if (!f.endsWith(".sql")) return false;
  return /_queue\(\s*'sentinel'|values\s*\(\s*'sentinel'/.test(s) ? "creates a Sentinel item" : false;
});

check("the staff audit log is append-only", (s, f) => {
  if (!/0025_review_queue\.sql$/.test(norm(f))) return false;
  return /before update or delete on public\.staff_audit_log/.test(s) ? false : "no append-only trigger";
});

check("the staff screens are gated on is_staff", (s, f) => {
  if (!/app\/\(staff\)\/staff\/layout\.tsx$/.test(norm(f))) return false;
  return /rpc\("is_staff"\)/.test(s) && /if \(staff !== true\) notFound\(\)/.test(s) ? false : "layout doesn't check staff";
});

// --- Where a member lives, both-ways "open to abroad", age range (0027) ------

// Country is set by confirm_country / change_country only: they enforce the
// 30-day rule, log every change and raise the phone-code review signal. A
// direct write from app code would skip all three (the database refuses it
// too — guard_country).
check("app code never writes a member's country directly", (s, f) => {
  if (!/\.(tsx?)$/.test(f)) return false;
  return /\.update\(\s*\{[^}]*\bcountry_(code|confirmed_at|changed_at)\s*:/.test(s) ? "writes country_code with .update()" : false;
});

// The two country lists — lib/countries.ts and residence_countries — stay
// the same list with the same calling codes.
check("the country list matches the database's", (s, f) => {
  if (!/lib\/countries\.ts$/.test(norm(f))) return false;
  const mig = fs.readdirSync("supabase/migrations").filter((m) => /\.sql$/.test(m)).sort()
    .map((m) => fs.readFileSync(`supabase/migrations/${m}`, "utf8"))
    .filter((m) => /insert into public\.residence_countries/.test(m)).pop();
  if (!mig) return "no residence_countries seed";
  const db = new Map([...mig.matchAll(/\('([A-Z]{2})', '(?:[^']|'')+', '(\d+)'\)/g)].map((m) => [m[1], m[2]]));
  const ts = new Map([...s.matchAll(/code: "([A-Z]{2})", name: "[^"]+", callingCode: "(\d+)"/g)].map((m) => [m[1], m[2]]));
  const diff = [...new Set([...db.keys(), ...ts.keys()])].filter((k) => db.get(k) !== ts.get(k));
  return diff.length ? `differs for ${diff.join(", ")}` : false;
});

// Decided 5 October 2026: off works both ways. The latest feed must leave
// a member in Nigeria who switched it off out of the six of members abroad.
const LATEST_FEED = fs.readdirSync("supabase/migrations").filter((m) => /\.sql$/.test(m)).sort()
  .filter((m) => /create or replace function public\.build_daily_feed/.test(fs.readFileSync(`supabase/migrations/${m}`, "utf8"))).pop();
check("'Open to people living abroad' works both ways in the feed", (s, f) => {
  if (!LATEST_FEED || !norm(f).endsWith(LATEST_FEED)) return false;
  const body = s.slice(s.indexOf("create or replace function public.build_daily_feed"));
  if (!/p\.country_code = 'NG' and \(v_country = 'NG' or p\.open_to_abroad\)/.test(body)) return "members abroad still see members who switched it off";
  if (!/v_country = 'NG' and v_open\b/.test(body)) return "the member's own switch no longer filters their six";
  return false;
});

check("the switch says it works both ways", (s, f) => {
  if (!/components\/profile\/match-preferences\.tsx$/.test(norm(f))) return false;
  return /they won(&apos;|')t see you/.test(s) ? false : "the explanation no longer says members abroad won't see them";
});

// Free on every plan: nothing that sets or applies the age range may read a
// tier or an entitlement.
check("the age range is free on every plan", (s, f) => {
  const n = norm(f);
  let body = "";
  if (n.endsWith(".sql")) {
    for (const name of ["_age_range", "my_age_range"]) {
      const i = s.indexOf(`create or replace function public.${name}(`);
      if (i >= 0) body += s.slice(i, s.indexOf("$$;", i));
    }
  } else if (/components\/profile\/match-preferences\.tsx$|app\/\(app\)\/profile\/preferences\//.test(n)) {
    body = s;
  }
  return body && /current_tier|entitlement|\btier\b|premium/i.test(body) ? "reads a plan" : false;
});

// --- Ported fixes and the brief rule (0028) ---------------------------------

const MIGS = fs.readdirSync("supabase/migrations").filter((m) => /\.sql$/.test(m)).sort()
  .map((m) => ({ m, sql: fs.readFileSync(`supabase/migrations/${m}`, "utf8") }));
const latestFn = (name) => {
  let body = null;
  for (const { sql } of MIGS) {
    const re = new RegExp(`create or replace function public\\.${name}\\s*\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, "g");
    for (const x of sql.matchAll(re)) body = x[0];
  }
  return body;
};

// The feed builder is security definer; it must refuse any id but the
// caller's, or anyone can read anyone's six.
check("the daily feed refuses any member but the caller", (s, f) => {
  if (!/lib\/countries\.ts$/.test(norm(f))) return false; // run once
  const body = latestFn("build_daily_feed");
  return body && /p_profile_id is distinct from auth\.uid\(\)/.test(body) ? false : "build_daily_feed trusts p_profile_id";
});

// Members see only their own Gist outcome, so the yes/no must be answered
// by a definer function — and only ever a yes/no, to the two people.
check("'did both say continue?' works for members and reveals only a yes/no", (s, f) => {
  if (!/lib\/countries\.ts$/.test(norm(f))) return false;
  const body = latestFn("gist_mutual_continue");
  if (!body || !/security definer/.test(body)) return "gist_mutual_continue runs under the caller's RLS (always false for members)";
  if (!/returns boolean/.test(body)) return "gist_mutual_continue returns more than a yes/no";
  if (!/auth\.uid\(\) in \(g\.proposer_id, g\.invitee_id\)/.test(body)) return "answers people outside the Gist";
  return false;
});

// phone_identities is never client-writable; the server binds the number.
check("phone numbers are bound by the server, never by the member", (s, f) => {
  if (!/\.(tsx?)$/.test(f)) return false;
  return /from\(\s*["']phone_identities["']\s*\)\s*\.(upsert|insert|update)/.test(s) ? "writes phone_identities with the member's client" : false;
});

check("replies can be sent", (s, f) => {
  if (!/lib\/countries\.ts$/.test(norm(f))) return false;
  return MIGS.some(({ sql }) => /create policy "[^"]+" on public\.replies for insert/.test(sql)) ? false : "replies has no insert policy — every reply is refused";
});

// PRD §5.7 / CLAUDE.md: the AriyaPlanner brief is drafted only from what
// the couple enters or chooses to copy at the handoff. No database function
// touching couple_briefs may read profiles; no app code handling the brief
// may query them. (Genotype is held off the brief by "genotype is read only
// on the display path" above.)
check("the AriyaPlanner brief is never filled from profiles", (s, f) => {
  const n = norm(f);
  if (n.endsWith(".sql")) {
    for (const x of s.matchAll(/\$\$([\s\S]*?)\$\$/g)) {
      if (/\bcouple_briefs\b/.test(x[1]) && /\bprofiles\b/.test(x[1])) return "a function touching couple_briefs reads profiles";
    }
    return false;
  }
  if (!/^(app|components|lib)\//.test(n)) return false;
  if (!/couple_briefs|\bBriefSource\b|\bassembleBrief\b|\bdescribeBrief\b/.test(s)) return false;
  return /from\(\s*["']profiles["']\s*\)/.test(s) ? "handles the brief and queries profiles" : false;
});

// --- No live profile, no access; photos and the face match (0029) ----------
//
// Ported from live-profile-and-prompt-14. PRD §5.1.2 / CLAUDE.md: enforce on
// the server, in every route and query — and fail the build if a feed,
// profile-view, invite, message or date route lacks the guard.

// Route segments that ARE feed, profile-view, invite, message or date routes.
// A new one is guarded the moment it exists, by name.
// Plans, coins and filters too: nobody pays, or is asked to, before going live (PRD §7.3, decided 8 October 2026).
const GUARDED_ROUTE = /^app\/\(app\)\/(feed|gist|inbox|messages?|chat|threads?|matches|members?|people|coins|profile\/plan|profile\/filters)\//;
// Open whatever the member's status (PRD §5.1.2; decided 5 October 2026).
const ALWAYS_OPEN_ROUTE = /^app\/\(app\)\/(verify|profile(?!\/(plan|filters)\/)|safety-kit|couple|help)\//;

check("every feed, profile-view, invite and message route is live-guarded", (s, f) => {
  const n = norm(f);
  if (!GUARDED_ROUTE.test(n) || !/\.(tsx?)$/.test(n)) return false;
  // Pages, layouts, route handlers and server-action modules; components rendered by a guarded page are covered by it.
  const entry = /\/(page|route)\.tsx?$/.test(n) || /^\s*["']use server["']/m.test(s);
  if (!entry) return false;
  if (!/\brequireLiveProfile\s*\(/.test(s)) return "no requireLiveProfile()";
  if (/\/page\.tsx$/.test(n) && !/if \(!live\.live\) return <ProfileNotLive/.test(s)) return "calls the guard but ignores the result";
  return false;
});

check("joining a Gist call is live-guarded", (s, f) => {
  if (!/app\/api\/gist\/\[id\]\/join\/route\.ts$/.test(norm(f))) return false;
  return /requireLiveProfile\s*\(/.test(s) && /if \(!live\.live\) return json\(/.test(s) ? false : "join route has no live guard";
});

// Dates: proposing and staking need a live profile; attendance and safety on
// a date already arranged never do (decided 5 October 2026).
check("dates: only proposing and staking need a live profile", (s, f) => {
  if (!/app\/\(app\)\/dates\/actions\.ts$/.test(norm(f))) return false;
  const body = (name) => {
    const i = s.indexOf(`export async function ${name}(`);
    if (i < 0) return "";
    const j = s.indexOf("export async function", i + 10);
    return s.slice(i, j < 0 ? undefined : j);
  };
  for (const g of ["proposeDate", "stakeDate"]) if (!/requireLiveProfile\s*\(/.test(body(g))) return `${g} isn't guarded`;
  for (const o of ["declineDate", "cancelDate", "requestReschedule", "checkIn", "contestDate"]) {
    if (/requireLiveProfile\s*\(/.test(body(o))) return `${o} is guarded — attendance and safety must stay open`;
  }
  return false;
});

check("verification, photos, settings, data, safety and Couple Mode never require a live profile", (s, f) => {
  const n = norm(f);
  if (!ALWAYS_OPEN_ROUTE.test(n) || !/\.(tsx?)$/.test(n)) return false;
  return /\brequireLiveProfile\s*\(/.test(s) ? "calls requireLiveProfile() on an always-open screen" : false;
});

checkLive();
function checkLive() {
  // The latest surviving policy on each guarded table must require a live caller.
  const pol = new Map();
  for (const { m, sql } of MIGS) {
    const clean = sql.replace(/--[^\n]*/g, "");
    for (const x of clean.matchAll(/drop policy (?:if exists )?"([^"]+)" on ([\w.]+)/g)) pol.delete(`${x[2]}::${x[1]}`);
    for (const x of clean.matchAll(/create policy "([^"]+)"\s+on ([\w.]+)([\s\S]*?);/g)) pol.set(`${x[2]}::${x[1]}`, { m, text: x[3] });
  }
  const TABLES = ["daily_feed", "replies", "gist_sessions", "gist_outcomes", "threads", "messages", "date_spots"];
  const hits = [];
  for (const [k, p] of pol) {
    const t = k.split("::")[0].replace(/^public\./, "");
    if (TABLES.includes(t) && !/profile_is_live\(\s*auth\.uid\(\)\s*\)/.test(p.text)) hits.push(`${p.m} — ${k} doesn't require a live caller`);
  }
  for (const fn of ["build_daily_feed", "gist_invite", "gist_respond", "gist_propose_time", "gist_confirm_time", "gist_join", "date_propose", "date_stake", "unread_count"]) {
    const b = latestFn(fn);
    if (!b || !/assert_live\(/.test(b)) hits.push(`${fn}() doesn't assert a live caller`);
  }
  if (hits.length) failures.push({ name: "every feed, invite, message and date policy and function requires a live caller", hits });
  console.log(`${hits.length ? "FAIL" : "ok  "}  every feed, invite, message and date policy and function requires a live caller`);
}

// The face match keeps outcomes only (PRD §5.1.2): no score, no image, no
// template — anywhere a face-match column is defined.
check("the face match keeps outcomes only — no score, image or template", (s, f) => {
  if (!f.endsWith(".sql") || !/face_match/.test(s)) return false;
  const cols = [...s.matchAll(/add column if not exists (\w+)/g)].map((x) => x[1]).filter((c) => /face|match|selfie|liveness/.test(c));
  const bad = cols.filter((c) => /score|confidence|template|image|embedding|vector/.test(c));
  return bad.length ? `stores ${bad.join(", ")}` : false;
});

// A replacement main photo must never enrol a face: if its Authentication
// half failed, an impostor's selfie would replace the member's enrolled face.
check("only the onboarding selfie enrols a face", (s, f) => {
  if (!/app\/\(app\)\/verify\/selfie-actions\.ts$/.test(norm(f))) return false;
  const enrols = [...s.matchAll(/submitCompare\(cfg, \{[\s\S]*?enrol:\s*(true|false)/g)].map((x) => x[1]);
  if (enrols.length !== 2 || enrols[0] !== "true" || enrols[1] !== "false") return "submitCompare must enrol for onboarding only";
  return /if \(mode === "onboard"\) \{\s*const job = await submitCompare\(cfg, \{[^}]*enrol: true/.test(s) ? false : "enrol: true is not confined to the onboarding branch";
});

// The hosted flow is retired (decided 6 October 2026): it can't name the
// member's id, so it can't register a face or check one. Every check runs in
// the page over REST, and only the database's record_* functions change a
// stage — the callback never writes one itself.
check("the hosted flow is retired; only the database grants a seal", (s, f) => {
  const n = norm(f);
  if (/cdn\.usesmileid\.com\/inline|\bSmileIdentity\s*\(|api\/smile-id\/(session|submitted)/.test(s)) return "uses Smile ID's hosted flow";
  if (/app\/api\/smile-id\/callback\/route\.ts$/.test(n)) {
    if (/\.update\(\{[^}]*\bstage:/.test(s)) return "the callback writes a stage itself";
    if (!/rpc\("record_id_check"/.test(s)) return "the ID check isn't settled by record_id_check";
  }
  return false;
});

// The second ring needs the ID-check selfie to be the face registered at
// onboarding (decided 6 October 2026): ONE capture goes to Biometric KYC and
// to Authentication, and the database grants the ring only with both clear.
check("the ID ring needs the record AND the face registered at onboarding", (s, f) => {
  const n = norm(f);
  if (/app\/\(app\)\/verify\/id-check-actions\.ts$/.test(n)) {
    // `capture,` — the same variable in both calls, not another one.
    if (!/submitBiometricKyc\(cfg, \{[^}]*\bcapture\s*,/.test(s)) return "no Biometric KYC of the capture";
    if (!/submitAuthentication\(cfg, \{[^}]*\bcapture\s*,/.test(s)) return "no Authentication of the same capture";
    return false;
  }
  if (n.endsWith(".sql") && /create or replace function public\.record_id_check/.test(s)) {
    const body = s.slice(s.lastIndexOf("create or replace function public.record_id_check"));
    return /k\.status <> 'clear' or a\.status <> 'clear'/.test(body) ? false : "record_id_check doesn't require both halves clear";
  }
  return false;
});

// The surname Smile ID requires is used to verify and for nothing else: never
// stored, never shown on a profile, never sent to PostHog, Claude or
// AriyaPlanner (decided 6 October 2026). It may appear only on the Smile ID
// path — and lib/privacy-content.ts, which says so in prose.
const SURNAME_FILES = [
  /lib\/smile-id\.ts$/,
  /app\/\(app\)\/verify\/selfie-actions\.ts$/,
  /app\/\(app\)\/verify\/id-check-actions\.ts$/,
  /components\/app\/selfie-details-fields\.tsx$/,
  /components\/verify\/verify-flow\.tsx$/,
  /lib\/privacy-content\.ts$/,
];
check("the surname goes to Smile ID only — never stored, shown, logged or sent elsewhere", (s, f) => {
  const n = norm(f);
  const words = /\b(surname|last_name|lastName|family_name|familyName)\b/;
  if (!words.test(s)) return false;
  if (!SURNAME_FILES.some((r) => r.test(n))) return "mentions the surname outside the Smile ID path";
  if (n.endsWith(".sql")) return "a column or value for the surname";
  // To the end of the statement — a ")" inside the call mustn't end the search.
  if (/\.(insert|update|upsert)\(\s*\{[^;]*\b(surname|last_name|lastName|userDetails)\b/.test(s)) return "stores the surname";
  if (/\bcapture\([^;]*\b(surname|last_name|lastName|userDetails)\b/.test(s)) return "sends the surname to analytics";
  if (/console\.\w+\([^;]*\b(surname|last_name|lastName|userDetails)\b/.test(stripStrings(s))) return "logs the surname";
  return false;
});

// Every image enters storage through the server, stripped of its metadata
// (lib/strip-image.ts; decided 6 October 2026). Members' sessions can't write
// to the buckets (0029); this keeps the server side honest.
check("every image is stripped before it is stored", (s, f) => {
  if (f.endsWith(".sql")) return false;
  if (/createSignedUploadUrl|uploadToSignedUrl/.test(s)) return "a direct browser upload skips the strip";
  if (!/\.upload\(/.test(s)) return false;
  return /\bstripJpeg\(/.test(s) ? false : "uploads to storage without stripJpeg()";
});

// The selfie and its frames pass through to Smile ID: never stored, never logged.
check("the selfie never reaches storage or a log", (s, f) => {
  if (!/app\/\(app\)\/verify\/(selfie|id-check)-actions\.ts$|app\/api\/smile-id\/callback\/route\.ts$/.test(norm(f))) return false;
  if (/console\.\w+\([^;]*\b(selfie|frames|formData|capture|userDetails|liveness|idNumber|raw)\b/.test(stripStrings(s))) return "logs the selfie, the form or the ID number";
  const storage = [...s.matchAll(/\.storage\s*\.from\([^)]*\)\s*\.(\w+)\(/g)].map((m) => m[1]);
  const bad = storage.filter((op) => op !== "download" && op !== "remove");
  return bad.length ? `storage.${bad.join(", ")} on the selfie path` : false;
});

// Consent first, with its version; the selfie passes through and is never kept.
check("a selfie check records consent first and never stores the selfie", (s, f) => {
  if (!/app\/\(app\)\/verify\/(selfie|id-check)-actions\.ts$/.test(norm(f))) return false;
  const consent = s.indexOf("await recordConsent(");
  const submit = s.search(/(await )?submit(Compare|Authentication|BiometricKyc)\(/);
  if (consent < 0 || submit < 0 || consent > submit) return "consent isn't recorded before the check is sent";
  if (/\.upload\(|from\(\s*["']storage/.test(s)) return "writes the selfie somewhere";
  return false;
});

// --- Religion and denomination (PRD §5.2.3; decided 6 October 2026) --------
// Toastly is non-religious: faith is shown, never sorted on. There is no
// denomination filter, now or planned.
const FAITH_GUARDS = /^(faith_rules|faith_meta_is_clean|remove_faith)$/;
check("no denomination filter on any search or feed query", (s, f) => {
  if (f.endsWith(".sql")) {
    if (!/\bdenomination\b/.test(s)) return false;
    const bad = [];
    for (const m of s.matchAll(/create or replace function public\.(\w+)[\s\S]*?\$\$([\s\S]*?)\$\$/g)) {
      // profile_for (0033) may hand a viewer the shown value to display —
      // only as "case when religion is shown then the value", never in a
      // where, join or order.
      const body = m[1] === "profile_for"
        ? m[2].replace(/'denomination(_other)?', case when p\.religion_visibility = 'public' then p\.denomination\1 end/g, "")
        : m[2];
      if (/\bdenomination\b/.test(body) && !FAITH_GUARDS.test(m[1])) bad.push(m[1]);
    }
    if (/create policy[^;]*\bdenomination\b/.test(s)) bad.push("a policy");
    if (/create (or replace )?(materialized )?view[^;]*\bdenomination\b/.test(s)) bad.push("a view");
    return bad.length ? `reads denomination in ${bad.join(", ")}` : false;
  }
  return /\.(eq|neq|in|not|filter|match|contains|containedBy|or|like|ilike|order)\(\s*["'`{][^)]*denomination/.test(s)
    ? "a query filters or sorts on denomination"
    : false;
});

// Denomination stays on the profile path: never a model or agent payload,
// never PostHog, never the Sentinel (0030's guard), never the AriyaPlanner
// brief. Only these files may mention it.
const DENOMINATION_FILES = [
  /lib\/faith\.ts$/,
  /lib\/types\/profile\.ts$/,
  /app\/\(app\)\/profile\/actions\.ts$/,
  /app\/\(app\)\/profile\/profile-form\.tsx$/,
  /app\/\(app\)\/profile\/faith-actions\.ts$/,
  /app\/\(app\)\/profile\/edit\/page\.tsx$/,
  /components\/profile\/faith-section\.tsx$/,
  /app\/\(audit\)\/audit\/profile-faith\//, // mock profile data for the mobile audit
  /lib\/analytics\.ts$/,
  /lib\/privacy-content\.ts$/,
];
check("denomination never reaches a model, PostHog, the Sentinel or the AriyaPlanner brief", (s, f) => {
  if (f.endsWith(".sql") || !/denomination/i.test(s)) return false;
  const n = norm(f);
  if (!DENOMINATION_FILES.some((r) => r.test(n))) return "mentions denomination outside the profile path";
  if (/lib\/analytics\.ts$/.test(n)) {
    const rest = s.replace(/const FORBIDDEN_PROPERTIES = \[[\s\S]*?\];/, "");
    return /denomination/i.test(rest) ? "analytics uses denomination beyond its forbidden list" : false;
  }
  if (/\bcapture\([^;]*denomination/.test(s)) return "sends denomination to PostHog";
  return false;
});

// Never on the feed card: the full profile only.
check("religion and denomination are never on the feed card", (s, f) => {
  if (!/app\/\(app\)\/feed\//.test(norm(f))) return false;
  return /\b(religion|denomination)\b/.test(s) ? "the feed reads religion or denomination" : false;
});

// --- Self-applied filters (PRD §5.2.4; decided 6 October 2026) -------------
const latestSqlFn = (name) => {
  const files = fs.readdirSync("supabase/migrations").filter((m) => /\.sql$/.test(m)).sort()
    .filter((m) => new RegExp(`create or replace function public\\.${name}\\b`).test(fs.readFileSync(`supabase/migrations/${m}`, "utf8")));
  const last = files.pop();
  if (!last) return null;
  const sql = stripComments(fs.readFileSync(`supabase/migrations/${last}`, "utf8"), "x.sql");
  const from = sql.indexOf(`create or replace function public.${name}`);
  const open = sql.indexOf("$$", from);
  return { file: last, body: sql.slice(open, sql.indexOf("$$", open + 2)) };
};

check("a filter reads only its owner's filters and only shown values", (s, f) => {
  const fn = latestSqlFn("passes_own_filters");
  if (!fn || !norm(f).endsWith(fn.file)) return false;
  const b = fn.body;
  if (!/when not has_advanced_filters\(p_viewer\) then true/.test(b)) return "filters apply without a plan that has them";
  if (!/where f\.profile_id = p_viewer/.test(b)) return "reads filters other than the viewer's own";
  // Each value is compared only inside the branch that has checked it is shown.
  if (!/when c\.religion_visibility = 'public'[^]*?then c\.religion = any/.test(b)) return "religion is matched without checking it is shown";
  if (!/when c\.tribe_visibility = 'public'[^]*?then lower\(btrim\(c\.tribe\)\)/.test(b)) return "tribe is matched without checking it is shown";
  if (/\b(denomination|genotype|history|has_children|languages|profession|education)\b/.test(b)) return "filters on something outside the §7.1 list";
  return false;
});

check("the feed applies only the member's own filters, to their own six", (s, f) => {
  const fn = latestSqlFn("build_daily_feed");
  if (!fn || !norm(f).endsWith(fn.file)) return false;
  const calls = [...fn.body.matchAll(/passes_own_filters\(([^)]*)\)/g)].map((m) => m[1].replace(/\s+/g, ""));
  if (calls.length !== 1) return "the feed doesn't apply the member's own filters exactly once";
  return calls[0] === "p_profile_id,p.id" ? false : `passes_own_filters(${calls[0]}) — a filter would change who sees its owner`;
});

check("member filters are read only by their owner's screens and the rule", (s, f) => {
  const n = norm(f);
  if (n.endsWith(".sql")) {
    const bad = [];
    for (const m of s.matchAll(/create or replace function public\.(\w+)[\s\S]*?\$\$([\s\S]*?)\$\$/g)) {
      if (/\bmember_filters\b/.test(m[2]) && !/^(passes_own_filters|my_filters_active)$/.test(m[1])) bad.push(m[1]);
    }
    return bad.length ? `reads member_filters in ${bad.join(", ")}` : false;
  }
  if (!/from\(\s*["']member_filters["']/.test(s)) return false;
  return /app\/\(app\)\/profile\/filters\/(page|actions)\.tsx?$|app\/api\/account\/export\/route\.ts$/.test(n)
    ? false
    : "reads member_filters outside the filters screen and the data download";
});

check("PostHog hears only that filters changed, never which", (s) => {
  const calls = [...s.matchAll(/capture\(\s*["']filters_changed["']([^;]*)\)/g)].map((m) => m[1]);
  // ", <id>" only — a third argument would be properties.
  return calls.some((args) => args.split(",").length > 2) ? "filters_changed carries properties" : false;
});

check("pricing promises only filters that are built", (s, f) => {
  if (!/lib\/pricing-content\.ts$/.test(norm(f))) return false;
  // Every filter line, and every comparison-table row that follows an
  // "Advanced filters" label (its cells don't say "filter").
  const near = [...s.matchAll(/"Advanced filters",\s*\[([^\]]*)\]/g)].map((m) => m[1]);
  const lines = [...stringsIn(s).filter((t) => /filter/i.test(t)), ...near];
  const bad = lines.filter((t) => /\b(city|state|language|intent|intention|diaspora|profession|education|denomination|genotype)/i.test(t));
  return bad.length ? `promises: ${bad.map((b) => b.replace(/\s+/g, " ").slice(0, 80)).join(" | ")}` : false;
});

// A re-check never says why the member was asked (decided 6 October 2026):
// the reason category is shown only when an account is restricted.
check("a re-check never gives a reason", (s, f) => {
  const n = norm(f);
  if (/components\/app\/member-notices\.tsx$/.test(n)) {
    return /from\("reverification_requests"\)\.select\([^)]*reason/.test(s) ? "the re-check notice reads the reason" : false;
  }
  if (/lib\/email\.ts$/.test(n)) {
    const start = s.indexOf("export function sendReverificationNotice");
    if (start < 0) return false;
    const next = s.slice(start + 1).search(/\nexport /);
    const body = next < 0 ? s.slice(start) : s.slice(start, start + 1 + next);
    return /reason/i.test(body) ? "the re-check email gives a reason" : false;
  }
  if (/app\/\(staff\)\/staff\/actions\.ts$/.test(n)) {
    return /sendReverificationNotice\([^)]*reason/i.test(s) ? "a reason is passed to the re-check email" : false;
  }
  return false;
});

// Every Smile ID retention sentence carries the SMILE-RETENTION note (decided
// 6 October 2026): if Smile ID confirms it uses images to improve its
// technology and we can't opt out, each gets the extra sentence. Read raw —
// the note is itself a comment.
check("every Smile ID retention sentence carries its SMILE-RETENTION note", (s, f) => {
  if (!/lib\/consent\.ts$|lib\/privacy-content\.ts$/.test(norm(f))) return false;
  const lines = fs.readFileSync(f, "utf8").split(/\r?\n/);
  const bare = lines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => /\bkeeps the (selfie and photo )?images\b/.test(l) && !/^\s*(\/\/|\*)/.test(l))
    .filter(({ i }) => !/SMILE-RETENTION/.test(lines[i - 1] ?? ""));
  return bare.length ? `line ${bare.map((b) => b.i + 1).join(", ")} has no SMILE-RETENTION note above it` : false;
});

check("the consent's bracketed retention line stays visible until Smile ID confirms it", (s, f) => {
  if (!/lib\/consent\.ts$/.test(norm(f))) return false;
  return /\[Purpose of retention, and any way to request earlier deletion — to be confirmed with Smile ID\.\]/.test(s) ? false : "the bracketed line is gone";
});

// --- The full profile: who can open whose (PRD §5.2.4; decided 7 October 2026)

// Replay every migration's policies in order, so only those still standing count.
const standingPolicies = (() => {
  const live = new Map();
  for (const { sql } of MIGS) {
    const s = stripComments(sql, "x.sql");
    for (const m of s.matchAll(/(drop policy if exists|create policy)\s+"([^"]+)"\s+on\s+public\.(\w+)([^;]*);/g)) {
      const key = `${m[3]}:${m[2]}`;
      if (m[1] === "drop policy if exists") live.delete(key);
      else live.set(key, { table: m[3], name: m[2], rest: m[4] });
    }
  }
  return [...live.values()];
})();

// Another member's profile, history and photos are read ONLY through
// profile_for (0033), which returns just the fields shown to this viewer: no
// policy may let a member select another member's row in those tables. Prompt
// answers are readable through can_open_profile (0032). Anything else is a
// browse path, or a hidden field read straight from the table.
check("another member's rows are read only through profile_for; answers through can_open_profile", (s, f) => {
  if (!/lib\/countries\.ts$/.test(norm(f))) return false; // run once
  const readable = (p) => /\bfor\s+(select|all)\b/.test(p.rest) || !/\bfor\s+\w+/.test(p.rest);
  const usingOf = (p) => (p.rest.match(/\busing\s*([\s\S]*?)(\bwith check\b|$)/) ?? [])[1] ?? "";
  const ownOnly = (p) => /^\(auth\.uid\(\)=(id|profile_id)\)$/.test(usingOf(p).replace(/\s+/g, ""));
  const bad = [
    ...standingPolicies
      .filter((p) => /^(profiles|profile_history|profile_photos)$/.test(p.table) && readable(p) && !ownOnly(p))
      .map((p) => `${p.table}: "${p.name}" lets a member read another member's row`),
    ...standingPolicies
      .filter((p) => p.table === "prompt_answers" && readable(p) && !ownOnly(p) && !/can_open_profile\(/.test(usingOf(p)))
      .map((p) => `prompt_answers: "${p.name}" is readable without the access rule`),
  ];
  return bad.length ? bad.join("; ") : false;
});

check("the access rule stays internal, read-only and about the caller", (s, f) => {
  if (!/lib\/countries\.ts$/.test(norm(f))) return false;
  const all = MIGS.map((x) => stripComments(x.sql, "x.sql")).join("\n");
  // The LAST definition of each, whatever quoting it uses: header up to "as".
  const lastDef = (name) => {
    const at = all.lastIndexOf(`create or replace function public.${name}(`);
    return at < 0 ? null : all.slice(at, all.indexOf(";", all.indexOf("$", at)) + 1);
  };
  const inner = lastDef("profile_open_to");
  const outer = lastDef("can_open_profile");
  if (!inner || !outer) return "profile_open_to / can_open_profile missing";
  for (const def of [inner, outer]) {
    const header = def.slice(0, def.search(/\bas\s+\$/));
    if (!/language sql\b/.test(header) || !/\bstable\b/.test(header)) return "the access rule isn't a stable SQL function — it could write a view";
  }
  if (!/as \$\$\s*select profile_open_to\(auth\.uid\(\), p_owner\)\s*\$\$/.test(outer)) return "can_open_profile answers about someone other than the caller";
  if (/grant[^;]*on function public\.profile_open_to/.test(all)) return "profile_open_to is granted to someone";
  if (!/revoke all on function public\.profile_open_to\(uuid, uuid\) from public, anon, authenticated/.test(all)) return "profile_open_to isn't revoked from members";
  return false;
});

// The locked inbox: a text reply is a message a Starter member can't read, so
// it must never open its sender's profile for them.
check("a text reply opens its sender's profile only for a member who can read it", (s, f) => {
  if (!/lib\/countries\.ts$/.test(norm(f))) return false;
  const body = stripComments(latestFn("profile_open_to") ?? "", "x.sql");
  const leg = (body.match(/from replies r[\s\S]*?\)\s*\n/) ?? [])[0] ?? "";
  return /r\.kind = 'gist_invite' or can_read_inbox\(p_viewer\)/.test(leg) ? false : "a text reply opens its sender's profile on Starter";
});

// "Threatening or pressuring me" reports go first (decided 7 October 2026;
// 0034): the database lists them first, and the console's own sort, oldest or
// newest, keeps them there.
check("threat reports stay at the top of the review queue", (s, f) => {
  if (!/components\/staff\/queue-view\.tsx$/.test(norm(f))) return false;
  const sort = (s.match(/\.sort\(([\s\S]*?)\);/) ?? [])[1] ?? "";
  return /Number\(!!b\.urgent\) - Number\(!!a\.urgent\)\s*\|\|/.test(sort) ? false : "the console's sort doesn't put urgent cases first";
});

// No "who viewed you", in any form: no table, column, event or copy for it.
check("no profile view is recorded — no 'who viewed you'", (s) =>
  /profile_views?\b|viewed_(by|you|me|at)\b|who.?viewed|profile_viewed|views_count/i.test(s),
);

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

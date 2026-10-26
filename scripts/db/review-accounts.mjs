/**
 * Review accounts (0051): the Meta reviewer test account and its fictional
 * companions. Run by the owner; every command only checks and prints its plan
 * unless --yes is given. Prints no key, password hash or full phone number.
 *
 *   node scripts/db/review-accounts.mjs status  --env .env.production.local
 *   node scripts/db/review-accounts.mjs create  --env .env.production.local --phone +234XXXXXXXXXX \
 *        --email review@trytoastly.com --photos <dir> --grant-until 2027-01-31 [--yes]
 *   node scripts/db/review-accounts.mjs refresh --env .env.production.local [--yes]
 *   node scripts/db/review-accounts.mjs retire  --env .env.production.local [--phone +234XXXXXXXXXX] [--yes]
 *
 * create   the reviewer (a woman, the number bound, the gate open for it, a
 *          dated Premium Plus grant) and six companions (men, no number), all
 *          fictional (review-accounts.spec.json), photos from <dir>/<key>/.
 *          Live through review_account_go_live(): no Smile ID call, no selfie.
 * refresh  before the reviewer looks again: forget who the review accounts
 *          have shown each other (the six cools down 30 days) and mark them
 *          seen (it shows members seen in 14).
 * retire   ONE STEP: pause every review account for good, end its grant, take
 *          its number out of the gate (review_accounts_retire), ban every
 *          review sign-in, and — with SUPABASE_ACCESS_TOKEN and --phone —
 *          remove the number's fixed test code from Supabase Auth.
 *
 * Env file: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and for create
 * PHONE_HASH_PEPPER (the production value: the hash and the gate key must be
 * the ones the app makes). Optional SUPABASE_ACCESS_TOKEN (a personal access
 * token) for retire's test-code step.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { readEnv } from "./lib.mjs";

const SPEC = path.resolve("scripts/db/review-accounts.spec.json");
const BAN = "876000h"; // 100 years: Supabase's form of "until further notice"

// --- Pure helpers (scripts/review-accounts.test.mjs) ------------------------

/** The app's phone hash (app/(app)/verify/actions.ts hashPhone): sha256 of "e164:pepper". */
export function hashPhone(e164, pepper) {
  return crypto.createHash("sha256").update(`${e164}:${pepper}`).digest("hex");
}

/** The beta gate's key for a number (lib/beta.ts betaPhoneKey). */
export function betaPhoneKey(e164, pepper) {
  return crypto.createHmac("sha256", pepper).update(`beta-application:${e164}`).digest("hex");
}

/** +2348012345678 -> +234 801 ••• ••78: enough to recognise, not to dial. */
export function maskPhone(e164) {
  return `${e164.slice(0, 4)} ${e164.slice(4, 7)} ••• ••${e164.slice(-2)}`;
}

/** Supabase's test-code list ("2348012345678=123456,...") without one number. */
export function withoutTestNumber(list, e164) {
  const digits = e164.replace(/^\+/, "");
  return (list ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s.split("=")[0].replace(/^\+/, "").replace(/\s/g, "") !== digits)
    .join(",");
}

/** Everything create needs, checked before anything is written. */
export function checkSpec(spec, photosDir) {
  const problems = [];
  const people = [spec.reviewer, ...spec.companions];
  if (spec.reviewer?.gender !== "woman") problems.push("the reviewer must be a woman (owner's decision)");
  if (spec.companions.length < 1 || spec.companions.some((c) => c.gender !== "man")) problems.push("the companions must be men");
  const PROTECTED = /\b(religion|tribe|languages?|profession|education|genotype|history|denomination)\b/;
  for (const p of people) {
    if (!/^[a-z0-9]+$/.test(p.key ?? "")) problems.push(`bad key ${p.key}`);
    for (const k of Object.keys(p)) if (PROTECTED.test(k)) problems.push(`${p.key}: ${k} is a protected field and is never set`);
    const age = Math.floor((Date.now() - Date.parse(p.date_of_birth)) / (365.25 * 864e5));
    if (!(age >= 18 && age < 60)) problems.push(`${p.key}: age ${age}`);
    if (!["casual", "open_to_serious", "serious", "marriage_minded"].includes(p.intent)) problems.push(`${p.key}: intent`);
    if (!p.answers?.length) problems.push(`${p.key}: needs a prompt answer`);
    // The six's default age window is two-way (match_config: 4 below, 5 above),
    // so a companion more than 4 years from the reviewer never reaches her six.
    if (p !== spec.reviewer) {
      const gap = Math.abs(Date.parse(p.date_of_birth) - Date.parse(spec.reviewer.date_of_birth)) / (365.25 * 864e5);
      if (gap > 4) problems.push(`${p.key}: ${gap.toFixed(1)} years from the reviewer; the two-way age window allows 4`);
    }
    if (photosDir) {
      const dir = path.join(photosDir, p.key);
      const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort() : [];
      if (files.length < 4) problems.push(`${p.key}: ${files.length} photos in ${dir} (4 or more needed)`);
    }
  }
  return problems;
}

// --- Commands ----------------------------------------------------------------

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

function clients(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed in the env file.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function rpc(admin, fn, args) {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
}

async function reviewProfiles(admin) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, display_name, gender, paused, review_retired_at, first_live_at")
    .eq("review_account", true)
    .order("created_at");
  if (error) throw new Error(`reading review accounts: ${error.message}`);
  return data;
}

async function markSeen(admin, ids) {
  if (!ids.length) return;
  const now = new Date().toISOString();
  const { error } = await admin.from("member_presence").upsert(ids.map((id) => ({ profile_id: id, seen_at: now })), { onConflict: "profile_id" });
  if (error) throw new Error(`marking review accounts seen: ${error.message}`);
}

async function status(admin) {
  const rows = await reviewProfiles(admin);
  if (!rows.length) return console.log("No review accounts.");
  for (const r of rows) {
    const { data: live } = await admin.rpc("profile_is_live", { p_profile_id: r.id });
    const { data: tier } = await admin.rpc("current_tier", { p_profile_id: r.id });
    console.log(`${r.id}  ${r.display_name.padEnd(10)} ${r.gender.padEnd(5)} live=${live} tier=${tier} ${r.review_retired_at ? `RETIRED ${r.review_retired_at.slice(0, 10)}` : r.paused ? "paused" : ""}`);
  }
  console.log(`\nANALYTICS_EXCLUDE_IDS=${rows.map((r) => r.id).join(",")}`);
}

async function makePerson(admin, p, { email, photosDir, prompts, created }) {
  const password = crypto.randomBytes(18).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    // What the sign-up form sends; the signup trigger makes the profile and
    // moves the date of birth to its private table (0015).
    user_metadata: { display_name: p.display_name, gender: p.gender, date_of_birth: p.date_of_birth },
  });
  if (error) throw new Error(`creating ${p.key}: ${error.message}`);
  const id = data.user.id;
  created.push(id);
  await rpc(admin, "review_account_mark", { p_profile: id });

  const { error: upErr } = await admin
    .from("profiles")
    .update({ city: p.city, bio: p.bio, intent: p.intent, height_cm: p.height_cm ?? null })
    .eq("id", id);
  if (upErr) throw new Error(`${p.key} profile: ${upErr.message}`);

  for (const a of p.answers) {
    const promptId = prompts.get(a.sort_order);
    if (!promptId) throw new Error(`${p.key}: no active prompt with sort_order ${a.sort_order}`);
    const { error: aErr } = await admin.from("prompt_answers").insert({ profile_id: id, prompt_id: promptId, answer: a.answer });
    if (aErr) throw new Error(`${p.key} answer: ${aErr.message}`);
  }

  // As the app stores a photo: resized, re-encoded as JPEG with no metadata
  // (sharp keeps none unless asked), in the member's own folder.
  const dir = path.join(photosDir, p.key);
  const files = fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort().slice(0, 6);
  for (const [i, f] of files.entries()) {
    const jpeg = await sharp(path.join(dir, f)).rotate().resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    const storagePath = `${id}/${crypto.randomUUID()}.jpg`;
    const { error: sErr } = await admin.storage.from("profile-photos").upload(storagePath, jpeg, { contentType: "image/jpeg", upsert: false });
    if (sErr) throw new Error(`${p.key} photo ${i + 1}: ${sErr.message}`);
    const { error: rErr } = await admin.from("profile_photos").insert({ profile_id: id, storage_path: storagePath, position: i });
    if (rErr) throw new Error(`${p.key} photo row ${i + 1}: ${rErr.message}`);
  }
  return { id, password };
}

async function create(admin, env, yes) {
  const spec = JSON.parse(fs.readFileSync(SPEC, "utf8"));
  const photosDir = arg("photos");
  const baseEmail = arg("email");
  const rawPhone = arg("phone");
  const grantUntil = arg("grant-until");
  if (!photosDir || !baseEmail || !rawPhone || !grantUntil) fail("create needs --phone, --email, --photos and --grant-until.");
  const e164 = rawPhone.replace(/[\s().-]/g, "");
  if (!/^\+234[789][01]\d{8}$/.test(e164)) fail("--phone must be a Nigerian mobile number, +234 and ten digits.");
  if (!/^[^@\s+]+@[^@\s]+\.[^@\s]+$/.test(baseEmail)) fail("--email must be a plain mailbox Toastly controls (each account gets +key added).");
  const until = new Date(`${grantUntil}T23:59:59+01:00`);
  if (!(until > new Date()) || until - Date.now() > 120 * 864e5) fail("--grant-until must be within the next 120 days.");
  const pepper = env.PHONE_HASH_PEPPER;
  if (!pepper) fail("PHONE_HASH_PEPPER (the production value) is needed in the env file for create.");

  const problems = checkSpec(spec, photosDir);
  if (problems.length) fail(`Not ready:\n  ${problems.join("\n  ")}`);
  const existing = await reviewProfiles(admin);
  if (existing.some((r) => !r.review_retired_at)) fail("Review accounts already exist and aren't retired (see status). Nothing created.");
  const { data: inUse } = await admin.rpc("phone_in_use", { p_hash: hashPhone(e164, pepper) });
  if (inUse === true) fail(`${maskPhone(e164)} is already confirmed on an account. Nothing created.`);

  const [local, domain] = baseEmail.split("@");
  const people = [spec.reviewer, ...spec.companions];
  console.log(`Would create ${people.length} review accounts:`);
  for (const p of people) console.log(`  ${p.key.padEnd(8)} ${p.display_name.padEnd(10)} ${p.gender.padEnd(5)} ${local}+${p.key}@${domain}`);
  console.log(`  reviewer number ${maskPhone(e164)}: bound, and allowed through the invite-only gate`);
  console.log(`  reviewer plan: Premium Plus until ${grantUntil}`);
  if (!yes) return console.log("\nCheck only — nothing created. Re-run with --yes to create.");

  const { data: promptRows, error: pErr } = await admin.from("prompts").select("id, sort_order").eq("active", true);
  if (pErr) fail(`reading prompts: ${pErr.message}`);
  const prompts = new Map(promptRows.map((r) => [r.sort_order, r.id]));

  const created = [];
  try {
    const out = [];
    for (const p of people) {
      const made = await makePerson(admin, p, { email: `${local}+${p.key}@${domain}`, photosDir, prompts, created });
      const isReviewer = p === spec.reviewer;
      const result = await rpc(admin, "review_account_go_live", { p_profile: made.id, p_phone_hash: isReviewer ? hashPhone(e164, pepper) : null });
      if (result !== "live") throw new Error(`${p.key} didn't go live (${result})`);
      if (isReviewer) {
        await rpc(admin, "review_account_allow_number", { p_profile: made.id, p_phone_key: betaPhoneKey(e164, pepper) });
        await rpc(admin, "review_account_grant", { p_profile: made.id, p_tier: "premium_plus", p_until: until.toISOString() });
        // As a member who confirmed the code: the number on her sign-in
        // (Settings shows it masked; no code is sent), and where she lives,
        // answered as her — otherwise the "Where do you live?" sheet covers
        // every screen the reviewer opens.
        const { error: phErr } = await admin.auth.admin.updateUserById(made.id, { phone: e164.replace(/^\+/, ""), phone_confirm: true });
        if (phErr) throw new Error(`reviewer phone on sign-in: ${phErr.message}`);
        const her = clients(env);
        const { error: inErr } = await her.auth.signInWithPassword({ email: `${local}+${p.key}@${domain}`, password: made.password });
        if (inErr) throw new Error(`signing in as the reviewer: ${inErr.message}`);
        const { error: cErr } = await her.rpc("confirm_country", { p_country: "NG", p_city: null });
        await her.auth.signOut({ scope: "local" });
        if (cErr) throw new Error(`confirming the reviewer's country: ${cErr.message}`);
      }
      out.push({ ...made, p, isReviewer });
      console.log(`  created ${p.key} (${made.id})`);
    }
    await markSeen(admin, out.map((o) => o.id));
    const r = out.find((o) => o.isReviewer);
    console.log("\nDone. For Meta's submission form only — not stored anywhere:");
    console.log(`  sign-in email:    ${local}+reviewer@${domain}`);
    console.log(`  sign-in password: ${r.password}`);
    console.log(`\nSet in Vercel (Production): ANALYTICS_EXCLUDE_IDS=${out.map((o) => o.id).join(",")}`);
    console.log("Then: Supabase → Authentication → Sign In / Providers → Phone → Test Phone Numbers and OTPs (GO-LIVE.md §0l, step 5).");
  } catch (e) {
    console.error(`\nFAILED: ${e.message}\nRemoving the ${created.length} account(s) made in this run…`);
    for (const id of created) {
      const files = await admin.storage.from("profile-photos").list(id, { limit: 100 });
      if (files.data?.length) await admin.storage.from("profile-photos").remove(files.data.map((f) => `${id}/${f.name}`));
      const { error } = await admin.auth.admin.deleteUser(id);
      console.error(`  ${id}: ${error ? `NOT removed (${error.message}) — remove it by hand` : "removed"}`);
    }
    process.exit(1);
  }
}

async function refresh(admin, yes) {
  const rows = (await reviewProfiles(admin)).filter((r) => !r.review_retired_at);
  console.log(`${rows.length} active review account(s).`);
  if (!yes) return console.log("Check only — nothing changed. Re-run with --yes.");
  const r = await rpc(admin, "review_accounts_refresh", {});
  await markSeen(admin, rows.map((x) => x.id));
  console.log(`Forgot ${r.shown_forgotten} shown and ${r.passes_forgotten} passed between review accounts; marked ${rows.length} seen now.`);
}

async function retire(admin, env, yes) {
  const rows = await reviewProfiles(admin);
  const rawPhone = arg("phone");
  const e164 = rawPhone ? rawPhone.replace(/[\s().-]/g, "") : null;
  const ref = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
  const token = env.SUPABASE_ACCESS_TOKEN;
  console.log(`Would retire ${rows.length} review account(s): pause for good, end grants, remove the number from the gate, ban every sign-in.`);
  console.log(token && e164 && ref
    ? `And remove ${maskPhone(e164)}'s fixed test code from Supabase Auth (project ${ref}).`
    : "The fixed test code: remove it by hand (Supabase → Authentication → Sign In / Providers → Phone → Test Phone Numbers and OTPs), or re-run with SUPABASE_ACCESS_TOKEN in the env file and --phone.");
  if (!yes) return console.log("Check only — nothing changed. Re-run with --yes.");

  const r = await rpc(admin, "review_accounts_retire", {});
  console.log(`Paused ${r.retired} (of ${r.profile_ids.length}); grants ended; ${r.numbers_removed} number(s) out of the gate.`);
  let banFailures = 0;
  for (const id of r.profile_ids) {
    const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: BAN });
    if (error) banFailures++;
    console.log(`  sign-in ${id}: ${error ? `NOT banned (${error.message})` : "banned"}`);
  }

  if (token && e164 && ref) {
    const api = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const got = await fetch(api, { headers });
    if (!got.ok) {
      console.log(`  test code: NOT removed (reading the auth settings failed, HTTP ${got.status}) — remove it by hand.`);
    } else {
      const cfg = await got.json();
      const next = withoutTestNumber(cfg.sms_test_otp, e164);
      if (next === (cfg.sms_test_otp ?? "")) {
        console.log("  test code: this number isn't in the list (already removed).");
      } else {
        const put = await fetch(api, { method: "PATCH", headers, body: JSON.stringify({ sms_test_otp: next || null }) });
        console.log(`  test code: ${put.ok ? "removed" : `NOT removed (HTTP ${put.status}) — remove it by hand`}`);
      }
    }
  }
  if (banFailures) process.exit(1);
}

async function main() {
  const cmd = process.argv[2];
  const envFile = arg("env");
  const yes = process.argv.includes("--yes");
  if (!["status", "create", "refresh", "retire"].includes(cmd) || !envFile) {
    fail("Usage: node scripts/db/review-accounts.mjs <status|create|refresh|retire> --env <env file> [options] [--yes]");
  }
  const env = readEnv(envFile);
  const admin = clients(env);
  if (cmd === "status") await status(admin);
  if (cmd === "create") await create(admin, env, yes);
  if (cmd === "refresh") await refresh(admin, yes);
  if (cmd === "retire") await retire(admin, env, yes);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => fail(e.message));
}

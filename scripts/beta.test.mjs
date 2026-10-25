/**
 * The founding-members beta, the code side (lib/beta.ts and the invite-only
 * check in lib/sms-codes.ts).
 *
 *   node --test scripts/beta.test.mjs
 *
 * The database rules (Lagos only, the cap, founding members, no stacking,
 * retention) are in scripts/sql-test/beta-gate.test.mjs. These cover the form's
 * server side and the gate that sits in front of every SMS.
 *
 * Each rule is proven against a planted violation: the same check is run on a
 * deliberately broken copy of the module and must catch it. A test that passes
 * either way proves nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const BETA = path.resolve("lib/beta.ts");
const SMS = path.resolve("lib/sms-codes.ts");
const beta = await import(pathToFileURL(BETA).href);
const sms = await import(pathToFileURL(SMS).href);

/** A module with its source edited; each edit must match exactly once. */
async function broken(file, edits) {
  let src = fs.readFileSync(file, "utf8");
  for (const [from, to] of edits) {
    assert.equal(src.split(from).length - 1, 1, `the planted edit matches once: ${from}`);
    src = src.replace(from, to);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "beta-"));
  const out = path.join(dir, `${path.basename(file, ".ts")}-${crypto.randomUUID()}.ts`);
  fs.writeFileSync(out, src);
  return import(pathToFileURL(out).href);
}

const PEPPER = "pepper-for-tests";
const ENV = { VERCEL_ENV: "production", PHONE_HASH_PEPPER: PEPPER, BETA_INVITE_ONLY: "true" };

const GOOD = {
  first_name: "Ada", age: "27", gender: "woman", location_type: "lagos", lagos_area: "lekki",
  phone: "0803 123 4567", source: "instagram", consent: "on", website: "",
};

function recorder() {
  const lines = [];
  return { lines, log: (message, meta) => lines.push(JSON.stringify({ message, meta })) };
}

/** An application run through handleApply with fakes; returns what happened. */
async function applying(mod, input, over = {}) {
  const stored = [];
  const r = recorder();
  const res = await mod.handleApply(input, "203.0.113.9", {
    env: ENV,
    log: r.log,
    allowAddress: over.allowAddress ?? (async () => true),
    store: over.store ?? (async (row) => { stored.push(row); return "stored"; }),
  });
  return { res, stored, lines: r.lines };
}

// --- the words ------------------------------------------------------------------------

test("the owner's copy is exact", () => {
  assert.equal(beta.BETA_INVITE_ONLY_MESSAGE, "Toastly is invite-only for now. Apply at trytoastly.com/beta.");
  assert.equal(beta.BETA_THANKS_LAGOS, "Thanks. We'll message you if you're chosen.");
  assert.equal(beta.BETA_THANKS_ELSEWHERE, "Thanks. We're starting in Lagos. We'll let you know when we open where you live.");
  assert.deepEqual(beta.BETA_LAGOS_AREAS.map((a) => a.label), [
    "Lekki", "Victoria Island/Ikoyi", "Ajah", "Yaba", "Surulere", "Ikeja", "Ikorodu", "Maryland", "Festac", "Other Lagos",
  ]);
  assert.deepEqual(beta.BETA_LOCATION_TYPES.map((l) => l.label), ["Lagos", "Elsewhere in Nigeria", "Outside Nigeria"]);
  assert.deepEqual([...beta.BETA_GENDERS], ["woman", "man"], "the app's own two options");
});

// --- the form ---------------------------------------------------------------------------

async function formProblem(mod) {
  // A good Lagos application is stored once, with exactly the listed fields.
  const ok = await applying(mod, GOOD);
  if (ok.res.status !== 200 || ok.stored.length !== 1) return "a good application wasn't stored";
  const keys = Object.keys(ok.stored[0]).sort().join(",");
  if (keys !== "age,consent,first_name,gender,lagos_area,location_type,other_location,phone_e164,phone_key,source") return `stored fields: ${keys}`;
  if (ok.stored[0].phone_e164 !== "+2348031234567") return "the number wasn't normalised to +234";
  if (ok.stored[0].phone_key.length !== 64 || ok.stored[0].phone_key.includes("803")) return "the phone key isn't a keyed hash";
  if (ok.res.body.message !== "Thanks. We'll message you if you're chosen.") return "wrong Lagos thanks";

  // Outside Lagos: its own thanks, and the place is kept instead of an area.
  const out = await applying(mod, { ...GOOD, location_type: "outside_nigeria", lagos_area: "", other_location: "Accra, Ghana" });
  if (out.stored[0]?.other_location !== "Accra, Ghana" || out.stored[0]?.lagos_area !== null) return "outside-Lagos fields";
  if (out.res.body.message !== "Thanks. We're starting in Lagos. We'll let you know when we open where you live.") return "wrong elsewhere thanks";
  // A Lagos application ignores a stray 'other location'; a non-Lagos one ignores a stray area.
  const stray = await applying(mod, { ...GOOD, other_location: "Abuja" });
  if (stray.stored[0]?.other_location !== null) return "a Lagos application kept an other-location";

  // Refusals: each stores nothing and names only the field.
  const bad = [
    ["under 18", { ...GOOD, age: "17" }, "under_18"],
    ["age not a number", { ...GOOD, age: "twenty" }, "age"],
    ["no consent", { ...GOOD, consent: "" }, "consent"],
    ["consent false", { ...GOOD, consent: false }, "consent"],
    ["a UK number", { ...GOOD, phone: "+447700900123" }, "phone"],
    ["a US number", { ...GOOD, phone: "+14155550123" }, "phone"],
    ["too short", { ...GOOD, phone: "0803123" }, "phone"],
    ["gender", { ...GOOD, gender: "other" }, "gender"],
    ["Lagos without an area", { ...GOOD, lagos_area: "" }, "lagos_area"],
    ["an area that isn't listed", { ...GOOD, lagos_area: "abuja" }, "lagos_area"],
    ["elsewhere without a place", { ...GOOD, location_type: "elsewhere_nigeria", lagos_area: "", other_location: "" }, "other_location"],
    ["where", { ...GOOD, location_type: "mars" }, "location_type"],
    ["how they heard", { ...GOOD, source: "a billboard" }, "source"],
    ["no name", { ...GOOD, first_name: "  " }, "first_name"],
    ["a name with digits", { ...GOOD, first_name: "Ada123" }, "first_name"],
  ];
  for (const [label, input, field] of bad) {
    const r = await applying(mod, input);
    if (r.stored.length) return `${label}: was stored`;
    if (r.res.status !== 400 || r.res.body.field !== field) return `${label}: expected 400/${field}, got ${r.res.status}/${r.res.body.field}`;
  }
  return null;
}

test("the form stores exactly the listed fields, and refuses what it should", async () => {
  assert.equal(await formProblem(beta), null);
  for (const edit of [
    ["if (ageRaw < 18) return { ok: false, field: \"under_18\" };", ""],
    ['if (!(input.consent === true || input.consent === "true" || input.consent === "on")) {', "if (false) {"],
    ["if (/^234[789][01]\\d{8}$/.test(plain)) return `+${plain}`;", "if (/^\\d{10,15}$/.test(plain)) return `+${plain}`;"],
    ["      phone_key: betaPhoneKey(phone_e164, pepper),", "      phone_key: betaPhoneKey(phone_e164, pepper),\n      email: \"x\","],
  ]) {
    const bad = await broken(BETA, [edit]);
    assert.notEqual(await formProblem(bad), null, `caught: ${edit[1].slice(0, 50)}`);
  }
});

test("Nigerian numbers in the ways people type them; nothing else", () => {
  for (const ok of ["08031234567", "0803 123 4567", "+2348031234567", "+234 803 123 4567", "2348031234567", "(0803) 123-4567"]) {
    assert.equal(beta.normaliseNigerianNumber(ok), "+2348031234567", ok);
  }
  for (const bad of ["", "803 123 4567", "+447700900123", "07700900123", "+23480312345", "+234803123456789", "abc", "+2348031234567x", null, undefined, 8031234567]) {
    assert.equal(beta.normaliseNigerianNumber(bad), null, String(bad));
  }
});

test("names as they are written in Nigeria are accepted; markup and digits are not", async () => {
  for (const name of ["Ọlá", "Adébáyọ̀", "Chukwuemeka", "Ngozi-Ada", "Ọmọ́tọ́lá", "O'Brien", "Zoë", "Amaka Grace"]) {
    const r = await applying(beta, { ...GOOD, first_name: name });
    assert.equal(r.res.status, 200, name);
    assert.equal(r.stored[0].first_name, name);
  }
  for (const name of ["Ada1", "<script>", "Ada;DROP", "-Ada", " ", "x".repeat(41), "Ada\nBayo"]) {
    const r = await applying(beta, { ...GOOD, first_name: name });
    assert.equal(r.res.status, 400, JSON.stringify(name));
    assert.equal(r.res.body.field, "first_name");
  }
  for (const place of ["Abuja", "Port Harcourt", "Cross River", "United Kingdom", "Côte d'Ivoire", "Lagos (Ikoyi)"]) {
    const r = await applying(beta, { ...GOOD, location_type: "elsewhere_nigeria", lagos_area: "", other_location: place });
    assert.equal(r.res.status, 200, place);
  }
  const bad = await applying(beta, { ...GOOD, location_type: "outside_nigeria", lagos_area: "", other_location: "<img src=x>" });
  assert.equal(bad.res.body.field, "other_location");
});

async function honeypotProblem(mod) {
  const bot = await applying(mod, { ...GOOD, website: "https://spam.example" });
  if (bot.stored.length) return "a honeypot hit was stored";
  const human = await applying(mod, GOOD);
  // A bot learns nothing: the same status and body as a real application.
  if (bot.res.status !== human.res.status || JSON.stringify(bot.res.body) !== JSON.stringify(human.res.body)) return "a honeypot hit looks different from a success";
  return null;
}

test("a filled honeypot is answered like a success and stored nowhere", async () => {
  assert.equal(await honeypotProblem(beta), null);
  const bad = await broken(BETA, [['if (isObject(input) && text(input[BETA_HONEYPOT_FIELD]) !== "") {', "if (false) {"]]);
  assert.notEqual(await honeypotProblem(bad), null);
});

async function duplicateProblem(mod) {
  const first = await applying(mod, GOOD, { store: async () => "stored" });
  const again = await applying(mod, { ...GOOD, first_name: "Someone" }, { store: async () => "duplicate" });
  // The form never says whether a number has applied.
  if (first.res.status !== again.res.status || JSON.stringify(first.res.body) !== JSON.stringify(again.res.body)) return "a repeat looks different from a first application";
  return null;
}

test("a number that has already applied gets exactly the reply a new one does", async () => {
  assert.equal(await duplicateProblem(beta), null);
  const bad = await broken(BETA, [['    log("application stored", { reason: stored });', '    if (stored === "duplicate") return { status: 409, body: { ok: false, error: "already_applied" } };\n    log("application stored", { reason: stored });']]);
  assert.notEqual(await duplicateProblem(bad), null);
});

async function rateProblem(mod) {
  const stored = [];
  const res = await mod.handleApply(GOOD, "203.0.113.9", {
    env: ENV, log: () => {}, allowAddress: async () => false, store: async (row) => { stored.push(row); return "stored"; },
  });
  if (res.status !== 429 || stored.length) return "a rate-limited address was stored";
  // The limiter being down is a failure, not a free pass.
  const down = await applying(mod, GOOD, { allowAddress: async () => { throw new Error("db down"); } });
  if (down.stored.length || down.res.status !== 500) return "a down limiter let an application through";
  // The address passed to the limiter is a key, never the address.
  const seen = [];
  await applying(mod, GOOD, { allowAddress: async (k) => { seen.push(k); return true; } });
  if (seen.length !== 1 || seen[0].includes("203.0.113.9") || seen[0].length !== 64) return "the limiter was given the raw address";
  // A refused form doesn't spend the address's allowance.
  let asked = 0;
  await applying(mod, { ...GOOD, age: "5" }, { allowAddress: async () => { asked += 1; return true; } });
  if (asked) return "an invalid form used up an attempt";
  return null;
}

test("a per-address limit stands in front of the insert, fails closed, and only ever sees a key", async () => {
  assert.equal(await rateProblem(beta), null);
  for (const edit of [
    ['if (!(await deps.allowAddress(betaIpKey(ip ?? "unknown", pepper)))) {', "if (false) {"],
    ["allowAddress(betaIpKey(ip ?? \"unknown\", pepper))", "allowAddress(ip ?? \"unknown\")"],
  ]) {
    const bad = await broken(BETA, [edit]);
    assert.notEqual(await rateProblem(bad), null, `caught: ${edit[1].slice(0, 40)}`);
  }
});

async function logProblem(mod) {
  const everything = [];
  const runs = [
    applying(mod, GOOD),
    applying(mod, { ...GOOD, website: "x" }),
    applying(mod, { ...GOOD, age: "9", first_name: "Chidinma" }),
    applying(mod, GOOD, { store: async () => { throw new Error("insert failed 08031234567 Ada"); } }),
    applying(mod, GOOD, { store: async () => "duplicate" }),
    applying(mod, GOOD, { allowAddress: async () => false }),
  ];
  for (const r of await Promise.all(runs)) everything.push(...r.lines);
  const text = everything.join("\n");
  for (const secret of ["8031234567", "Ada", "Chidinma", "lekki", "203.0.113.9", PEPPER]) if (text.includes(secret)) return `a log contains ${secret}`;
  if (!everything.length) return "nothing was logged (so this proves nothing)";
  return null;
}

test("nothing a person typed, no number and no address is ever logged", async () => {
  assert.equal(await logProblem(beta), null);
  const bad = await broken(BETA, [['    log("application stored", { reason: stored });', '    log("application stored " + checked.row.phone_e164, { reason: stored });']]);
  assert.notEqual(await logProblem(bad), null);
  const bad2 = await broken(BETA, [['    log("application refused", { reason: "invalid", field: checked.field });', '    log("application refused " + JSON.stringify(input), { reason: "invalid", field: checked.field });']]);
  assert.notEqual(await logProblem(bad2), null);
});

// --- the invite-only gate -----------------------------------------------------------------

async function gateProblem(mod) {
  const approvedNumber = "+2348031234567";
  const table = new Map([[mod.betaPhoneKey(approvedNumber, PEPPER), "approved"]]);
  const asked = [];
  const isApproved = async (key) => { asked.push(key); return table.get(key) === "approved"; };
  const deps = (env = ENV) => ({ env, isApproved });

  if (!(await mod.checkBetaGate(approvedNumber, deps())).allowed) return "an approved number was refused";

  // Every other case — never applied, pending, waitlisted, declined — is the SAME result.
  const results = [];
  for (const state of [undefined, "pending", "waitlisted", "declined"]) {
    const number = "+23480399990" + (state ? state.length : 0);
    if (state) table.set(mod.betaPhoneKey(number, PEPPER), state);
    results.push(JSON.stringify(await mod.checkBetaGate(number, deps())));
  }
  if (new Set(results).size !== 1) return "different answers for different reasons";
  if (JSON.parse(results[0]).allowed !== false || JSON.parse(results[0]).reason !== "invite_only") return "an unapproved number wasn't refused as invite-only";

  // Only the keyed form of the number reaches the lookup.
  if (asked.some((k) => k.includes("803") || k.length !== 64)) return "the lookup was given a number, not a key";

  // The switch: off means no lookup at all.
  const before = asked.length;
  if (!(await mod.checkBetaGate("+2348031239999", deps({ ...ENV, BETA_INVITE_ONLY: undefined }))).allowed) return "the gate is on without BETA_INVITE_ONLY";
  if (asked.length !== before) return "a lookup was made with the gate off";

  // Fails closed: no pepper, or a database that can't be reached, sends nothing.
  const noPepper = await mod.checkBetaGate(approvedNumber, deps({ VERCEL_ENV: "production", BETA_INVITE_ONLY: "true" }));
  if (noPepper.allowed) return "no pepper let a number through";
  const down = await mod.checkBetaGate(approvedNumber, { env: ENV, isApproved: async () => { throw new Error("db down"); } });
  if (down.allowed) return "a database error let a number through";
  return null;
}

test("the gate says yes to an approved number only, gives one answer for everything else, and fails closed", async () => {
  assert.equal(await gateProblem(beta), null);
  for (const edit of [
    [': { allowed: false, reason: "invite_only" };', ": { allowed: true };"],
    ['if (!pepper) return { allowed: false, reason: "unavailable" };', "if (!pepper) return { allowed: true };"],
    ['  } catch {\n    return { allowed: false, reason: "unavailable" };', "  } catch {\n    return { allowed: true };"],
  ]) {
    const bad = await broken(BETA, [edit]);
    assert.notEqual(await gateProblem(bad), null, `caught: ${edit[1].slice(0, 50)}`);
  }
});

// The hook is where a browser asking Supabase directly is stopped, so an
// unapproved number must never reach Termii from there.
const HOOK_SECRET = "v1,whsec_" + Buffer.from("hook-secret-bytes-0123456789abcd").toString("base64");
const HOOK_ENV = { ...ENV, TERMII_API_KEY: "tk_live_SECRET", TERMII_CODE_SENDER_ID: "OE Alert", SEND_SMS_HOOK_SECRET: HOOK_SECRET };
function signedHeaders(body) {
  const id = "msg_1";
  const ts = String(Math.floor(Date.now() / 1000));
  const key = Buffer.from(HOOK_SECRET.replace(/^v1,whsec_/, ""), "base64");
  const sig = crypto.createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
  const h = { "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": `v1,${sig}` };
  return { get: (n) => h[n.toLowerCase()] ?? null };
}
async function hookCall(smsMod, betaMod, phone, { approvedNumbers = [], env = HOOK_ENV, withGate = true, allowSpy } = {}) {
  const calls = [];
  const body = JSON.stringify({ user: { phone }, sms: { otp: "482913" } });
  const r = recorder();
  const res = await smsMod.handleSendSms(body, signedHeaders(body), {
    env,
    fetchImpl: async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200 }; },
    allow: async (k) => { allowSpy?.push(k); return true; },
    log: r.log,
    ...(withGate
      ? {
          inviteGate: async (e164) => {
            const g = await betaMod.checkBetaGate(e164, {
              env,
              isApproved: async (key) => approvedNumbers.some((n) => betaMod.betaPhoneKey(n, PEPPER) === key),
            });
            return g.allowed ? "ok" : g.reason;
          },
        }
      : {}),
  });
  return { res, calls, lines: r.lines };
}

async function hookProblem(smsMod) {
  const APPROVED_NUMBER = "+2348031234567";
  // Not approved — never applied, or waiting, or waitlisted: no Termii call, no rate-limit spend, no SMS.
  for (const phone of ["+2348099999999", "+447700900123", "+2348031234568"]) {
    const spent = [];
    const r = await hookCall(smsMod, beta, phone, { approvedNumbers: [APPROVED_NUMBER], allowSpy: spent });
    if (r.calls.length) return `Termii was called for an unapproved number (${phone.slice(0, 5)}…)`;
    if (r.res.status !== 403) return `unapproved number: status ${r.res.status}`;
    if (spent.length) return "an unapproved number used up the rate limit";
  }
  // The same body whatever the reason.
  const a = await hookCall(smsMod, beta, "+2348099999999", { approvedNumbers: [APPROVED_NUMBER] });
  const b = await hookCall(smsMod, beta, "+447700900123", { approvedNumbers: [APPROVED_NUMBER] });
  if (JSON.stringify(a.res.body) !== JSON.stringify(b.res.body)) return "refusals differ";
  // Approved: the code is sent.
  const ok = await hookCall(smsMod, beta, APPROVED_NUMBER, { approvedNumbers: [APPROVED_NUMBER] });
  if (ok.calls.length !== 1 || ok.res.status !== 200) return "an approved number didn't get its code";
  // With the gate on but not wired, nothing is sent (fail closed).
  const unwired = await hookCall(smsMod, beta, APPROVED_NUMBER, { approvedNumbers: [APPROVED_NUMBER], withGate: false });
  if (unwired.calls.length || unwired.res.status === 200) return "the hook sent with the gate on and no gate wired";
  // With the gate off, the beta doesn't interfere.
  const off = await hookCall(smsMod, beta, "+2348099999999", { env: { ...HOOK_ENV, BETA_INVITE_ONLY: undefined }, withGate: false });
  if (off.calls.length !== 1) return "BETA_INVITE_ONLY off still blocked a code";
  // No number in a log.
  if ([...a.lines, ...b.lines, ...ok.lines].join("\n").match(/80990|7700900|8031234/)) return "a number reached a log";
  return null;
}

test("an unapproved number never reaches Termii, and never costs a rate-limit slot", async () => {
  assert.equal(await hookProblem(sms), null);
  for (const edit of [
    ['  if (env.BETA_INVITE_ONLY === "true") {', "  if (false) {"],
    ['let verdict: "ok" | "invite_only" | "unavailable" = "unavailable";', 'let verdict: "ok" | "invite_only" | "unavailable" = "ok";'],
    ['return verdict === "invite_only" ? refusal(403, "invite_only") : refusal(500, "send_failed");', "// let it through"],
  ]) {
    const bad = await broken(SMS, [edit]);
    assert.notEqual(await hookProblem(bad), null, `caught: ${edit[1].slice(0, 50)}`);
  }
});

test("staff type dates in Lagos time and see them back the same", () => {
  assert.equal(beta.lagosInputToIso("2026-10-27T00:00"), "2026-10-26T23:00:00.000Z");
  assert.equal(beta.isoToLagosInput("2026-10-26T23:00:00.000Z"), "2026-10-27T00:00");
  assert.equal(beta.isoToLagosInput(beta.lagosInputToIso("2027-03-01T13:45")), "2027-03-01T13:45");
  for (const bad of ["", "tomorrow", "2026-13-40T00:00", "2026-10-27", null, undefined]) assert.equal(beta.lagosInputToIso(bad), null, String(bad));
  assert.equal(beta.isoToLagosInput(null), "");
});

// --- feedback ------------------------------------------------------------------------------

test("feedback records the page's path only", () => {
  assert.equal(beta.feedbackPage("/profile/settings?tab=x&email=a@b.com#top"), "/profile/settings");
  assert.equal(beta.feedbackPage("/members/[id]"), "/members/[id]");
  assert.equal(beta.feedbackPage("https://evil.example/steal?x=1"), "/");
  assert.equal(beta.feedbackPage("//evil.example"), "/");
  assert.equal(beta.feedbackPage(undefined), "/");
  assert.equal(beta.feedbackPage("/" + "a".repeat(200)), "/");
  assert.deepEqual(beta.FEEDBACK_CATEGORIES.map((c) => c.code), ["bug", "idea", "safety", "other"]);
});

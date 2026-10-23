/**
 * Verification-code SMS (lib/sms-codes.ts): the approved wording, channel "dnd",
 * no number or code in a log, and no real SMS outside production.
 *
 *   node --test scripts/sms-codes.test.mjs
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

const SOURCE = path.resolve("lib/sms-codes.ts");
const real = await import(pathToFileURL(SOURCE).href);

/** The module with its source edited; each edit must match exactly once. */
async function broken(edits) {
  let src = fs.readFileSync(SOURCE, "utf8");
  for (const [from, to] of edits) {
    assert.equal(src.split(from).length - 1, 1, `the planted edit matches once: ${from}`);
    src = src.replace(from, to);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sms-codes-"));
  const file = path.join(dir, `sms-codes-${crypto.randomUUID()}.ts`);
  fs.writeFileSync(file, src);
  return import(pathToFileURL(file).href);
}

// What the owner approved with Termii on 15 October 2026, typed here once more.
const APPROVED = "Your Toastly verification code is 482913. This code expires in 10 minutes. Do not share it with anyone.";
const APPROVED_SHA256 = crypto.createHash("sha256").update(APPROVED).digest("hex");

const PHONE = "+2348031234567";
const OTP = "482913";
const ENV_PROD = { VERCEL_ENV: "production", TERMII_API_KEY: "tk_live_SECRET_VALUE", TERMII_CODE_SENDER_ID: "OE Alert", TERMII_SENDER_ID: "Toastly", SEND_SMS_HOOK_SECRET: "v1,whsec_" + Buffer.from("hook-secret-bytes-0123456789abcd").toString("base64"), PHONE_HASH_PEPPER: "pepper-for-tests" };

/** A fetch that records what it was asked, and answers. */
function spyFetch(answer = { ok: true, status: 200 }) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    if (answer === "throw") throw new Error("network");
    return answer;
  };
  return { fetchImpl, calls };
}
function recorder() {
  const lines = [];
  return { lines, log: (message, meta) => lines.push(JSON.stringify({ message, meta })) };
}

// --- the wording ----------------------------------------------------------------------

function wordingProblem(mod) {
  const text = mod.codeSmsText("482913");
  if (text !== APPROVED) return "text differs from the approved wording";
  if (Buffer.from(text).toString("hex") !== Buffer.from(APPROVED).toString("hex")) return "bytes differ";
  if (crypto.createHash("sha256").update(mod.CODE_SMS_TEMPLATE.replace("{code}", "482913")).digest("hex") !== APPROVED_SHA256) return "template differs";
  return null;
}

test("the code SMS is byte-identical to the wording Termii approved", async () => {
  assert.equal(wordingProblem(real), null);
  assert.equal(real.codeSmsText("123456"), "Your Toastly verification code is 123456. This code expires in 10 minutes. Do not share it with anyone.");
  // Only the code changes.
  assert.equal(real.codeSmsText("000000").replace("000000", "{code}"), real.CODE_SMS_TEMPLATE);

  // Planted violations: any change to the wording is caught.
  for (const edit of [
    ["expires in 10 minutes", "expires in 15 minutes"],
    ["Your Toastly verification code", "Your Toastly code"],
    ["Do not share it with anyone.", "Do not share it."],
    ["verification code is {code}.", "verification code is {code} ."],
  ]) {
    const bad = await broken([edit]);
    assert.notEqual(wordingProblem(bad), null, `caught: ${edit[1]}`);
  }
});

// --- Termii: endpoint, channel, parameters -------------------------------------------------

function termiiProblem(calls) {
  if (calls.length !== 1) return `expected one call, saw ${calls.length}`;
  const { url, init, body } = calls[0];
  if (url !== "https://api.ng.termii.com/api/sms/send") return "wrong endpoint";
  if (init.method !== "POST") return "not POST";
  if (body.channel !== "dnd") return `channel is ${body.channel}`;
  if (body.type !== "plain") return "type is not plain";
  if (body.from !== "OE Alert") return "sender is not from the environment";
  if (body.api_key !== "tk_live_SECRET_VALUE") return "key is not from the environment";
  if (body.to !== "2348031234567") return `to is ${body.to}`;
  if (body.sms !== APPROVED) return "sms is not the approved text";
  return null;
}

test("the channel is always dnd, with the approved parameters", async () => {
  const { fetchImpl, calls } = spyFetch();
  const result = await real.sendCodeViaTermii(PHONE, OTP, { env: ENV_PROD, fetchImpl, log: recorder().log });
  assert.equal(result.ok, true);
  assert.equal(termiiProblem(calls), null);

  // The sender is TERMII_CODE_SENDER_ID, read from the environment, not hard-coded;
  // TERMII_SENDER_ID (the emergency and on-call sender) is never used for a code.
  const other = spyFetch();
  await real.sendCodeViaTermii(PHONE, OTP, { env: { ...ENV_PROD, TERMII_CODE_SENDER_ID: "Another" }, fetchImpl: other.fetchImpl, log: recorder().log });
  assert.equal(other.calls[0].body.from, "Another");
  const noCodeSender = spyFetch();
  const missing = await real.sendCodeViaTermii(PHONE, OTP, { env: { ...ENV_PROD, TERMII_CODE_SENDER_ID: undefined }, fetchImpl: noCodeSender.fetchImpl, log: recorder().log });
  assert.equal(missing.ok, false, "without its own sender nothing is sent");
  assert.equal(noCodeSender.calls.length, 0, "and it never falls back to TERMII_SENDER_ID");

  // Planted violations.
  for (const edit of [['channel: "dnd"', 'channel: "generic"'], ['type: "plain"', 'type: "unicode"'], ["env.TERMII_CODE_SENDER_ID;", "env.TERMII_SENDER_ID;"], ["to: e164.replace(/^\\+/, \"\")", "to: e164"]]) {
    const bad = await broken([edit]);
    const spy = spyFetch();
    await bad.sendCodeViaTermii(PHONE, OTP, { env: ENV_PROD, fetchImpl: spy.fetchImpl, log: recorder().log });
    assert.notEqual(termiiProblem(spy.calls), null, `caught: ${edit[1]}`);
  }
});

// --- nothing identifying in a log ----------------------------------------------------------

const SECRETS = [PHONE, PHONE.slice(1), "8031234567", OTP, "tk_live_SECRET_VALUE", "pepper-for-tests"];

async function logProblem(mod) {
  const seen = [];
  const original = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  for (const k of Object.keys(original)) console[k] = (...a) => seen.push(a.map(String).join(" "));
  const lines = [];
  const log = (message, meta) => lines.push(JSON.stringify({ message, meta }));
  try {
    const body = JSON.stringify({ user: { phone: "2348031234567" }, sms: { otp: OTP } });
    const sign = (secret, b, ts = String(Math.floor(Date.now() / 1000))) => {
      const key = Buffer.from(secret.replace(/^v1,whsec_/, ""), "base64");
      return { "webhook-id": "msg_1", "webhook-timestamp": ts, "webhook-signature": "v1," + crypto.createHmac("sha256", key).update(`msg_1.${ts}.${b}`).digest("base64") };
    };
    const headersFor = (h) => ({ get: (n) => h[n.toLowerCase()] ?? null });
    const run = (extra) => mod.handleSendSms(extra.body ?? body, headersFor(extra.headers ?? sign(ENV_PROD.SEND_SMS_HOOK_SECRET, extra.body ?? body)), {
      env: extra.env ?? ENV_PROD, fetchImpl: extra.fetchImpl ?? spyFetch().fetchImpl, allow: extra.allow ?? (async () => true), log });
    await run({});                                                                    // sent
    await run({ fetchImpl: spyFetch({ ok: false, status: 502 }).fetchImpl });         // Termii refuses
    await run({ fetchImpl: spyFetch("throw").fetchImpl });                            // network
    await run({ allow: async () => false });                                          // rate limited
    await run({ allow: async () => { throw new Error("db down " + PHONE); } });       // limiter down
    await run({ headers: { "webhook-id": "x", "webhook-timestamp": "1", "webhook-signature": "v1,AAAA" } }); // bad signature
    await run({ body: JSON.stringify({ user: { phone: "447700900123" }, sms: { otp: OTP } }) });          // disabled country
    await run({ env: { ...ENV_PROD, VERCEL_ENV: "preview" } });                       // preview
  } finally {
    Object.assign(console, original);
  }
  const everything = [...lines, ...seen].join("\n");
  for (const s of [...SECRETS, "447700900123", "7700900123"]) if (everything.includes(s)) return `a log contains ${s.slice(0, 4)}…`;
  if (!lines.length) return "nothing was logged at all (so this proves nothing)";
  return null;
}

test("no phone number, code or key ever appears in a log", async () => {
  assert.equal(await logProblem(real), null);

  // Planted violations: each one puts something identifying in a log.
  for (const edit of [
    ['log("code sent", { provider: "termii" });', 'log("code sent to " + e164, { provider: "termii" });'],
    ['log("code not sent", { provider: "termii", reason: "network" });', 'log("code not sent " + code, { provider: "termii", reason: "network" });'],
    ['log("code not sent", { reason: "country not enabled" });', 'log("code not sent " + e164, { reason: "country not enabled" });'],
  ]) {
    const bad = await broken([edit]);
    assert.notEqual(await logProblem(bad), null, `caught: ${edit[1].slice(0, 40)}`);
  }
});

// --- only production sends --------------------------------------------------------------------

async function sendProblem(mod) {
  for (const env of [{ ...ENV_PROD, VERCEL_ENV: undefined }, { ...ENV_PROD, VERCEL_ENV: "preview" }, { ...ENV_PROD, VERCEL_ENV: "development" }, { ...ENV_PROD, VERCEL_ENV: "" }]) {
    const spy = spyFetch();
    const r = recorder();
    const result = await mod.sendCodeViaTermii(PHONE, OTP, { env, fetchImpl: spy.fetchImpl, log: r.log });
    if (spy.calls.length) return `Termii was called with VERCEL_ENV=${env.VERCEL_ENV}`;
    if (!result.ok) return "outside production it should report the send as done";
    if (!r.lines.some((l) => l.includes("code sent"))) return "no 'code sent' line";
    if (r.lines.some((l) => l.includes(OTP))) return "the code was logged";
  }
  const prod = spyFetch();
  await mod.sendCodeViaTermii(PHONE, OTP, { env: ENV_PROD, fetchImpl: prod.fetchImpl, log: recorder().log });
  return prod.calls.length === 1 ? null : "production did not send";
}

test("local and Preview never call Termii; production does", async () => {
  assert.equal(await sendProblem(real), null);
  assert.equal(real.smsMayReallySend({ VERCEL_ENV: "production" }), true);
  for (const v of [undefined, "preview", "development", "Production", "prod"]) assert.equal(real.smsMayReallySend({ VERCEL_ENV: v }), false, String(v));

  // Planted violations: the gate opens too wide.
  for (const edit of [['return env.VERCEL_ENV === "production";', 'return env.VERCEL_ENV !== "preview";'], ['return env.VERCEL_ENV === "production";', "return true;"]]) {
    const bad = await broken([edit]);
    assert.notEqual(await sendProblem(bad), null, `caught: ${edit[1]}`);
  }
});

// --- the hook itself ---------------------------------------------------------------------------

function signed(body, { secret = ENV_PROD.SEND_SMS_HOOK_SECRET, ts = Math.floor(Date.now() / 1000), id = "msg_1" } = {}) {
  const key = Buffer.from(secret.replace(/^v1,whsec_/, ""), "base64");
  const sig = "v1," + crypto.createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
  const h = { "webhook-id": id, "webhook-timestamp": String(ts), "webhook-signature": sig };
  return { get: (n) => h[n.toLowerCase()] ?? null };
}
const payload = (phone, otp = OTP, extra = {}) => JSON.stringify({ user: { phone, ...extra }, sms: { otp } });

test("the hook accepts only Supabase's signed calls", async () => {
  const body = payload("2348031234567");
  const mk = (over = {}) => ({ env: ENV_PROD, fetchImpl: spyFetch().fetchImpl, allow: async () => true, log: recorder().log, ...over });

  assert.equal((await real.handleSendSms(body, signed(body), mk())).status, 200);
  assert.equal((await real.handleSendSms(body, signed(body, { secret: "v1,whsec_" + Buffer.from("another-secret-another-secret-12").toString("base64") }), mk())).status, 401, "wrong secret");
  assert.equal((await real.handleSendSms(body + " ", signed(body), mk())).status, 401, "tampered body");
  assert.equal((await real.handleSendSms(body, signed(body, { ts: Math.floor(Date.now() / 1000) - 3600 }), mk())).status, 401, "stale timestamp");
  assert.equal((await real.handleSendSms(body, { get: () => null }, mk())).status, 401, "no headers");
  assert.equal((await real.handleSendSms(body, signed(body), mk({ env: { ...ENV_PROD, SEND_SMS_HOOK_SECRET: undefined } }))).status, 500, "no secret configured");

  // Nothing is sent for a refused call.
  const spy = spyFetch();
  await real.handleSendSms(body, signed(body, { secret: "v1,whsec_" + Buffer.from("another-secret-another-secret-12").toString("base64") }), mk({ fetchImpl: spy.fetchImpl }));
  assert.equal(spy.calls.length, 0);
});

test("+234 goes to Termii; any other country gets nothing sent; the destination is the pending number", async () => {
  const mk = (spy) => ({ env: ENV_PROD, fetchImpl: spy.fetchImpl, allow: async () => true, log: recorder().log });

  const ng = spyFetch();
  const ok = await real.handleSendSms(payload("2348031234567"), signed(payload("2348031234567")), mk(ng));
  assert.equal(ok.status, 200);
  assert.equal(termiiProblem(ng.calls), null);

  for (const phone of ["447700900123", "12025550123", "233201234567", "353871234567"]) {
    const spy = spyFetch();
    const res = await real.handleSendSms(payload(phone), signed(payload(phone)), mk(spy));
    assert.equal(res.status, 400, phone);
    assert.equal(res.body.error.message, "country_not_enabled");
    assert.equal(spy.calls.length, 0, `nothing sent to ${phone.slice(0, 3)}…`);
  }

  // A pending number (first confirmation, or a change) is the destination, not the old one.
  const pending = spyFetch();
  const body = payload("447700900123", OTP, { new_phone: "2348031234567" });
  assert.equal((await real.handleSendSms(body, signed(body), mk(pending))).status, 200);
  assert.equal(pending.calls[0].body.to, "2348031234567");
});

test("a Termii failure shows the member nothing of Termii's; our rate limit applies", async () => {
  const body = payload("2348031234567");
  for (const answer of [{ ok: false, status: 401 }, { ok: false, status: 500 }, "throw"]) {
    const res = await real.handleSendSms(body, signed(body), { env: ENV_PROD, fetchImpl: spyFetch(answer).fetchImpl, allow: async () => true, log: recorder().log });
    assert.equal(res.status, 502);
    assert.deepEqual(res.body, { error: { http_code: 502, message: "send_failed" } }, "a generic key only");
  }
  assert.equal(real.CODE_SEND_FAILED, "We couldn't send your code. Try again in a minute.");

  // Rate limited: refused before any SMS is spent.
  const spy = spyFetch();
  const limited = await real.handleSendSms(body, signed(body), { env: ENV_PROD, fetchImpl: spy.fetchImpl, allow: async () => false, log: recorder().log });
  assert.equal(limited.status, 429);
  assert.equal(spy.calls.length, 0);
  // And a limiter that is down fails closed.
  const down = await real.handleSendSms(body, signed(body), { env: ENV_PROD, fetchImpl: spy.fetchImpl, allow: async () => { throw new Error("down"); }, log: recorder().log });
  assert.equal(down.status, 500);
  assert.equal(spy.calls.length, 0);

  // The rate-limit key is keyed and one-way: never the number.
  const key = real.phoneKey(PHONE, "pepper-for-tests");
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.ok(!key.includes("8031234567"));
  assert.notEqual(key, real.phoneKey(PHONE, "another-pepper"));
});

// --- the payload, exactly as Supabase documents and ships it ---------------------------------

// The Supabase "Send SMS Hook" docs' input: user (with phone, phone_change_sent_at and
// identities carrying a DIFFERENT phone) and sms with the six-digit otp. No new_phone, no sms.phone.
const DOCS_PAYLOAD = {
  user: {
    id: "6a1b2c3d-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "member@example.com",
    phone: "+2348031234567", phone_confirmed_at: "2026-10-01T10:00:00Z", confirmation_sent_at: "2026-10-23T09:00:00Z",
    confirmed_at: "2026-10-01T10:00:00Z", phone_change_sent_at: "2026-10-23T09:00:00Z", last_sign_in_at: "2026-10-23T09:00:00Z",
    app_metadata: { provider: "phone", providers: ["phone"] }, user_metadata: {},
    identities: [{ identity_id: "i1", id: "6a1b2c3d", user_id: "6a1b2c3d", identity_data: { phone: "+447700900999", phone_verified: false }, provider: "phone" }],
    created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-23T09:00:00Z", is_anonymous: false,
  },
  sms: { otp: "482913" },
};
// What the auth server (supabase/auth master) sends: the same, plus metadata and sms.phone / sms.sms_type.
const SERVER_PAYLOAD = {
  metadata: { uuid: "1e8c6c0e-0000-4000-8000-000000000002", time: "2026-10-23T09:00:00Z", name: "send-sms", ip_address: "203.0.113.9" },
  ...DOCS_PAYLOAD,
  sms: { otp: "482913", sms_type: "sms", phone: "2348031234567" },
};

const run = async (obj, over = {}) => {
  const raw = typeof obj === "string" ? obj : JSON.stringify(obj);
  const spy = spyFetch();
  const r = recorder();
  const res = await real.handleSendSms(raw, signed(raw), { env: ENV_PROD, fetchImpl: spy.fetchImpl, allow: async () => true, log: r.log, ...over });
  return { res, spy, r };
};

test("the hook reads the exact payload shape Supabase documents, and the one the auth server sends", async () => {
  // The docs' shape: the number is user.phone; the identity's different number is never used.
  const docs = await run(DOCS_PAYLOAD);
  assert.equal(docs.res.status, 200);
  assert.equal(docs.spy.calls.length, 1);
  assert.equal(docs.spy.calls[0].body.to, "2348031234567");
  assert.equal(docs.spy.calls[0].body.sms, APPROVED);

  // The auth server's shape: sms.phone is the target, even if user.phone is an older number.
  const server = await run({ ...SERVER_PAYLOAD, user: { ...SERVER_PAYLOAD.user, phone: "+2348099999999" } });
  assert.equal(server.res.status, 200);
  assert.equal(server.spy.calls[0].body.to, "2348031234567", "sms.phone wins");

  // A phone change: user.phone keeps the old number, new_phone is the target (auth server source).
  const change = await run({ user: { ...DOCS_PAYLOAD.user, phone: "+2348099999999", new_phone: "2348031234567" }, sms: { otp: "482913" } });
  assert.equal(change.spy.calls[0].body.to, "2348031234567", "new_phone beats the old phone");

  // The identity's number is never used, even when it is all there is.
  const onlyIdentity = await run({ user: { ...DOCS_PAYLOAD.user, phone: "" }, sms: { otp: "482913" } });
  assert.equal(onlyIdentity.res.status, 400);
  assert.equal(onlyIdentity.spy.calls.length, 0);

  // Planted violation: reading the wrong field (the identity) is caught.
  const bad = await broken([["const chosen = [payload.sms.phone, payload.user.new_phone, payload.user.phone]", "const chosen = [(payload.user as any).identities?.[0]?.identity_data?.phone]"]]);
  const raw = JSON.stringify(DOCS_PAYLOAD);
  const spy = spyFetch();
  await bad.handleSendSms(raw, signed(raw), { env: ENV_PROD, fetchImpl: spy.fetchImpl, allow: async () => true, log: recorder().log });
  assert.notEqual(spy.calls[0]?.body.to, "2348031234567", "the planted wrong field would have texted another number");
});

test("an unexpected payload is a clear failure, sends nothing, and is never logged", async () => {
  const bads = [
    ["not JSON", "this is not json"],
    ["an array", "[]"],
    ["no sms", JSON.stringify({ user: DOCS_PAYLOAD.user })],
    ["no user", JSON.stringify({ sms: { otp: "482913" } })],
    ["otp not six digits", JSON.stringify({ user: DOCS_PAYLOAD.user, sms: { otp: "4829" } })],
    ["otp a number", JSON.stringify({ user: DOCS_PAYLOAD.user, sms: { otp: 482913 } })],
    ["no phone anywhere", JSON.stringify({ user: { ...DOCS_PAYLOAD.user, phone: undefined }, sms: { otp: "482913" } })],
    ["a phone that isn't one", JSON.stringify({ user: DOCS_PAYLOAD.user, sms: { otp: "482913", phone: "not-a-number" } })],
  ];
  for (const [label, raw] of bads) {
    const { res, spy, r } = await run(raw);
    assert.equal(res.status, 400, label);
    assert.deepEqual(res.body, { error: { http_code: 400, message: "unexpected_payload" } }, `${label}: a clear, generic failure`);
    assert.equal(spy.calls.length, 0, `${label}: nothing sent`);
    const logged = r.lines.join("\n");
    assert.ok(logged.includes("unexpected payload"), `${label}: the reason is logged`);
    for (const secret of [OTP, "2348031234567", "member@example.com", "447700900999", "not-a-number"]) {
      assert.ok(!logged.includes(secret), `${label}: the payload is not logged (${secret.slice(0, 4)}…)`);
    }
  }
});

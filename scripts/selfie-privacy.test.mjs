/**
 * The in-page selfie goes to Smile ID and nowhere else; the surname Smile ID
 * requires goes to Smile ID and nowhere else (decided 6 October 2026).
 *
 *   node --test scripts/selfie-privacy.test.mjs
 *
 * The real client (lib/smile-id.ts) runs against a mocked network and a
 * mocked console: every request is recorded, so a test can say where the
 * selfie's bytes went. The database half — no table can hold an image or a
 * surname, and members can't write to storage — is in
 * scripts/sql-test/privacy-claims.test.mjs; the code paths (no storage
 * write, no log, no analytics, no Claude, no AriyaPlanner) are pinned by
 * scripts/check-constraints.mjs.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { submitAuthentication, submitBiometricKyc, submitCompare } from "../lib/smile-id.ts";

const cfg = { partnerId: "1234", apiKey: "test-key", env: "sandbox", callbackUrl: "https://preview.example/api/smile-id/callback" };
const SELFIE_MARK = "SELFIE-BYTES-7f3a";
const FRAME_MARK = "LIVENESS-FRAME-91c2";
const SURNAME = "Okonkwo-Whitfield";
const profileId = randomUUID();
const userDetails = { given_names: "Ada", last_name: SURNAME, email: "ada.test@example.com" };
const capture = {
  selfie: new Blob([`\xff\xd8${SELFIE_MARK}\xff\xd9`], { type: "image/jpeg" }),
  livenessFrames: Array.from({ length: 8 }, (_, i) => new Blob([`\xff\xd8${FRAME_MARK}-${i}\xff\xd9`], { type: "image/jpeg" })),
};
const consent = { grantedAt: new Date().toISOString(), language: "en" };

let requests;
let logged;
let realFetch;
let realConsole;
let reply;

async function bodyText(body) {
  if (!body) return "";
  if (typeof body === "string") return body;
  if (body instanceof FormData) {
    const parts = [];
    for (const [k, v] of body.entries()) parts.push(`${k}=${typeof v === "string" ? v : await v.text()}`);
    return parts.join("\n");
  }
  return String(body);
}

beforeEach(() => {
  requests = [];
  logged = [];
  realFetch = globalThis.fetch;
  realConsole = { ...console };
  reply = () => new Response(JSON.stringify({ job_id: "job_test" }), { status: 202 });
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), headers: init.headers ?? {}, body: await bodyText(init.body) });
    if (String(url).endsWith("/v3/token")) return new Response(JSON.stringify({ token: "tok" }), { status: 200 });
    return reply();
  };
  for (const k of ["log", "info", "warn", "error", "debug"]) console[k] = (...a) => logged.push(a.map(String).join(" "));
});

afterEach(() => {
  globalThis.fetch = realFetch;
  Object.assign(console, realConsole);
});

const carrying = (mark) => requests.filter((r) => r.body.includes(mark));

test("the onboarding selfie and every liveness frame go to Smile ID, and only there", async () => {
  await submitCompare(cfg, { sessionId: randomUUID(), profileId, capture, mainPhoto: new Blob(["MAIN"]), consent, userDetails, enrol: true });
  const withSelfie = carrying(SELFIE_MARK);
  assert.equal(withSelfie.length, 1, "sent once");
  assert.equal(withSelfie[0].url, "https://testapi.smileidentity.com/v3/compare");
  for (let i = 0; i < 8; i++) assert.equal(carrying(`${FRAME_MARK}-${i}`).length, 1, `frame ${i} sent once`);
  assert.ok(requests.every((r) => r.url.startsWith("https://testapi.smileidentity.com/")), "no other host is contacted");
  assert.deepEqual(logged, [], "nothing is logged");
});

test("a re-check's Authentication sends the selfie to Smile ID only, and never enrols", async () => {
  await submitAuthentication(cfg, { sessionId: randomUUID(), profileId, capture, consent, userDetails });
  const withSelfie = carrying(SELFIE_MARK);
  assert.equal(withSelfie.length, 1);
  assert.equal(withSelfie[0].url, "https://testapi.smileidentity.com/v3/authentication");
  assert.equal(withSelfie[0].headers["User-ID"], undefined, "no User-ID header: Authentication never enrols");
  assert.deepEqual(logged, []);
});

test("only the onboarding Compare enrols — a replacement's Compare doesn't", async () => {
  await submitCompare(cfg, { sessionId: randomUUID(), profileId, capture, mainPhoto: new Blob(["MAIN"]), consent, userDetails, enrol: false });
  assert.equal(carrying(SELFIE_MARK)[0].headers["User-ID"], undefined);
  await submitCompare(cfg, { sessionId: randomUUID(), profileId, capture, mainPhoto: new Blob(["MAIN"]), consent, userDetails, enrol: true });
  assert.equal(carrying(SELFIE_MARK)[1].headers["User-ID"], profileId);
});

test("the surname goes to Smile ID in user_details and nowhere else", async () => {
  await submitCompare(cfg, { sessionId: randomUUID(), profileId, capture, mainPhoto: new Blob(["MAIN"]), consent, userDetails, enrol: true });
  const withSurname = carrying(SURNAME);
  assert.equal(withSurname.length, 1);
  assert.match(withSurname[0].body, /user_details=\{[^}]*"last_name":"Okonkwo-Whitfield"/);
  assert.ok(withSurname[0].url.startsWith("https://testapi.smileidentity.com/"));
});

test("when Smile ID refuses and echoes what we sent, the error carries no surname, email or member id", async () => {
  reply = () =>
    new Response(`{"error":"bad user_details: last_name ${SURNAME}, email ${userDetails.email}, user ${profileId}"}`, { status: 400 });
  const err = await submitCompare(cfg, { sessionId: randomUUID(), profileId, capture, mainPhoto: new Blob(["MAIN"]), consent, userDetails, enrol: true }).catch((e) => e);
  assert.ok(err instanceof Error);
  for (const secret of [SURNAME, userDetails.email, profileId]) assert.equal(err.message.includes(secret), false, `error carries ${secret}`);
  assert.ok(err.message.length < 400, "capped");
  assert.deepEqual(logged, [], "the client itself logs nothing");
});

// --- The ID check, in the page (decided 6 October 2026) ----------------------

const ID_NUMBER = "12345678901";

test("the ID check sends the number and the selfie to Smile ID's Biometric KYC only, with no user id", async () => {
  await submitBiometricKyc(cfg, { sessionId: randomUUID(), profileId, capture, consent, userDetails, idType: "NIN_V2", idNumber: ID_NUMBER });
  const r = carrying(ID_NUMBER);
  assert.equal(r.length, 1);
  assert.equal(r[0].url, "https://testapi.smileidentity.com/v3/biometric_kyc");
  assert.match(r[0].body, /country=NG/);
  assert.match(r[0].body, /id_type=NIN_V2/);
  assert.equal(r[0].headers["User-ID"], undefined, "never enrols: the face is registered at onboarding");
  assert.equal(r[0].body.includes(profileId), false, "the member id isn't sent to the KYC job");
  assert.equal(carrying(SELFIE_MARK).length, 1);
  assert.deepEqual(logged, []);
});

test("a refused ID check's error carries no ID number, surname or email", async () => {
  reply = () => new Response(`{"error":"id_number ${ID_NUMBER} for ${SURNAME} <${userDetails.email}> not found"}`, { status: 400 });
  const err = await submitBiometricKyc(cfg, { sessionId: randomUUID(), profileId, capture, consent, userDetails, idType: "NIN_V2", idNumber: ID_NUMBER }).catch((e) => e);
  assert.ok(err instanceof Error);
  for (const secret of [ID_NUMBER, SURNAME, userDetails.email]) assert.equal(err.message.includes(secret), false, `error carries ${secret}`);
});

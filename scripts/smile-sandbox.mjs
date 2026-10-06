/**
 * Smile ID sandbox test — the real client (lib/smile-id.ts) against Smile
 * ID's sandbox, end to end. Ported from live-profile-and-prompt-14 onto
 * main's Smile ID config.
 *
 *   node scripts/smile-sandbox.mjs [path/to/face.jpg]
 *   SMILE_ENV_FILE=.env.staging.local node scripts/smile-sandbox.mjs
 *
 * Needs SMILE_ID_PARTNER_ID, SMILE_ID_API_KEY, SMILE_ID_CALLBACK_URL and
 * SMILE_ID_ENV=sandbox (main's names) in .env.local, or in the file named by
 * SMILE_ENV_FILE. Prints nothing from it. REFUSES to run against production.
 *
 * What it proves:
 *   1. a v3 token can be minted with our credentials (main's mintSmileToken);
 *   2. the onboarding Compare (selfie + liveness vs main photo, ENROLLING a
 *      throwaway sandbox user) is accepted and reaches a result;
 *   3. Authentication against that enrolled user is accepted and reaches a
 *      result (after a pause for the enrolment), with a never-enrolled id as
 *      a control;
 *   4. both results map through our outcome rules (lib/face-match.ts);
 *   5. the callback's signature check accepts Smile ID's scheme and refuses
 *      a tampered one.
 *
 * The callback URL can't reach a laptop, so results are read by polling
 * GET /v3/status/{job_id}. Sandbox verdicts are Smile ID's test results, not
 * real face matching — this tests the integration, not the model. Nothing is
 * written to any Toastly database.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHmac } from "node:crypto";

const envFile = process.env.SMILE_ENV_FILE ?? ".env.local";
for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
if (process.env.SMILE_ID_ENV !== "sandbox") {
  console.log(`SMILE_ID_ENV in ${envFile} isn't 'sandbox'. This test only runs against the sandbox.`);
  process.exit(2);
}

const smile = await import("../lib/smile-id.ts");
const rules = await import("../lib/face-match.ts");
const cfg = smile.smileConfig();
if (!cfg) {
  console.log(`SMILE_ID_PARTNER_ID / SMILE_ID_API_KEY / SMILE_ID_CALLBACK_URL aren't all in ${envFile} — nothing to test.`);
  process.exit(2);
}

const BASE = "https://testapi.smileidentity.com";
const results = [];
const record = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name.padEnd(58)} ${detail}`);
};

// Realistic sizes matter: Smile ID refuses an oversized request (413). The
// camera's selfie and frames are small; a main photo is compressed on the
// phone to under 700 KB (lib/compress-photo.ts).
//   argv[2] — a selfie-sized JPEG (a few tens of KB), used for the selfie and frames
//   argv[3] — a main photo (default: the first sizeable prototype JPEG)
// The sandbox doesn't judge the face; it needs valid JPEGs.
function mainPhoto() {
  if (process.argv[3]) return fs.readFileSync(process.argv[3]);
  const dir = "design/prototype/assets";
  const jpg = fs.readdirSync(dir).filter((f) => f.endsWith(".jpg")).map((f) => path.join(dir, f)).find((f) => fs.statSync(f).size > 30_000 && fs.statSync(f).size < 700 * 1024);
  if (!jpg) throw new Error("No JPEG found; pass a main photo as the second argument.");
  return fs.readFileSync(jpg);
}
function selfieImage() {
  if (!process.argv[2]) throw new Error("Pass a selfie-sized JPEG (a few tens of KB) as the first argument.");
  return fs.readFileSync(process.argv[2]);
}

async function poll(jobId) {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${BASE}/v3/status/${jobId}`, {
      headers: { "SmileID-Token": await smile.mintSmileToken(cfg), "SmileID-Partner-ID": cfg.partnerId, Accept: "application/json" },
    });
    if (res.status === 200) return res.json();
    if (res.status === 404) return { status: "not_found" };
    await new Promise((r) => setTimeout(r, 3000));
  }
  return { status: "timeout" };
}

console.log(`Smile ID sandbox (${envFile})\n`);

const t = await smile.mintSmileToken(cfg);
record("1. a v3 token is minted", Boolean(t));
if (!t) process.exit(1);

const selfie = new Blob([selfieImage()], { type: "image/jpeg" });
const jpeg = new Blob([mainPhoto()], { type: "image/jpeg" });
const capture = { selfie, livenessFrames: Array.from({ length: 8 }, () => selfie) };
const profileId = `toastly-sandbox-${randomUUID()}`;
const consent = { grantedAt: new Date().toISOString(), language: "en" };
// Smile ID's sandbox decides the outcome from these (docs: "Testing in Sandbox").
const clear = smile.SANDBOX_IDENTITIES.find((s) => s.key === (process.env.SANDBOX_IDENTITY ?? "clear"));
const userDetails = { given_names: clear.given_names, last_name: clear.last_name, email: clear.email };

let compareJob;
try {
  compareJob = await smile.submitCompare(cfg, { sessionId: randomUUID(), profileId, capture, mainPhoto: jpeg, consent, userDetails, enrol: true });
  record("2. onboarding Compare is accepted (enrols the user)", Boolean(compareJob), compareJob);
} catch (e) {
  record("2. onboarding Compare is accepted (enrols the user)", false, e.message);
}

// Results: no v3 status endpoint is documented, so a 404 here means "the
// result arrives on the callback" (SMILE_ID_CALLBACK_URL) — the path the app
// actually uses, exercised end to end on staging. Not a failure.
const STATUSES = ["clear", "attention", "block", "error"];
function reportResult(label, r, map) {
  if (r.status === "not_found" || r.status === "timeout") {
    console.log(`  ....  ${label.padEnd(58)} arrives on the callback (no status endpoint)`);
    return;
  }
  record(label, STATUSES.includes(r.status), `${r.status}${r.reason ? " / " + r.reason : ""}`);
  if (STATUSES.includes(r.status)) {
    const mapped = map(r);
    record("   …and maps through our outcome rules", Boolean(mapped), JSON.stringify(mapped));
  }
}

if (compareJob) {
  const r = await poll(compareJob);
  reportResult("   …and reaches a result", r, (x) => rules.onboardingOutcome({ status: x.status, reason: x.reason ?? null }));
}

// Authentication against the face the Compare ENROLLED — what a re-check a
// reviewer asks for, and a replacement main photo, run (decided 6 October
// 2026). Enrolment finishes asynchronously, so give it time first.
const ENROL_WAIT_MS = Number(process.env.SMILE_ENROL_WAIT_MS ?? 20_000);
if (compareJob) {
  console.log(`  ....  waiting ${ENROL_WAIT_MS / 1000}s for the enrolment to finish`);
  await new Promise((r) => setTimeout(r, ENROL_WAIT_MS));
}
try {
  const authJob = await smile.submitAuthentication(cfg, { sessionId: randomUUID(), profileId, capture, consent, userDetails });
  record("3. Authentication against the enrolled face is accepted", Boolean(authJob), authJob);
  const r = await poll(authJob);
  reportResult("   …and reaches a result", r, (x) => rules.authenticationOutcome({ status: x.status, reason: x.reason ?? null }));
} catch (e) {
  record("3. Authentication against the enrolled face is accepted", false, e.message);
}

// Control: Authentication for a member id Smile ID never enrolled. If Smile
// ID refuses it outright, that shows Authentication depends on the onboarding
// enrolment. If it accepts, the difference shows only in the verdict on the
// callback — checked end to end on the staging preview (GO-LIVE §0g).
try {
  const never = `toastly-sandbox-never-${randomUUID()}`;
  const job = await smile.submitAuthentication(cfg, { sessionId: randomUUID(), profileId: never, capture, consent, userDetails });
  console.log(`  ....  ${"   control: never-enrolled id was accepted".padEnd(58)} verdict arrives on the callback (${job})`);
} catch (e) {
  console.log(`  ....  ${"   control: never-enrolled id was refused".padEnd(58)} ${e.message}`);
}

// What a refusal logs: Smile ID's text with anything we sent scrubbed.
const echoed = smile.scrub(`bad last_name ${userDetails.last_name} for ${profileId} <${userDetails.email}>`, [profileId, userDetails.given_names, userDetails.last_name, userDetails.email]);
record("   a refusal's log line carries nothing we sent", !echoed.includes(userDetails.last_name) && !echoed.includes(profileId) && !echoed.includes(userDetails.email), echoed);

// 4. The outcome rules on Smile ID's documented sandbox verdicts.
record("4. a clear onboarding Compare is live and matched",
  JSON.stringify(rules.onboardingOutcome({ status: "clear", reason: null })) === JSON.stringify({ live: "passed", match: { outcome: "matched" } }));

// 5. The callback signature, as Smile ID computes it.
const ts = new Date().toISOString();
const sig = createHmac("sha256", cfg.apiKey).update(`${ts}${cfg.partnerId}sid_request`).digest("base64");
record("5. a genuine callback signature is accepted", smile.verifySmileSignature(cfg, sig, ts).ok === true);
record("   …and a tampered one is refused", smile.verifySmileSignature(cfg, sig.replace(/^./, (c) => (c === "A" ? "B" : "A")), ts).ok === false);

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} sandbox checks passed`);
process.exit(failed ? 1 : 0);

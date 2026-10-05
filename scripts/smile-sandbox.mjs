/**
 * Smile ID sandbox test — the real client (lib/smile-id.ts) against Smile
 * ID's sandbox, end to end.
 *
 *   npm run smile:sandbox -- [path/to/face.jpg]
 *
 * Needs SMILE_ID_PARTNER_ID, SMILE_ID_API_KEY and SMILE_ID_ENVIRONMENT=sandbox
 * in .env.local. REFUSES to run against production.
 *
 * What it proves:
 *   1. a v3 token can be minted with our credentials;
 *   2. the onboarding Compare (selfie + liveness vs main photo, ENROLLING a
 *      throwaway sandbox user) is accepted and reaches a result;
 *   3. Authentication against that enrolled user is accepted and reaches a
 *      result;
 *   4. both results map through our outcome rules (lib/face-match.ts);
 *   5. our webhook check accepts Smile ID's signature scheme and rejects a
 *      tampered one.
 *
 * The callback URL can't reach a laptop, so results are read by polling
 * GET /v3/status/{job_id}. Sandbox verdicts are Smile ID's test results,
 * not real face matching — this tests the integration, not the model.
 * Nothing is written to any Toastly database.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHmac } from "node:crypto";

// .env.local, without printing anything from it.
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
if (!process.env.SMILE_ID_PARTNER_ID || !process.env.SMILE_ID_API_KEY) {
  console.log("SMILE_ID_PARTNER_ID / SMILE_ID_API_KEY aren't in .env.local yet — nothing to test.");
  process.exit(2);
}
if (process.env.SMILE_ID_ENVIRONMENT && process.env.SMILE_ID_ENVIRONMENT !== "sandbox") {
  console.log("SMILE_ID_ENVIRONMENT isn't 'sandbox'. This test only runs against the sandbox.");
  process.exit(2);
}
process.env.SMILE_ID_ENVIRONMENT = "sandbox";

const smile = await import("../lib/smile-id.ts");
const rules = await import("../lib/face-match.ts");

const BASE = "https://testapi.smileidentity.com";
const results = [];
const record = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name.padEnd(58)} ${detail}`);
};

// A face image: the argument, or the first sizeable JPEG among the prototype
// assets. The sandbox doesn't judge the face; it needs a valid JPEG.
function faceImage() {
  const arg = process.argv[2];
  if (arg) return fs.readFileSync(arg);
  const dir = "design/prototype/assets";
  const jpg = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".jpg"))
    .map((f) => path.join(dir, f))
    .find((f) => fs.statSync(f).size > 30_000);
  if (!jpg) throw new Error("No JPEG found; pass one as an argument.");
  return fs.readFileSync(jpg);
}

async function token() {
  const res = await fetch(`${BASE}/v3/token`, {
    method: "POST",
    headers: {
      "SmileID-Partner-ID": process.env.SMILE_ID_PARTNER_ID,
      "SmileID-API-Key": process.env.SMILE_ID_API_KEY,
    },
  });
  return res.ok ? (await res.json()).token : null;
}

async function poll(jobId) {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${BASE}/v3/status/${jobId}`, {
      headers: { "SmileID-Token": await token(), "SmileID-Partner-ID": process.env.SMILE_ID_PARTNER_ID, Accept: "application/json" },
    });
    if (res.status === 200) return res.json();
    if (res.status === 404) return { status: "not_found" };
    await new Promise((r) => setTimeout(r, 3000));
  }
  return { status: "timeout" };
}

console.log("Smile ID sandbox\n");

const t = await token();
record("1. a v3 token is minted", Boolean(t));
if (!t) process.exit(1);

const jpeg = new Blob([faceImage()], { type: "image/jpeg" });
const capture = { selfie: jpeg, livenessFrames: Array.from({ length: 8 }, () => jpeg) };
const profileId = `toastly-sandbox-${randomUUID()}`;
const consent = { grantedAt: new Date().toISOString(), language: "en" };
const callbackUrl = "https://trytoastly.com/api/webhooks/smile-id";

let compareJob;
try {
  compareJob = await smile.submitCompare({
    checkId: randomUUID(), profileId, capture, mainPhoto: jpeg, consent, callbackUrl, step: "onboard", enrol: true,
  });
  record("2. onboarding Compare is accepted (enrols the user)", Boolean(compareJob), compareJob);
} catch (e) {
  record("2. onboarding Compare is accepted (enrols the user)", false, e.message);
}

let compareResult;
if (compareJob) {
  compareResult = await poll(compareJob);
  record("   …and reaches a result", ["clear", "attention", "block", "error"].includes(compareResult.status),
    `${compareResult.status}${compareResult.reason ? " / " + compareResult.reason : ""}`);
  const mapped = rules.onboardingOutcome({ status: compareResult.status, reason: compareResult.reason ?? null });
  record("4a. the result maps to an onboarding outcome", Boolean(mapped?.live), JSON.stringify(mapped));
}

if (compareResult?.status === "clear") {
  try {
    const authJob = await smile.submitAuthentication({ checkId: randomUUID(), profileId, capture, consent, callbackUrl });
    record("3. Authentication against the enrolled user is accepted", Boolean(authJob), authJob);
    const authResult = await poll(authJob);
    record("   …and reaches a result", ["clear", "attention", "block", "error"].includes(authResult.status),
      `${authResult.status}${authResult.reason ? " / " + authResult.reason : ""}`);
    const mapped = rules.combineOutcomes(
      { status: authResult.status, reason: authResult.reason ?? null },
      { status: compareResult.status, reason: compareResult.reason ?? null },
    );
    record("4b. replace-photo results combine to an outcome", Boolean(mapped?.outcome), JSON.stringify(mapped));
  } catch (e) {
    record("3. Authentication against the enrolled user is accepted", false, e.message);
  }
} else {
  console.log("  (skipping Authentication: the Compare didn't enrol the user)");
}

// 5. The webhook signature, as Smile ID computes it.
const ts = new Date().toISOString();
const sig = createHmac("sha256", process.env.SMILE_ID_API_KEY)
  .update(`${ts}${process.env.SMILE_ID_PARTNER_ID}sid_request`)
  .digest("base64");
record("5. a genuine webhook signature is accepted",
  smile.verifyWebhook(new Headers({ "Response-Timestamp": ts, "Response-Signature": sig })));
record("   …and a tampered one is refused",
  !smile.verifyWebhook(new Headers({ "Response-Timestamp": ts, "Response-Signature": sig.replace(/^./, (c) => (c === "A" ? "B" : "A")) })));

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} sandbox checks passed`);
process.exit(failed ? 1 : 0);

/**
 * Smile ID webhook signature check (lib/smile-id.ts), with throwaway
 * credentials: base64(HMAC-SHA256(api key, Response-Timestamp + partner id
 * + "sid_request")). A forged or missing signature must never be accepted —
 * the webhook is what records a face match.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

process.env.SMILE_ID_PARTNER_ID = "0000";
process.env.SMILE_ID_API_KEY = "test-key-not-real";
const { verifyWebhook } = await import("../../lib/smile-id.ts");

const ts = "2026-10-05T12:00:00.000Z";
const good = createHmac("sha256", "test-key-not-real").update(`${ts}0000sid_request`).digest("base64");
const cases = [
  ["a genuine signature is accepted", verifyWebhook(new Headers({ "Response-Timestamp": ts, "Response-Signature": good })), true],
  ["a signature for another timestamp is refused",
    verifyWebhook(new Headers({ "Response-Timestamp": "2026-10-05T12:00:01.000Z", "Response-Signature": good })), false],
  ["a signature made with another key is refused",
    verifyWebhook(new Headers({ "Response-Timestamp": ts, "Response-Signature": createHmac("sha256", "wrong").update(`${ts}0000sid_request`).digest("base64") })), false],
  ["no signature is refused", verifyWebhook(new Headers({ "Response-Timestamp": ts })), false],
];

let failed = 0;
for (const [name, actual, expected] of cases) {
  try {
    assert.equal(actual, expected);
    console.log(`  PASS  ${name}`);
  } catch {
    failed++;
    console.log(`  FAIL  ${name}`);
  }
}
console.log(`\n${cases.length - failed}/${cases.length} webhook signature rules passed`);
process.exit(failed ? 1 : 0);

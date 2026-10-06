/**
 * The face-match outcome rules (lib/face-match.ts), tested directly.
 *
 *   node --test scripts/face-match.test.mjs
 *
 * Node 24 runs the TypeScript module as-is (type stripping); the module is
 * pure, so no provider or database is needed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { authenticationOutcome, combineOutcomes, compareOutcome, onboardingOutcome } from "../lib/face-match.ts";

const clear = { status: "clear", reason: null };
const cases = [
  ["both clear -> matched", combineOutcomes(clear, clear), { outcome: "matched" }],
  ["borderline compare -> a person, never a rejection",
    combineOutcomes(clear, { status: "attention", reason: "medium_risk" }), { outcome: "review" }],
  ["borderline authentication -> a person",
    combineOutcomes({ status: "attention", reason: "medium_risk" }, clear), { outcome: "review" }],
  ["spoof flag -> a person decides",
    compareOutcome({ status: "block", reason: "spoof_detected" }), { outcome: "review" }],
  ["fraud flag -> a person decides",
    authenticationOutcome({ status: "block", reason: "account_locked_fraud" }), { outcome: "review" }],
  ["provider error -> a person, never held against the member",
    combineOutcomes(clear, { status: "error", reason: "internal_error" }), { outcome: "review" }],
  ["face unreadable -> 'face not clear'",
    compareOutcome({ status: "error", reason: "image_unavailable_or_invalid" }), { outcome: "mismatch", reason: "face_not_clear" }],
  ["photo isn't the selfie -> 'doesn't look like your selfie'",
    combineOutcomes(clear, { status: "block", reason: "face_verification_failed" }), { outcome: "mismatch", reason: "not_matching" }],
  ["selfie isn't the enrolled member -> outranks everything",
    combineOutcomes({ status: "block", reason: "face_verification_failed" }, clear), { outcome: "mismatch", reason: "not_same_person" }],
  ["onboarding: clear -> Verified Real and the main photo matched",
    onboardingOutcome(clear), { live: "passed", match: { outcome: "matched" } }],
  ["onboarding: live, but the photo isn't them -> Verified Real, photo not confirmed",
    onboardingOutcome({ status: "block", reason: "face_verification_failed" }),
    { live: "passed", match: { outcome: "mismatch", reason: "not_matching" } }],
  ["onboarding: couldn't read the images -> retake, nothing recorded as passed",
    onboardingOutcome({ status: "error", reason: "image_unavailable_or_invalid" }),
    { live: "retake", match: { outcome: "mismatch", reason: "face_not_clear" } }],
  ["onboarding: spoof flag -> a person decides both",
    onboardingOutcome({ status: "block", reason: "spoof_detected" }), { live: "review", match: { outcome: "review" } }],
  ["onboarding: borderline -> a person, never a rejection",
    onboardingOutcome({ status: "attention", reason: "medium_risk" }), { live: "review", match: { outcome: "review" } }],
  ["not the member AND photo mismatch -> 'not the same person'",
    combineOutcomes({ status: "block", reason: "face_verification_failed" }, { status: "block", reason: "face_verification_failed" }),
    { outcome: "mismatch", reason: "not_same_person" }],
];

for (const [name, actual, expected] of cases) {
  test(name, () => assert.deepEqual(actual, expected));
}

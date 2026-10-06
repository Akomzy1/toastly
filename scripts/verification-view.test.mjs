/**
 * The in-page ID check is two sessions on one capture (decided 6 October
 * 2026); the verify page reads them as one check (lib/verification-view.ts).
 *
 *   node --test scripts/verification-view.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveVerifyView, latestIdCheck } from "../lib/verification-view.ts";

const at = (min) => new Date(Date.now() - min * 60_000).toISOString();
const half = (step, status, check = "c1", created = at(2), result_code = null) => ({ step, status, check_id: check, created_at: created, result_code });

test("both halves clear reads as clear", () => {
  assert.equal(latestIdCheck([half("id_kyc", "clear"), half("id_auth", "clear")]).status, "clear");
});

test("either half still running reads as being checked", () => {
  assert.equal(latestIdCheck([half("id_kyc", "clear"), half("id_auth", "submitted")]).status, "submitted");
});

test("the record refusing comes first, with its own reason", () => {
  const r = latestIdCheck([half("id_kyc", "block", "c1", at(2), "identifier_not_found"), half("id_auth", "block")]);
  assert.deepEqual([r.status, r.result_code], ["block", "identifier_not_found"]);
});

test("a selfie that isn't the registered face reads as 'not the same person'", () => {
  const r = latestIdCheck([half("id_kyc", "clear"), half("id_auth", "block", "c1", at(2), "face_mismatch")]);
  assert.deepEqual([r.status, r.result_code], ["block", "not_same_person"]);
});

test("a borderline half reads as with a person", () => {
  assert.equal(latestIdCheck([half("id_kyc", "attention"), half("id_auth", "clear")]).status, "attention");
});

test("only the latest pair counts, and a retired hosted check counts for nothing", () => {
  const rows = [
    half("id_kyc", "block", "old", at(60)), half("id_auth", "block", "old", at(60)),
    half("id_kyc", "clear", "new", at(1)), half("id_auth", "clear", "new", at(1)),
    { step: null, status: "error", check_id: null, created_at: at(0), result_code: "hosted_flow_retired" },
  ];
  assert.equal(latestIdCheck(rows).status, "clear");
  assert.equal(latestIdCheck([{ step: null, status: "clear", check_id: null, created_at: at(0), result_code: null }]), null);
});

test("a Verified Real member with a refused selfie half is asked to retry, not shown as passed", () => {
  const id = latestIdCheck([half("id_kyc", "clear"), half("id_auth", "block")]);
  assert.equal(deriveVerifyView("verified_real", null, id).kind, "id_retry");
});

// --- Decided 6 October 2026 ------------------------------------------------

import { selfieSummary } from "../lib/verification-view.ts";
import { REASON_COPY } from "../lib/verification-copy.ts";
import { CONSENT } from "../lib/consent.ts";
import { enabledIdTypes } from "../lib/smile-id.ts";

test("a refused re-check reads as 'didn't match the face you verified with' — unless the picture itself was the problem", () => {
  const refused = selfieSummary({ step: "reverify", status: "block", result_code: "face_mismatch", created_at: at(1) });
  assert.equal(refused.result_code, "not_same_person");
  assert.equal(REASON_COPY.not_same_person, "That selfie didn't match the face you verified with. Try again in good light, facing the camera.");
  assert.equal(selfieSummary({ step: "reverify", status: "block", result_code: "spoof_detected", created_at: at(1) }).result_code, "spoof_detected");
  assert.equal(selfieSummary({ step: "onboard", status: "block", result_code: "face_mismatch", created_at: at(1) }).result_code, "face_mismatch", "onboarding keeps its own reason");
});

test("Virtual NIN is hidden until the flag is set — no code change to turn it on", () => {
  const before = process.env.SMILE_ID_VNIN_ENABLED;
  try {
    delete process.env.SMILE_ID_VNIN_ENABLED;
    assert.deepEqual(enabledIdTypes(), ["NIN_V2", "BVN"]);
    process.env.SMILE_ID_VNIN_ENABLED = "true";
    assert.deepEqual(enabledIdTypes(), ["NIN_V2", "V_NIN", "BVN"]);
    process.env.SMILE_ID_VNIN_ENABLED = "1";
    assert.deepEqual(enabledIdTypes(), ["NIN_V2", "BVN"], "only 'true' turns it on");
  } finally {
    if (before === undefined) delete process.env.SMILE_ID_VNIN_ENABLED;
    else process.env.SMILE_ID_VNIN_ENABLED = before;
  }
});

test("the consent screens carry the owner's wording, with new versions so members are asked again", () => {
  const s1 = CONSENT.verification_selfie;
  assert.notEqual(s1.version, "2026-10-05");
  assert.match(s1.body[1], /never your images\.$/);
  assert.equal(s1.body[2], "Smile ID also registers your face against your Toastly account, so that if we ever ask you to re-check, it can confirm it's still you.", "its own paragraph, as in the wording document");
  assert.equal(s1.checkbox, "I agree to Smile ID checking my selfie, comparing it with my main photo and registering my face for later re-checks, as described above.");

  const s3 = CONSENT.id_check;
  assert.notEqual(s3.version, "2026-10-05");
  assert.equal(s3.body[0], "We'll ask Smile ID to check your number against the official record, and to match a new selfie to both the record and the face you verified with.");

  const s4 = CONSENT.reverify_selfie;
  assert.equal(s4.title, "Quick re-check");
  assert.deepEqual(s4.body, [
    "We sometimes ask members to confirm it's still them. One selfie, about a minute.",
    "Smile ID compares it with the face registered when you verified. **Toastly keeps only the result.** Smile ID keeps the images for up to five years, under its own terms.",
  ]);
  assert.equal(s4.checkbox, "I agree to Smile ID checking that I'm a real person, here now, and the same person who verified this account.");
  assert.deepEqual([s4.primary, s4.secondary], ["Start", "Not now"]);
  assert.notEqual(s4.version, "2026-10-06", "the interim wording's version is retired");
  assert.equal(CONSENT.replace_main_photo.version, "2026-10-05", "screen 2 didn't change");
});

// --- The ID ring during a re-check ("ID check (unchanged)") -----------------

import { ringSteps } from "../lib/ring-steps.ts";

test("during a re-check the ID ring shows as it stands: done for a member who has it, optional for one who doesn't", () => {
  for (const kind of ["start", "selfie_retry", "selfie_checking", "selfie_review"]) {
    const view = kind === "selfie_retry" ? { kind, status: "block", code: null } : { kind };
    const withId = ringSteps(view, true, true).steps;
    const without = ringSteps(view, true, false).steps;
    assert.deepEqual(withId[2], { label: "ID check", ring: "done", status: "Done" }, `${kind}: the ring isn't taken away`);
    assert.deepEqual(without[2], { label: "ID check", ring: "optional", status: "Optional" }, `${kind}: never "missing"`);
    assert.equal(withId[1].label, "Verified Real");
    assert.notEqual(withId[1].status, "Next", "never 'Next' on a re-check");
  }
  assert.equal(ringSteps({ kind: "start" }, true, true).steps[1].status, "Re-check");
});

test("outside a re-check the stepper is unchanged", () => {
  assert.equal(ringSteps({ kind: "start" }).steps[1].status, "Next");
  assert.deepEqual(ringSteps({ kind: "both" }).steps[2], { label: "ID check", ring: "done", status: "Done" });
});

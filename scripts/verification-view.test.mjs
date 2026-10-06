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

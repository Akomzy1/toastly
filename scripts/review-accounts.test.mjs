/**
 * The review-account script's own rules (scripts/db/review-accounts.mjs): the
 * number's hash and gate key are exactly the app's, the test-code list loses
 * only this number, a number is never printed in full, and the fictional spec
 * carries no protected field.
 *
 *   node --test scripts/review-accounts.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const script = await import(pathToFileURL(path.resolve("scripts/db/review-accounts.mjs")).href);
const beta = await import(pathToFileURL(path.resolve("lib/beta.ts")).href);
const spec = JSON.parse(fs.readFileSync("scripts/db/review-accounts.spec.json", "utf8"));

const NUMBER = "+2348031234567";
const PEPPER = "test-pepper";

test("the gate key is the app's", () => {
  assert.equal(script.betaPhoneKey(NUMBER, PEPPER), beta.betaPhoneKey(NUMBER, PEPPER));
});

test("the phone hash is the app's (verify/actions.ts hashPhone)", () => {
  // The app's definition, verbatim: sha256 of `${e164}:${pepper}`.
  const src = fs.readFileSync("app/(app)/verify/actions.ts", "utf8");
  assert.match(src, /createHash\("sha256"\)\.update\(`\$\{e164\}:\$\{pepper \?\? ""\}`\)\.digest\("hex"\)/);
  assert.equal(script.hashPhone(NUMBER, PEPPER), crypto.createHash("sha256").update(`${NUMBER}:${PEPPER}`).digest("hex"));
});

test("the test-code list loses only this number", () => {
  const list = "2348031234567=482915, 447700900123=111111";
  assert.equal(script.withoutTestNumber(list, NUMBER), "447700900123=111111");
  assert.equal(script.withoutTestNumber("2348031234567=482915", NUMBER), "");
  assert.equal(script.withoutTestNumber("+2348031234567=482915", NUMBER), "");
  assert.equal(script.withoutTestNumber("", NUMBER), "");
  assert.equal(script.withoutTestNumber(null, NUMBER), "");
});

test("a number is never printed in full", () => {
  const masked = script.maskPhone(NUMBER);
  assert.ok(!masked.replace(/\D/g, "").includes("1234567".slice(0, 5)), masked);
  assert.ok(masked.endsWith("67"));
});

test("the fictional spec is ready, and a protected field or a wrong gender is refused", () => {
  assert.deepEqual(script.checkSpec(spec, null), []);
  const bad = structuredClone(spec);
  bad.companions[0].religion = "x";
  bad.reviewer.gender = "man";
  const problems = script.checkSpec(bad, null);
  assert.ok(problems.some((p) => /religion is a protected field/.test(p)));
  assert.ok(problems.some((p) => /reviewer must be a woman/.test(p)));
});

test("the spec never holds a phone number or an email", () => {
  const raw = fs.readFileSync("scripts/db/review-accounts.spec.json", "utf8");
  assert.doesNotMatch(raw, /\+?234\d{10}|0[789][01]\d{8}/);
  assert.doesNotMatch(raw, /@/);
});

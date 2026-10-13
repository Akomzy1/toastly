/**
 * Height: cm and feet/inches (lib/height.ts; PRD §5.2).
 *
 *   node --test scripts/height.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cmToFtIn, ftInToCm, formatHeight, heightInRange, HEIGHT_MIN_CM, HEIGHT_MAX_CM } from "../lib/height.ts";

test("the range is 120–220 cm and nothing outside it passes", () => {
  assert.equal(HEIGHT_MIN_CM, 120);
  assert.equal(HEIGHT_MAX_CM, 220);
  for (const ok of [120, 170, 220]) assert.equal(heightInRange(ok), true, String(ok));
  for (const bad of [119, 221, 0, -1, 170.5, NaN]) assert.equal(heightInRange(bad), false, String(bad));
});

test("cm to feet and inches, and back, to the nearest centimetre", () => {
  assert.deepEqual(cmToFtIn(170), { ft: 5, inch: 7 });
  assert.deepEqual(cmToFtIn(183), { ft: 6, inch: 0 });
  assert.deepEqual(cmToFtIn(120), { ft: 3, inch: 11 });
  assert.equal(ftInToCm(5, 7), 170);
  assert.equal(ftInToCm(6, 0), 183);
  for (let cm = 120; cm <= 220; cm++) {
    const { ft, inch } = cmToFtIn(cm);
    assert.ok(inch >= 0 && inch <= 11, `${cm} cm -> ${ft}'${inch}`);
    assert.ok(Math.abs(ftInToCm(ft, inch) - cm) <= 1, `${cm} cm round-trips within a cm`);
  }
});

test("shown as 5′7″ · 170 cm", () => {
  assert.equal(formatHeight(170), "5′7″ · 170 cm");
  assert.equal(formatHeight(183), "6′0″ · 183 cm");
});

/**
 * Religion and denomination on the profile (PRD §5.2.3; lib/faith.ts), and
 * PostHog never receiving them (lib/analytics.ts).
 *
 *   node --test scripts/faith.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { faithLine, faithShown } from "../lib/faith.ts";
import { capture } from "../lib/analytics.ts";

const base = { religion: "Christian", religion_other: null, denomination: "pentecostal", denomination_other: null, religion_visibility: "public" };

test("the full profile shows faith on one line: 'Christian · Pentecostal'", () => {
  assert.equal(faithLine(base, "other"), "Christian · Pentecostal");
  assert.equal(faithLine({ ...base, denomination: "white_garment" }, "other"), "Christian · White-garment (Celestial, C&S, CAC)");
  assert.equal(faithLine({ ...base, denomination: null }, "other"), "Christian");
  assert.equal(faithLine({ ...base, religion: "Muslim", denomination: "other", denomination_other: "Tijaniyya" }, "other"), "Muslim · Tijaniyya");
  assert.equal(faithLine({ ...base, religion: "Other", religion_other: "Eckankar", denomination: null }, "other"), "Eckankar");
});

test("hiding religion hides denomination from other members — one setting for both", () => {
  const hidden = { ...base, religion_visibility: "private" };
  assert.equal(faithShown(hidden), false);
  assert.equal(faithLine(hidden, "other"), null, "nothing of either");
  assert.equal(faithLine({ ...base, religion_visibility: "on_match" }, "other"), null, "only 'shown' shows");
  assert.equal(faithLine(hidden, "owner"), "Christian · Pentecostal", "the member still sees their own");
});

test("a religion stored before the option list shows as stored", () => {
  assert.equal(faithLine({ ...base, religion: "Christianity (RCCG)", denomination: null }, "other"), "Christianity (RCCG)");
});

test("PostHog never receives religion or denomination — not as a property", async () => {
  const before = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const realFetch = globalThis.fetch;
  let sent = null;
  process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
  globalThis.fetch = async (_url, init) => {
    sent = JSON.parse(init.body);
    return new Response("{}", { status: 200 });
  };
  try {
    await capture("signup", "member-1", { denomination: "pentecostal", denomination_other: "x", religion: "Christian", religion_other: "x", faith: "x", step: "ok" });
    assert.deepEqual(sent.properties, { step: "ok" });
  } finally {
    globalThis.fetch = realFetch;
    if (before === undefined) delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    else process.env.NEXT_PUBLIC_POSTHOG_KEY = before;
  }
});

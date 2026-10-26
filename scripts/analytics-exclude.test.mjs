/**
 * Review accounts (0051) never reach PostHog: capture() sends nothing for a
 * profile id listed in ANALYTICS_EXCLUDE_IDS, and still sends for everyone
 * else.
 *
 *   node --test scripts/analytics-exclude.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const analytics = await import(pathToFileURL(path.resolve("lib/analytics.ts")).href);

const REVIEW = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";

test("the exclusion list is read exactly", () => {
  const env = { ANALYTICS_EXCLUDE_IDS: ` ${REVIEW} , 33333333-3333-4333-8333-333333333333` };
  assert.equal(analytics.excludedFromAnalytics(REVIEW, env), true);
  assert.equal(analytics.excludedFromAnalytics(MEMBER, env), false);
  assert.equal(analytics.excludedFromAnalytics(MEMBER, {}), false);
  assert.equal(analytics.excludedFromAnalytics("", { ANALYTICS_EXCLUDE_IDS: "" }), false);
});

test("capture sends nothing for a review account, and still sends for a member", async () => {
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    sent.push(JSON.parse(init.body).distinct_id);
    return { ok: true };
  };
  process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
  process.env.ANALYTICS_EXCLUDE_IDS = REVIEW;
  try {
    assert.equal(await analytics.capture("signup", REVIEW), false);
    assert.equal(await analytics.capture("signup", MEMBER), true);
    assert.deepEqual(sent, [MEMBER]);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    delete process.env.ANALYTICS_EXCLUDE_IDS;
  }
});

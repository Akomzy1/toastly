/**
 * VIDEO_GIST_ENABLED and SEE_WHO_LIKED_ENABLED (lib/features.ts), in both
 * states each, through the real listing builders — and the build check that
 * fails when payments are on and a switched-off feature is listed.
 *
 *   node --test scripts/feature-flags.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { collectListings, findViolations, flagsFromEnv, listsVideo } from "./check-launch-flags.mjs";

const COMING = "Voice first. Live video is coming to Premium Plus.";
const STATES = [
  { videoGist: false, seeWhoLiked: false },
  { videoGist: true, seeWhoLiked: false },
  { videoGist: false, seeWhoLiked: true },
  { videoGist: true, seeWhoLiked: true },
];
const by = (listings, source) => listings.find((l) => l.source.startsWith(source)).text;

test("the flags are off unless set to exactly 'true'", () => {
  assert.deepEqual(flagsFromEnv({}), { videoGist: false, seeWhoLiked: false });
  assert.deepEqual(flagsFromEnv({ VIDEO_GIST_ENABLED: "1", SEE_WHO_LIKED_ENABLED: "yes" }), { videoGist: false, seeWhoLiked: false });
  assert.deepEqual(flagsFromEnv({ VIDEO_GIST_ENABLED: "true", SEE_WHO_LIKED_ENABLED: "true" }), { videoGist: true, seeWhoLiked: true });
});

for (const f of STATES) {
  const name = `video ${f.videoGist ? "on" : "off"}, see-who-liked ${f.seeWhoLiked ? "on" : "off"}`;
  test(`listings follow the flags — ${name}`, () => {
    const l = collectListings(f);
    const video = { test: listsVideo };
    const liked = /who liked you/i;

    // Pricing, the plan screens (same tiers), the compare table, Why pay.
    for (const src of ["pricing: Nigeria tiers", "pricing: Diaspora tiers", "pricing: compare table", "pricing: Why pay"]) {
      assert.equal(video.test(by(l, src)), f.videoGist, `${src}: video listed iff on`);
    }
    assert.equal(liked.test(by(l, "pricing: Nigeria tiers")), f.seeWhoLiked);
    assert.equal(liked.test(by(l, "pricing: compare table")), f.seeWhoLiked);
    // Structured data, llms.txt, Toastly Help.
    for (const src of ["structured data", "llms.txt", "Toastly Help"]) {
      assert.equal(video.test(by(l, src)), f.videoGist, `${src}: video iff on`);
      assert.equal(liked.test(by(l, src)), f.seeWhoLiked, `${src}: see-who-liked iff on`);
    }
    // Home, How It Works, Features: the approved line when on; the coming line when off.
    for (const src of ["Home", "How It Works", "Features"]) {
      const t = by(l, src);
      assert.equal(listsVideo(t), f.videoGist, `${src}: no sentence offers video unless on`);
      assert.equal(t.includes("Live video unlocks on Premium Plus"), f.videoGist, `${src}: approved line iff on`);
      assert.equal(t.includes(COMING), !f.videoGist, `${src}: "${COMING}" iff off`);
    }
    // Incognito is listed nowhere, in any state.
    for (const { source, text } of l) assert.doesNotMatch(text, /incognito/i, `${source} mentions incognito`);
    // And with these flags, nothing fails the build even with payments on.
    assert.deepEqual(findViolations(l, f, true), []);
  });
}

test("the build check fails a listing of a switched-off feature once payments are on — and only then", () => {
  const planted = [
    { source: "pricing", text: "Everything in Premium, plus: Live-video Gist sessions" },
    { source: "Toastly Help", text: "Premium Plus includes see who liked you." },
  ];
  const off = { videoGist: false, seeWhoLiked: false };
  const hits = findViolations(planted, off, true);
  assert.equal(hits.length, 2);
  assert.match(hits[0], /VIDEO_GIST_ENABLED is off/);
  assert.match(hits[1], /SEE_WHO_LIKED_ENABLED is off/);
  assert.deepEqual(findViolations(planted, off, false), [], "payments off: not checked");
  assert.deepEqual(findViolations(planted, { videoGist: true, seeWhoLiked: true }, true), [], "flags on: allowed");
  assert.deepEqual(findViolations([{ source: "Home", text: COMING }], off, true), [], "the coming line isn't a listing");
});

test("the build step itself: payments on with both flags off passes on today's content", () => {
  const r = spawnSync(process.execPath, ["scripts/check-launch-flags.mjs"], {
    encoding: "utf8",
    env: { ...process.env, LAUNCH_PAYMENTS_ENABLED: "true", VIDEO_GIST_ENABLED: "", SEE_WHO_LIKED_ENABLED: "" },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /payments on, video off, see-who-liked off/);
});

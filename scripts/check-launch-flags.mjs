/**
 * Launch-flag build check (decided 8 October 2026). Runs before `next build`.
 *
 * If LAUNCH_PAYMENTS_ENABLED is "true" while VIDEO_GIST_ENABLED or
 * SEE_WHO_LIKED_ENABLED is off, any page or Help answer that lists that
 * feature as included fails the build. It evaluates the real listing
 * builders with this deploy's flags — pricing tiers, the compare table,
 * "Why pay", the plan screens' tiers, the structured data, llms.txt, Toastly
 * Help's facts, and the lines on Home, How It Works and Features — plus the
 * source of the screens that carry fixed copy (the women's offer, sign-up,
 * the announce bar, the plan screen).
 *
 *   node scripts/check-launch-flags.mjs
 *
 * "Live video is coming to Premium Plus" is not a listing; anything else
 * naming live video (or see who liked you) is.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import createJiti from "jiti";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * A listing of live video: any sentence that names video together with a
 * plan, an upgrade, an unlock or "when you both…" — unless it says it's
 * coming. "Voice first. Live video is coming to Premium Plus." is not a
 * listing; "Video is a Premium Plus upgrade" is.
 */
const VIDEO_OFFER = /premium plus|diaspora plus|\bupgrade|\bunlock|\binclud|when you both|mutual consent|live[- ]?video|video[- ]gist/i;
export function listsVideo(text) {
  return text
    .split(/(?<=[.!?])\s+|\\n|\n|"\s*,\s*"|\]\s*,\s*\[/)
    .some((s) => /\bvideo\b/i.test(s) && !/\bcoming\b/i.test(s) && VIDEO_OFFER.test(s));
}
const VIDEO = { test: listsVideo };
const LIKED = /\bsee(?:ing)? who (?:has )?liked you\b|\bwho liked you\b/i;

/** Screens whose copy is fixed in the source (comments stripped before scanning). */
const FIXED_SOURCES = [
  "app/(marketing)/pricing/page.tsx",
  "components/announce-bar.tsx",
  "app/(auth)/signup/signup-form.tsx",
  "components/plan/plan-page.tsx",
  "components/pricing-card.tsx",
  "components/pricing-compare.tsx",
];

const stripComments = (src) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*/gm, "");

/** Every listing, built with these flags: [{ source, text }]. */
export function collectListings(flags) {
  const jiti = createJiti(path.join(ROOT, "scripts/check-launch-flags.mjs"), {
    alias: { "@": ROOT },
    interopDefault: true,
    cache: false,
    requireCache: false,
  });
  const load = (p) => jiti(path.join(ROOT, p));
  const pricing = load("lib/pricing-content.ts");
  const schema = load("lib/schema.ts");
  const llms = load("lib/llms.ts");
  const help = load("lib/concierge/system.ts");
  const home = load("lib/home-content.ts");
  const hiw = load("lib/how-it-works-content.ts");
  const feats = load("lib/features-content.ts");
  const out = [
    ["pricing: Nigeria tiers (pricing page, plan screens)", pricing.ngTiersFor(flags)],
    ["pricing: Diaspora tiers (pricing page, plan screens)", pricing.dpTiersFor(flags)],
    ["pricing: compare table", pricing.compareRowsFor(flags)],
    ["pricing: Why pay", pricing.whyPayFor(flags)],
    ["structured data", schema.softwareApplicationSchema(flags)],
    ["llms.txt", llms.llmsBody(flags)],
    ["Toastly Help", help.conciergeSystem(flags)],
    ["Home", [home.stepsFor(flags), home.gistPointsFor(flags)]],
    ["How It Works", [hiw.stepsFor(flags), hiw.faqsFor(flags)]],
    ["Features", feats.deepDivesFor(flags)],
  ].map(([source, v]) => ({ source, text: typeof v === "string" ? v : JSON.stringify(v) }));
  for (const f of FIXED_SOURCES) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p)) out.push({ source: f, text: stripComments(fs.readFileSync(p, "utf8")) });
  }
  return out;
}

/** What fails the build: listings of a switched-off feature, once payments are on. */
export function findViolations(listings, flags, launched) {
  if (!launched) return [];
  const hits = [];
  for (const { source, text } of listings) {
    if (!flags.videoGist && VIDEO.test(text)) hits.push(`${source} lists live video, but VIDEO_GIST_ENABLED is off`);
    if (!flags.seeWhoLiked && LIKED.test(text)) hits.push(`${source} lists see who liked you, but SEE_WHO_LIKED_ENABLED is off`);
  }
  return hits;
}

export function flagsFromEnv(env = process.env) {
  return { videoGist: env.VIDEO_GIST_ENABLED === "true", seeWhoLiked: env.SEE_WHO_LIKED_ENABLED === "true" };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const flags = flagsFromEnv();
  const launched = process.env.LAUNCH_PAYMENTS_ENABLED === "true";
  const hits = findViolations(collectListings(flags), flags, launched);
  const state = `payments ${launched ? "on" : "off"}, video ${flags.videoGist ? "on" : "off"}, see-who-liked ${flags.seeWhoLiked ? "on" : "off"}`;
  if (hits.length) {
    console.error(`Launch-flag check FAILED (${state}):\n  - ${hits.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`Launch-flag check ok (${state}).`);
}

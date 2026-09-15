/**
 * Mobile audit — Prompt 9, item 5.
 *
 *   node scripts/audit-mobile.mjs [baseUrl] [width]
 *
 * Loads every route at a low-end Android width (360px by default) and
 * reports two things a screenshot cannot prove:
 *
 *   1. Horizontal overflow — the page body scrolling sideways. Elements inside
 *      their own overflow-x container (the pricing comparison table) are
 *      allowed to be wider; the page itself is not.
 *   2. Touch targets — every link, button, field and disclosure, measured.
 *        FAIL  under 24px in either dimension (WCAG 2.5.8, AA)
 *        WARN  under 44px (WCAG 2.5.5 / platform guidance) and not an inline
 *              text link inside a sentence, which 2.5.8 exempts
 *      Checkboxes and radios are measured by their label, which is the real
 *      target.
 */
import puppeteer from "puppeteer-core";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const WIDTH = Number(process.argv[3] ?? 360);

const ROUTES = [
  "/", "/features", "/how-it-works", "/pricing", "/safety", "/diaspora", "/stories",
  "/login", "/signup",
  "/verify", "/profile", "/feed", "/inbox", "/gist", "/wallet", "/couple", "/safety-kit",
];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

let failures = 0;
let warnings = 0;

for (const route of ROUTES) {
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: 740, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);

  const res = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1200));

  const result = await page.evaluate(() => {
    const vw = window.innerWidth;

    function clippedByAncestor(el) {
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const ox = getComputedStyle(a).overflowX;
        if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") return true;
      }
      return false;
    }

    const overflow = document.documentElement.scrollWidth > vw + 1;
    const wide = [];
    if (overflow) {
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width && r.right > vw + 1 && !clippedByAncestor(el)) {
          wide.push(`${el.tagName.toLowerCase()} (${Math.round(r.right)}px)`);
          if (wide.length >= 4) break;
        }
      }
    }

    const fail = [];
    const warn = [];
    const targets = document.querySelectorAll(
      "a[href], button, input:not([type=hidden]), select, textarea, summary",
    );
    for (const el of targets) {
      let r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;

      if ((el.type === "checkbox" || el.type === "radio") && el.closest("label")) {
        r = el.closest("label").getBoundingClientRect();
      }

      // WCAG 2.5.8 exempts a target "in a sentence" -- a link inside running
      // text. A list of navigation links is not a sentence, so <li> does not
      // qualify (an earlier version of this script wrongly let it).
      const inlineLink =
        el.tagName === "A" && cs.display === "inline" && Boolean(el.closest("p, dd, figcaption"));

      const label = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("name") || el.tagName)
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 38);
      const entry = `${el.tagName.toLowerCase()} "${label}" ${Math.round(r.width)}x${Math.round(r.height)}`;

      // The exemption applies at both thresholds -- an earlier version
      // reported inline sentence links as outright failures.
      if (inlineLink) continue;
      if (r.height < 24 || r.width < 24) fail.push(entry);
      else if (r.height < 44 || r.width < 44) warn.push(entry);
    }

    return { overflow, wide, fail, warn };
  });

  const status = res?.status() ?? 0;
  failures += result.fail.length + (result.overflow ? 1 : 0);
  warnings += result.warn.length;

  const flag = result.overflow || result.fail.length ? "FAIL" : result.warn.length ? "warn" : "ok  ";
  console.log(
    `${flag}  ${route.padEnd(14)} ${status}  overflow:${result.overflow ? "YES" : "no "}  fail:${result.fail.length}  warn:${result.warn.length}`,
  );
  for (const w of result.wide) console.log(`        wider than viewport: ${w}`);
  for (const f of result.fail.slice(0, 6)) console.log(`        FAIL ${f}`);
  for (const w of result.warn.slice(0, 6)) console.log(`        warn ${w}`);

  await page.close();
}

await browser.close();
console.log(`\n${WIDTH}px: ${failures} failure(s), ${warnings} warning(s)`);
process.exit(failures ? 1 : 0);

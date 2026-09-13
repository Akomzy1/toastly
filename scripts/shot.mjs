/**
 * Screenshot a page for visual review.
 *
 *   node scripts/shot.mjs <url> <out.png> [width]
 *
 * Three things this handles that a naive capture does not:
 *   - the hero video loops, so the network never goes idle;
 *   - reveal animations are driven by IntersectionObserver and only fire
 *     once scrolled into view;
 *   - next/image optimises on demand, so an early capture shows empty
 *     frames that look like layout bugs but are not.
 */
import puppeteer from "puppeteer-core";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const url = process.argv[2];
const out = process.argv[3];
const width = Number(process.argv[4] || 390);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const page = await browser.newPage();
await page.setViewport({ width, height: 844, deviceScaleFactor: 1 });

// Capture content, not animation state: reduced motion makes every reveal
// render in its final position. It also exercises that code path.
await page.emulateMediaFeatures([
  { name: "prefers-reduced-motion", value: "reduce" },
]);

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("requestfailed", (r) => errors.push("FAILED " + r.url().slice(0, 110)));
page.on("response", (r) => {
  if (r.status() >= 400) errors.push(r.status() + " " + r.url().slice(0, 110));
});

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

// Scroll the whole page so IntersectionObserver reveals fire, then return.
await page.evaluate(async () => {
  const step = window.innerHeight;
  for (let y = 0; y < document.body.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 80));
  }
  window.scrollTo(0, 0);
});

// Wait for every image to finish decoding.
await page
  .waitForFunction(
    () =>
      [...document.querySelectorAll("img")].every(
        (i) => i.complete && i.naturalWidth > 0,
      ),
    { timeout: 90000, polling: 400 },
  )
  .catch(async () => {
    const bad = await page.evaluate(() =>
      [...document.querySelectorAll("img")]
        .filter((i) => !i.complete || i.naturalWidth === 0)
        .map((i) => (i.getAttribute("src") || "(no src)").slice(0, 70)),
    );
    console.log("images that never completed: " + bad.join(" | "));
  });

await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: out, fullPage: true });

const height = await page.evaluate(() => document.documentElement.scrollHeight);
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth > window.innerWidth,
);

console.log(`${out}  ${width}px wide, ${height}px tall, overflow: ${overflow}`);

// Route prefetches for pages not built yet are expected noise; drop them.
const real = errors.filter((e) => !/404 .*_rsc=/.test(e) && !/404 /.test(e));
console.log(real.length ? "errors:\n  " + real.slice(0, 6).join("\n  ") : "no page errors");

await browser.close();

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
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
page.on("requestfailed", (r) => errors.push("FAILED " + r.url().slice(0, 110)));
page.on("response", (r) => { if (r.status() >= 400) errors.push(r.status() + " " + r.url().slice(0, 110)); });

await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
// Scroll the whole page so IntersectionObserver-driven reveals fire, then
// return to the top. A full-page screenshot does not scroll on its own.
await page.evaluate(async () => {
  const step = window.innerHeight;
  for (let y = 0; y < document.body.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 60));
  }
  window.scrollTo(0, 0);
});
// Wait for every image to finish decoding. next/image optimises on demand,
// so a capture taken too early shows empty frames that look like bugs.
await page.waitForFunction(
  () => [...document.querySelectorAll("img")].every((i) => i.complete && i.naturalWidth > 0),
  { timeout: 60000, polling: 500 },
).catch(() => console.log("warning: some images never completed"));
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: out, fullPage: true });
const h = await page.evaluate(() => document.documentElement.scrollHeight);
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth > window.innerWidth,
);
console.log(`${out}  ${width}px wide, ${h}px tall, horizontal overflow: ${overflow}`);
if (errors.length) console.log("page errors:\n  " + errors.slice(0, 8).join("\n  "));
else console.log("no console errors");
await browser.close();

/**
 * Mobile audit — the one Prompts 9 and 12 could not run inside OneDrive.
 *
 * Visits every route at 320×568 and 360×640, writes a full-page screenshot per
 * route × width to audit/mobile/, and checks three things programmatically:
 *
 *   1. horizontal overflow — documentElement.scrollWidth > innerWidth
 *   2. any visible interactive element (a, button, input, select,
 *      [role=button], [role=tab]) with a bounding box under 44×44px
 *   3. any visible text under 12px computed font size
 *
 * Results go to audit/MOBILE-AUDIT.md (a route × width × check table with the
 * offending selector for every failure) and audit/mobile-audit.json.
 *
 * The in-app surfaces are behind auth, so they are audited through harness
 * routes under /audit that render the same components with mock data. Those
 * routes 404 unless AUDIT_HARNESS=1 is set on the server (lib/audit-harness.ts).
 *
 * Run:  AUDIT_HARNESS=1 next start   then   node scripts/mobile-audit.mjs
 * Exits 1 on any failure so it can gate CI.
 */

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = (process.env.AUDIT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const OUT_DIR = path.resolve("audit");
const SHOT_DIR = path.join(OUT_DIR, "mobile");

// The staff review console is used at tablet and desktop widths.
const CONSOLE = [
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];

const ROUTES = [
  // Seven marketing pages
  { route: "/", label: "Home" },
  { route: "/features", label: "Features" },
  { route: "/how-it-works", label: "How It Works" },
  { route: "/pricing", label: "Pricing" },
  { route: "/safety", label: "Safety & Trust" },
  { route: "/diaspora", label: "Diaspora" },
  { route: "/stories", label: "Stories" },
  { route: "/privacy", label: "Privacy Policy" },
  { route: "/signup", label: "Sign up" },
  { route: "/login", label: "Sign in" },
  // Locked inbox and the five newly designed in-app surfaces, via the harness
  { route: "/audit/locked-inbox", label: "Locked inbox" },
  { route: "/audit/city-picker", label: "City picker" },
  { route: "/audit/time-zone", label: "Time-zone select" },
  { route: "/audit/feed-fallback", label: "Feed fallback notice" },
  { route: "/audit/both-clocks", label: "Both-clocks display" },
  { route: "/audit/date-spot", label: "Date-spot card" },
  // Genotype — one route per prototype state
  { route: "/audit/genotype-consent", label: "Genotype consent" },
  { route: "/audit/genotype-entry", label: "Genotype entry" },
  { route: "/audit/genotype-visibility", label: "Genotype visibility" },
  { route: "/audit/genotype-settings", label: "Genotype settings row" },
  { route: "/audit/genotype-delete", label: "Genotype delete sheet" },
  { route: "/audit/genotype-display", label: "Genotype on a match card" },
  { route: "/audit/account-data", label: "Your data" },
  { route: "/audit/account-delete", label: "Delete account sheet" },
  { route: "/audit/gist-call", label: "Gist call · before joining" },
  { route: "/audit/gist-deck/first", label: "Gist deck · first" },
  { route: "/audit/gist-deck/real", label: "Gist deck · real" },
  { route: "/audit/gist-deck/done", label: "Gist deck · done" },
  // In-app navigation (nav-*.slim.html)
  { route: "/audit/nav/today", label: "Nav · today" },
  { route: "/audit/nav/today-no-badge", label: "Nav · today-no-badge" },
  { route: "/audit/nav/gists", label: "Nav · gists" },
  { route: "/audit/nav/profile", label: "Nav · profile" },
  // Gist invites — every state of prototypes 1–8 and Both Clocks
  { route: "/audit/gist-invite/reply-starter", label: "Gist invite · reply-starter" },
  { route: "/audit/gist-invite/reply-paid", label: "Gist invite · reply-paid" },
  { route: "/audit/gist-invite/reply-limit", label: "Gist invite · reply-limit" },
  { route: "/audit/gist-invite/sent", label: "Gist invite · sent" },
  { route: "/audit/gist-invite/list", label: "Gist invite · list" },
  { route: "/audit/gist-invite/list-quiet", label: "Gist invite · list-quiet" },
  { route: "/audit/gist-invite/received", label: "Gist invite · received" },
  { route: "/audit/gist-invite/received-declined", label: "Gist invite · received-declined" },
  { route: "/audit/gist-invite/outcome-waiting", label: "Gist invite · outcome-waiting" },
  { route: "/audit/gist-invite/outcome-accepted", label: "Gist invite · outcome-accepted" },
  { route: "/audit/gist-invite/outcome-declined", label: "Gist invite · outcome-declined" },
  { route: "/audit/gist-invite/outcome-expired", label: "Gist invite · outcome-expired" },
  { route: "/audit/gist-invite/accepted-online", label: "Gist invite · accepted-online" },
  { route: "/audit/gist-invite/accepted-cross", label: "Gist invite · accepted-cross" },
  { route: "/audit/gist-invite/accepted-same", label: "Gist invite · accepted-same" },
  { route: "/audit/gist-invite/time-confirm", label: "Gist invite · time-confirm" },
  { route: "/audit/gist-invite/time-waiting", label: "Gist invite · time-waiting" },
  { route: "/audit/gist-invite/picker", label: "Gist invite · picker" },
  { route: "/audit/gist-invite/picker-none", label: "Gist invite · picker-none" },
  { route: "/audit/gist-invite/picker-same", label: "Gist invite · picker-same" },
  // Toastly Help and Answer Mirror (Prompts 15, 16)
  { route: "/audit/help/start", label: "Help · start" },
  { route: "/audit/help/reply", label: "Help · reply" },
  { route: "/audit/help/pidgin", label: "Help · pidgin" },
  { route: "/audit/help/offer", label: "Help · offer" },
  { route: "/audit/help/passed", label: "Help · passed" },
  { route: "/audit/help/safety", label: "Help · safety" },
  { route: "/audit/answer-mirror/before", label: "Answer Mirror · before" },
  { route: "/audit/answer-mirror/great", label: "Answer Mirror · great" },
  { route: "/audit/answer-mirror/specific", label: "Answer Mirror · specific" },
  { route: "/audit/answer-mirror/detail", label: "Answer Mirror · detail" },
  { route: "/audit/answer-mirror/short", label: "Answer Mirror · short" },
  // Coin balance and dates (Prompt 17) — invented UI, flagged
  { route: "/audit/coins", label: "Coins" },
  { route: "/audit/coins-buy", label: "Coins · member abroad" },
  { route: "/audit/pool/paid-open", label: "Pool choice · paid-open" },
  { route: "/audit/pool/paid-soon", label: "Pool choice · paid-soon" },
  { route: "/audit/pool/free", label: "Pool choice · free" },
  { route: "/audit/pool/no-city", label: "Pool choice · no-city" },
  { route: "/audit/preferences/on", label: "Match preferences · on" },
  { route: "/audit/preferences/off", label: "Match preferences · off" },
  { route: "/audit/preferences/abroad", label: "Match preferences · abroad" },
  // Where you live (where-you-live, -confirm, -settings prototypes)
  // Photos, the face match and going live (0029)
  { route: "/audit/photos/onboard-empty", label: "Photos · onboard-empty" },
  { route: "/audit/photos/onboard-ready", label: "Photos · onboard-ready" },
  { route: "/audit/photos/check-face", label: "Photos · check-face" },
  { route: "/audit/photos/check-selfie", label: "Photos · check-selfie" },
  { route: "/audit/photos/check-review", label: "Photos · check-review" },
  { route: "/audit/photos/edit", label: "Photos · edit" },
  { route: "/audit/photos/replace", label: "Photos · replace" },
  { route: "/audit/photos/replace-checking", label: "Photos · replace-checking" },
  { route: "/audit/photos/replace-failed", label: "Photos · replace-failed" },
  { route: "/audit/going-live/not-live", label: "Going live · not-live" },
  { route: "/audit/going-live/restricted", label: "Going live · restricted" },
  { route: "/audit/going-live/selfie", label: "Going live · selfie" },
  { route: "/audit/going-live/selfie-photos", label: "Going live · selfie-photos" },
  { route: "/audit/where-you-live/signup", label: "Where you live · signup" },   { route: "/audit/where-you-live/signup-ghana", label: "Where you live · signup-ghana" },   { route: "/audit/where-you-live/confirm", label: "Where you live · confirm" },   { route: "/audit/where-you-live/settings-list", label: "Where you live · settings-list" },   { route: "/audit/where-you-live/settings", label: "Where you live · settings" },   { route: "/audit/where-you-live/settings-locked", label: "Where you live · settings-locked" },
  { route: "/audit/coins-get/usd", label: "Get coins · usd" },
  { route: "/audit/coins-get/ngn", label: "Get coins · ngn" },
  { route: "/audit/coins-get/usd-done", label: "Get coins · usd-done" },
  { route: "/audit/console/queue", label: "Console · queue", viewports: CONSOLE },
  { route: "/audit/console/queue-decided", label: "Console · queue-decided", viewports: CONSOLE },
  { route: "/audit/console/case-pricing", label: "Console · case-pricing", viewports: CONSOLE },
  { route: "/audit/console/case-blind", label: "Console · case-blind", viewports: CONSOLE },
  { route: "/audit/console/case-attendance", label: "Console · case-attendance", viewports: CONSOLE },
  { route: "/audit/console/case-decided", label: "Console · case-decided", viewports: CONSOLE },
  { route: "/audit/console/history", label: "Console · history", viewports: CONSOLE },
  { route: "/audit/notices/restricted", label: "Notice · restricted" },
  { route: "/audit/notices/reverify", label: "Notice · reverify" },
  { route: "/audit/notices/switch-plan", label: "Notice · switch-plan" },
  { route: "/audit/notices/all", label: "Notice · all" },
  { route: "/audit/notices/pool-plan", label: "Notice · pool-plan" },
  { route: "/audit/plan/ngn-starter", label: "Plan · ngn-starter" },
  { route: "/audit/plan/ngn-coins", label: "Plan · ngn-coins" },
  { route: "/audit/plan/ngn-renewing", label: "Plan · ngn-renewing" },
  { route: "/audit/plan/ngn-stopped", label: "Plan · ngn-stopped" },
  { route: "/audit/plan/ngn-off", label: "Plan · ngn-off" },
  { route: "/audit/plan/usd", label: "Plan · usd" },
  { route: "/audit/plan/usd-renewing", label: "Plan · usd-renewing" },
  { route: "/audit/dates/propose", label: "Date · propose" },
  { route: "/audit/dates/propose-short", label: "Date · propose-short" },
  { route: "/audit/dates/pending-them", label: "Date · pending-them" },
  { route: "/audit/dates/pending-short", label: "Date · pending-short" },
  { route: "/audit/dates/pending-me", label: "Date · pending-me" },
  { route: "/audit/dates/confirmed", label: "Date · confirmed" },
  { route: "/audit/dates/confirmed-late", label: "Date · confirmed-late" },
  { route: "/audit/dates/check-in", label: "Date · check-in" },
  { route: "/audit/dates/checked-in", label: "Date · checked-in" },
  { route: "/audit/dates/contest-absent", label: "Date · contest-absent" },
  { route: "/audit/dates/contest-attender", label: "Date · contest-attender" },
  { route: "/audit/dates/review", label: "Date · review" },
  { route: "/audit/dates/completed", label: "Date · completed" },
  { route: "/audit/dates/no-show-attender", label: "Date · no-show-attender" },
  { route: "/audit/dates/no-show-absent", label: "Date · no-show-absent" },
  { route: "/audit/dates/cancelled-safety", label: "Date · cancelled-safety" },
  { route: "/audit/dates/cancelled-reschedule", label: "Date · cancelled-reschedule" },
  // Verification — every state of the Smile ID flow
  { route: "/audit/verify/start", label: "Verify · start" },
  { route: "/audit/verify/reverify", label: "Verify · reverify" },
  { route: "/audit/verify/checking", label: "Verify · checking" },
  { route: "/audit/verify/review", label: "Verify · review" },
  { route: "/audit/verify/retry-spoof", label: "Verify · retry-spoof" },
  { route: "/audit/verify/retry-image", label: "Verify · retry-image" },
  { route: "/audit/verify/retry-error", label: "Verify · retry-error" },
  { route: "/audit/verify/passed", label: "Verify · passed" },
  { route: "/audit/verify/id-form", label: "Verify · id-form" },
  { route: "/audit/verify/id-checking", label: "Verify · id-checking" },
  { route: "/audit/verify/id-review", label: "Verify · id-review" },
  { route: "/audit/verify/id-not-found", label: "Verify · id-not-found" },
  { route: "/audit/verify/id-face", label: "Verify · id-face" },
  { route: "/audit/verify/id-used", label: "Verify · id-used" },
  { route: "/audit/verify/id-error", label: "Verify · id-error" },
  { route: "/audit/verify/both", label: "Verify · both" },
];

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
];


const MIN_TARGET = 44;
const MIN_FONT = 12;

function slug(route) {
  return route === "/" ? "home" : route.replace(/^\//, "").replace(/\//g, "-");
}

/** Runs inside the page. Returns plain data only. */
function inspect({ minTarget, minFont }) {
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // A short, stable CSS-ish path: tag, id, first two classes, nth-of-type.
  const pathOf = (el) => {
    const parts = [];
    let node = el;
    for (let depth = 0; node && node !== document.body && depth < 4; depth++) {
      let part = node.tagName.toLowerCase();
      if (node.id) {
        parts.unshift(`${part}#${node.id}`);
        break;
      }
      const classes = Array.from(node.classList).slice(0, 2);
      if (classes.length) part += "." + classes.join(".");
      const siblings = node.parentElement
        ? Array.from(node.parentElement.children).filter((s) => s.tagName === node.tagName)
        : [];
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(" > ");
  };

  const clip = (s) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, 48);

  // 1 — overflow
  const scrollWidth = document.documentElement.scrollWidth;
  const innerWidth = window.innerWidth;

  // 2 — targets
  const targets = [];
  for (const el of document.querySelectorAll("a,button,input,select,[role=button],[role=tab]")) {
    if (el.matches('input[type="hidden"]')) continue;
    if (el.closest(".sr-only")) continue;
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width >= minTarget && r.height >= minTarget) continue;

    // A checkbox or radio wrapped in a <label>, or named by <label for>, is
    // activated by clicking anywhere on that label (HTML spec), and WCAG
    // 2.5.8 measures the region that activates the control. So the label's
    // box is the target, not the 16px input. Only exempted when that label
    // itself clears the bar — a small label around a small input still fails.
    if (el.tagName === "INPUT") {
      const labels = [el.closest("label"), ...(el.labels ? Array.from(el.labels) : [])].filter(Boolean);
      const bigLabel = labels.some((l) => {
        const lr = l.getBoundingClientRect();
        return lr.width >= minTarget && lr.height >= minTarget;
      });
      if (bigLabel) continue;
    }

    // An <a> flowing inline inside a sentence. WCAG 2.5.8 exempts these; the
    // table still lists them, flagged, so the decision is visible rather than
    // silently made by the script.
    const cs = getComputedStyle(el);
    const parentText = clip(el.parentElement?.textContent);
    const ownText = clip(el.textContent);
    const inline =
      el.tagName === "A" &&
      cs.display === "inline" &&
      parentText.length > ownText.length + 8;

    targets.push({
      selector: pathOf(el),
      width: Math.round(r.width),
      height: Math.round(r.height),
      text: ownText || el.getAttribute("aria-label") || "",
      inline,
    });
  }

  // 3 — small text
  const small = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || seen.has(el)) continue;
    if (el.closest(".sr-only, script, style, noscript, template")) continue;
    if (!visible(el)) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < minFont) {
      seen.add(el);
      small.push({ selector: pathOf(el), size: Math.round(size * 10) / 10, text: clip(n.textContent) });
    }
  }

  return { scrollWidth, innerWidth, overflow: scrollWidth > innerWidth, targets, small };
}

async function main() {
  await mkdir(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const results = [];

  for (const { route, label, viewports } of ROUTES) {
    for (const vp of viewports ?? VIEWPORTS) {
      const context = await browser.newContext({
        viewport: vp,
        deviceScaleFactor: 2,
        isMobile: vp.width < 700,
        hasTouch: true,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      const url = `${BASE}${route}`;
      const shot = path.join(SHOT_DIR, `${slug(route)}-${vp.width}.png`);

      let status = 0;
      let inspection = null;
      let error = null;
      let networkIdle = true;
      try {
        let res;
        try {
          res = await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 });
        } catch (e) {
          // The network never settled — usually a request that hangs, such as
          // a prefetch of a route that doesn't exist. That is worth reporting
          // in its own right, but it must not stop the page being measured.
          if (!/Timeout/i.test(String(e?.message))) throw e;
          networkIdle = false;
          res = await page.goto(url, { waitUntil: "load", timeout: 30_000 });
          await page.waitForTimeout(2_000);
        }
        status = res?.status() ?? 0;
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: shot, fullPage: true });
        inspection = await page.evaluate(inspect, { minTarget: MIN_TARGET, minFont: MIN_FONT });
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      } finally {
        await context.close();
      }

      results.push({ route, label, width: vp.width, height: vp.height, status, networkIdle, screenshot: path.relative(OUT_DIR, shot), inspection, error });
      const failed = !error && status < 400 && (inspection.overflow || inspection.targets.length || inspection.small.length || !networkIdle);
      const tag = error ? "ERROR" : status >= 400 ? `HTTP ${status}` : failed ? "FAIL" : "ok";
      console.log(`${tag.padEnd(9)} ${String(vp.width).padStart(3)}px  ${route}${networkIdle ? "" : "  (network never idle)"}`);
    }
  }

  await browser.close();
  await writeFile(path.join(OUT_DIR, "mobile-audit.json"), JSON.stringify(results, null, 2));
  await writeFile(path.join(OUT_DIR, "MOBILE-AUDIT.md"), render(results));

  const failures = results.filter(
    (r) => r.error || r.status >= 400 || !r.networkIdle || r.inspection.overflow || r.inspection.targets.length || r.inspection.small.length,
  );
  console.log(`\n${results.length} route×width combinations, ${failures.length} with failures. Report: audit/MOBILE-AUDIT.md`);
  process.exit(failures.length ? 1 : 0);
}

function render(results) {
  const when = new Date().toISOString().replace("T", " ").slice(0, 16);
  const lines = [];
  lines.push("# Mobile audit");
  lines.push("");
  lines.push(`Run ${when} UTC against \`${BASE}\`. Viewports 320×568 and 360×640 (the review console at 768×1024 and 1280×800), device scale 2, touch.`);
  lines.push("");
  lines.push(`Checks: **overflow** (scrollWidth > innerWidth), **targets** (every visible a/button/input/select/[role=button]/[role=tab] at least ${MIN_TARGET}×${MIN_TARGET}px), **text** (no visible text under ${MIN_FONT}px).`);
  lines.push("");
  lines.push("The in-app surfaces are measured through `/audit/*` harness routes that render the real components with mock data; those routes 404 unless `AUDIT_HARNESS=1`.");
  lines.push("");
  lines.push("| Route | Width | Overflow | Targets ≥44px | Text ≥12px | Network idle | Screenshot |");
  lines.push("|---|---|---|---|---|---|---|");

  for (const r of results) {
    if (r.error || r.status >= 400) {
      const why = r.error ? `error: ${r.error.split("\n")[0].slice(0, 60)}` : `HTTP ${r.status}`;
      lines.push(`| \`${r.route}\` | ${r.width} | — | — | — | — | ${why} |`);
      continue;
    }
    const i = r.inspection;
    const ov = i.overflow ? `**FAIL** (${i.scrollWidth} > ${i.innerWidth})` : "pass";
    const tg = i.targets.length ? `**FAIL** (${i.targets.length})` : "pass";
    const tx = i.small.length ? `**FAIL** (${i.small.length})` : "pass";
    const ni = r.networkIdle ? "pass" : "**FAIL** (a request hung)";
    lines.push(`| \`${r.route}\` | ${r.width} | ${ov} | ${tg} | ${tx} | ${ni} | \`${r.screenshot}\` |`);
  }

  const failing = results.filter((r) => r.inspection && (!r.networkIdle || r.inspection.overflow || r.inspection.targets.length || r.inspection.small.length));
  lines.push("");
  lines.push(failing.length ? "## Failures" : "## Failures\n\nNone.");
  for (const r of failing) {
    const i = r.inspection;
    lines.push("");
    lines.push(`### \`${r.route}\` at ${r.width}px`);
    if (!r.networkIdle) lines.push("- **Network never idle:** a request stayed pending past 20s — measured after `load` + 2s instead. Usually a prefetch of a route that doesn't exist; check the page's links.");
    if (i.overflow) lines.push(`- **Overflow:** scrollWidth ${i.scrollWidth} vs innerWidth ${i.innerWidth}`);
    for (const t of i.targets) {
      const note = t.inline ? " — inline link in running text (WCAG 2.5.8 inline exception; decide, don't auto-fix)" : "";
      lines.push(`- **Target ${t.width}×${t.height}:** \`${t.selector}\` “${t.text}”${note}`);
    }
    for (const s of i.small) {
      lines.push(`- **Text ${s.size}px:** \`${s.selector}\` “${s.text}”`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});

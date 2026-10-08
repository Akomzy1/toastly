/**
 * The launch switch (decided 8 October 2026; lib/launch.ts).
 *
 *   node --test scripts/launch-switch.test.mjs
 *
 * With LAUNCH_PAYMENTS_ENABLED off — the default — no plan screen, checkout
 * or coin purchase can complete for anyone but the allow-list (staff and
 * LAUNCH_TEST_ACCOUNTS). The rule itself is run for real (compiled from
 * lib/launch.ts); every payment entry point is checked to ask it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

async function loadLaunch() {
  const src = fs.readFileSync("lib/launch.ts", "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "launch-")), "launch.mjs");
  fs.writeFileSync(file, js);
  return import(pathToFileURL(file).href);
}

/** A stand-in for the member's Supabase session: answers is_staff only. */
const session = (staff) => ({ rpc: async (name) => ({ data: name === "is_staff" ? staff : null }) });

test("off by default: nobody but the allow-list can pay", async () => {
  const { paymentsOpenFor, paymentsLaunched } = await loadLaunch();
  const saved = { ...process.env };
  try {
    delete process.env.LAUNCH_PAYMENTS_ENABLED;
    process.env.LAUNCH_TEST_ACCOUNTS = "owner@example.com, Tester@Example.com";
    assert.equal(paymentsLaunched(), false, "unset means off");
    assert.equal(await paymentsOpenFor(session(false), { email: "member@example.com" }), false, "a member can't pay");
    assert.equal(await paymentsOpenFor(session(false), { email: null }), false);
    assert.equal(await paymentsOpenFor(session(false), { email: "owner@example.com" }), true, "the allow-list can");
    assert.equal(await paymentsOpenFor(session(false), { email: "tester@example.com " }), true, "case and spaces don't matter");
    assert.equal(await paymentsOpenFor(session(true), { email: "staff@example.com" }), true, "staff can");
    for (const v of ["1", "TRUE", "yes", "on", " true", ""]) {
      process.env.LAUNCH_PAYMENTS_ENABLED = v;
      assert.equal(await paymentsOpenFor(session(false), { email: "member@example.com" }), false, `"${v}" doesn't open payments`);
    }
    process.env.LAUNCH_PAYMENTS_ENABLED = "true";
    assert.equal(await paymentsOpenFor(session(false), { email: "member@example.com" }), true, "launch day: everyone");
  } finally {
    process.env = saved;
  }
});

const read = (f) => fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*/gm, "");
const body = (src, name) => {
  const i = src.indexOf(`export async function ${name}(`);
  if (i < 0) return "";
  const j = src.indexOf("\nexport ", i + 10);
  return src.slice(i, j < 0 ? undefined : j);
};

test("every way to pay asks the switch on the server, before anything is opened", () => {
  // Checkout: every hosted checkout (coin packs, plans) goes through startCheckout.
  const checkout = body(read("lib/payments/checkout.ts"), "startCheckout");
  const guard = checkout.indexOf("paymentsOpenFor(");
  assert.ok(guard > 0, "startCheckout asks the switch");
  for (const after of ["payment_open", "stripeCheckout(", "paystackInitialize("]) {
    const at = checkout.indexOf(after);
    if (at >= 0) assert.ok(guard < at, `…before ${after}`);
  }
  assert.match(checkout.slice(guard - 30, guard + 120), /if \(!\(await paymentsOpenFor\(supabase, user\)\)\) return \{ error: PAYMENTS_CLOSED \}/);

  // Coins for a plan.
  const coins = body(read("app/(app)/coins/actions.ts"), "payWithCoins");
  assert.ok(coins.indexOf("paymentsOpenFor(") > 0 && coins.indexOf("paymentsOpenFor(") < coins.indexOf("subscribe_with_coins"), "payWithCoins asks the switch first");

  // Nothing else opens a payment or pays with coins.
  const files = ["app", "components", "lib"].flatMap(function walk(d) {
    return fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name).replace(/\\/g, "/")] : [])) : [];
  });
  for (const f of files) {
    const s = read(f);
    if (/rpc\(\s*["']payment_open["']|(?<!function )stripeCheckout\(|(?<!function )paystackInitialize\(/.test(s)) assert.equal(f, "lib/payments/checkout.ts", `${f} opens a payment outside startCheckout`);
    if (/rpc\(\s*["']subscribe_with_coins["']/.test(s)) assert.equal(f, "app/(app)/coins/actions.ts", `${f} pays with coins outside payWithCoins`);
  }

  // The screens: plans and coins show as closed unless the switch says otherwise.
  const plan = read("app/(app)/profile/plan/page.tsx");
  assert.match(plan, /const open = await paymentsOpenFor\(supabase, user\);/);
  assert.match(plan, /paystackOn=\{open && paymentsConfigured\("paystack"\)\}/);
  assert.match(plan, /stripeOn=\{open && paymentsConfigured\("stripe"\)\}/);
  const get = read("app/(app)/coins/get/page.tsx");
  assert.match(get, /enabled=\{open && paymentsConfigured\(/);
  const bal = read("app/(app)/coins/page.tsx");
  assert.match(bal, /paymentsOpen=\{open\}/);
});

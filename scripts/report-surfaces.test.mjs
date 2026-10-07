/**
 * One report list, on every report surface (decided 7 October 2026).
 *
 *   node --test scripts/report-surfaces.test.mjs
 *
 * Every place a member can report someone renders the shared ReportReasons
 * component (components/safety/report-reasons.tsx), which renders the whole
 * of REPORT_REASONS — and REPORT_REASONS is every value of the database's
 * report_reason enum. No surface may offer a shorter list: not by its own
 * list, not by a <select>, not by a prop that narrows the shared one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOTS = ["app", "components", "lib"];
const norm = (f) => f.replace(/\\/g, "/");
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?)$/.test(p)) out.push(norm(p));
  }
  return out;
}
const FILES = ROOTS.flatMap((r) => walk(r)).map((f) => ({ f, s: fs.readFileSync(f, "utf8") }));
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const SHARED = "components/safety/report-reasons.tsx";
// Where the list is defined, and where the server checks a reason against it.
const DEFINES = ["lib/safety.ts", "lib/safety-actions.ts"];

const reasonsInTs = () => {
  const src = fs.readFileSync("lib/safety.ts", "utf8");
  const block = src.match(/export const REPORT_REASONS = \[([\s\S]*?)\] as const;/)[1];
  return [...block.matchAll(/value:\s*"([a-z_]+)",\s*label:\s*"([^"]+)"/g)].map((m) => ({ value: m[1], label: m[2] }));
};

const enumInDb = () => {
  const migs = fs.readdirSync("supabase/migrations").filter((m) => /\.sql$/.test(m)).sort()
    .map((m) => fs.readFileSync(`supabase/migrations/${m}`, "utf8")).join("\n");
  const created = migs.match(/create type report_reason as enum \(([\s\S]*?)\);/)[1];
  const values = [...created.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  for (const m of migs.matchAll(/alter type report_reason add value if not exists '([a-z_]+)'/g)) values.push(m[1]);
  return values;
};

test("the list is every reason the database knows, including the ones every surface must offer", () => {
  const ts = reasonsInTs();
  assert.deepEqual(ts.map((r) => r.value).sort(), enumInDb().sort(), "REPORT_REASONS = the report_reason enum, no more, no less");
  const labels = ts.map((r) => r.label.toLowerCase());
  for (const must of ["underage", "scam", "not who they say they are", "these photos aren't them", "they're married", "rude or threatening"]) {
    assert.ok(labels.some((l) => l.includes(must)), `the list offers "${must}"`);
  }
});

test("only the shared component renders the list, and nothing can narrow it", () => {
  const users = FILES.filter(({ s }) => /\bREPORT_REASONS\b/.test(code(s))).map(({ f }) => f).sort();
  assert.deepEqual(users, [...DEFINES, SHARED].sort(), "REPORT_REASONS is rendered only by ReportReasons");

  const shared = code(fs.readFileSync(SHARED, "utf8"));
  const props = shared.match(/export function ReportReasons\(\{([^}]*)\}/)[1].split(",").map((p) => p.trim()).filter(Boolean);
  assert.deepEqual(props.sort(), ["disabled", "onPick", "selected"], "no prop that could filter, reorder or relabel the reasons");
  assert.match(shared, /\{REPORT_REASONS\.map\(/, "it maps the whole list");
  assert.doesNotMatch(shared, /REPORT_REASONS\s*\.\s*(filter|slice|splice|find|sort|reverse)\b|REPORT_REASONS\[/, "…never part of it");

  // No surface keeps its own list of reason values.
  // ("other" is too common a word to tell a reason from anything else.)
  const values = enumInDb().filter((v) => v !== "other");
  for (const { f, s } of FILES) {
    if (DEFINES.includes(f)) continue;
    const hit = values.find((v) => new RegExp(`["'\`]${v}["'\`]`).test(code(s)));
    assert.equal(hit, undefined, `${f} hard-codes the reason "${hit}"`);
  }
});

test("every report entry point uses the shared component", () => {
  const ENTRY = /\breportMember\b|\bblindReportLocked\b|rpc\(\s*["']blind_report_locked["']|from\(\s*["']reports["']\s*\)\s*\.\s*insert/;
  const entries = FILES.filter(({ f, s }) => !DEFINES.includes(f) && ENTRY.test(code(s)));
  assert.ok(entries.length >= 3, `found the report surfaces (${entries.map((e) => e.f).join(", ")})`);
  for (const { f, s } of entries) {
    assert.match(code(s), /import \{ ReportReasons \} from "(@\/components\/safety\/report-reasons|\.\/report-reasons)"/, `${f} imports ReportReasons`);
    assert.match(code(s), /<ReportReasons\b/, `${f} renders ReportReasons`);
    assert.doesNotMatch(code(s), /<select\b|<Select\b[^>]*name="reason"/, `${f} offers no reason picker of its own`);
  }
});

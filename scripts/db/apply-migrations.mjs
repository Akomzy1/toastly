/**
 * Apply migrations to a hosted database, in order, after checking it is at
 * the state the cutover expects (GO-LIVE §0g). Prints no secrets.
 *
 *   node scripts/db/apply-migrations.mjs --env .env.production.local --from 0027 --to 0028
 *        (checks only — shows what would run)
 *   node scripts/db/apply-migrations.mjs --env .env.production.local --from 0027 --to 0028 --yes
 *
 * Each file runs as psql would run it from the SQL editor, stopping at the
 * first error. The expected-state check refuses to start if the database
 * isn't where the first migration expects it to be.
 */
import fs from "node:fs";
import path from "node:path";
import { run, dbUrlFrom, redact } from "./lib.mjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const envFile = arg("env");
const from = arg("from");
const to = arg("to", from);
const yes = process.argv.includes("--yes");
if (!envFile || !from) {
  console.error("Usage: node scripts/db/apply-migrations.mjs --env <env file> --from NNNN [--to NNNN] [--yes]");
  process.exit(2);
}

/** What must be true before each migration — the previous one's mark, and not its own. */
const EXPECT = {
  "0027": ["select to_regclass('public.review_items') is not null and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'review_items' and column_name = 'case_no')", "select to_regclass('public.match_config') is null"],
  "0028": ["select to_regclass('public.match_config') is not null", "select not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'couple_briefs' and column_name = 'wedding_city')"],
  "0029": ["select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'couple_briefs' and column_name = 'wedding_city')", "select to_regclass('public.consents') is null"],
  "0030": ["select to_regclass('public.consents') is not null", "select not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'denomination')"],
  "0031": ["select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'denomination')", "select to_regclass('public.member_filters') is null"],
  "0032": ["select to_regclass('public.member_filters') is not null", "select to_regprocedure('public.profile_open_to(uuid,uuid)') is null"],
  "0033": ["select to_regprocedure('public.profile_open_to(uuid,uuid)') is not null", "select to_regprocedure('public.profile_for(uuid)') is null"],
  "0034": ["select to_regprocedure('public.profile_for(uuid)') is not null", "select not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'review_items' and column_name = 'urgent')"],
};

try {
  const url = dbUrlFrom(envFile);
  const files = fs.readdirSync("supabase/migrations").filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()
    .filter((f) => f.slice(0, 4) >= from && f.slice(0, 4) <= to);
  if (!files.length) throw new Error(`no migrations between ${from} and ${to}`);
  const ask = (sql) => run("psql", ["-X", "-At", "-v", "ON_ERROR_STOP=1", "-d", url, "-c", sql]).stdout.trim() === "t";
  const ref = run("psql", ["-X", "-At", "-d", url, "-c", "select current_database() || ' - ' || version()"]).stdout.trim();
  console.log(`database: ${ref.slice(0, 90)}`);

  const first = files[0].slice(0, 4);
  const checks = EXPECT[first] ?? [];
  const ok = checks.every(ask);
  console.log(`expected state before ${first}: ${ok ? "yes" : "NO"}`);
  if (!ok) throw new Error(`the database isn't where ${first} expects it — nothing applied`);
  console.log(`would apply, in order: ${files.join(", ")}`);
  if (!yes) {
    console.log("Check only — nothing applied. Re-run with --yes to apply.");
    process.exit(0);
  }

  for (const f of files) {
    const t0 = Date.now();
    run("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", url, "-f", path.join("supabase/migrations", f)],
      { env: { PGOPTIONS: "-c client_min_messages=warning" } });
    console.log(`applied ${f} in ${Math.round((Date.now() - t0) / 100) / 10}s`);
    const next = EXPECT[String(Number(f.slice(0, 4)) + 1).padStart(4, "0")];
    if (next && !ask(next[0])) throw new Error(`${f} ran but its mark isn't there — stop and look`);
  }
  console.log("done");
} catch (e) {
  console.error(redact(e.message));
  process.exit(1);
}

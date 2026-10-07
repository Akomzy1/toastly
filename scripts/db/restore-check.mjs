/**
 * Prove a backup restores: load it into a throwaway local PostgreSQL 17
 * database and compare every table's row count with the counts taken at
 * backup time (GO-LIVE §0g). Nothing remote is touched.
 *
 *   node scripts/db/restore-check.mjs --dump backups/production-<time>.dump
 *
 * Restores public, auth and storage — the schemas that hold Toastly's data.
 * cron needs the pg_cron extension, which a plain local PostgreSQL doesn't
 * have; its entries are checked to be present in the dump instead.
 * Passes only if every table restored with exactly the rows it had.
 */
import fs from "node:fs";
import { run, localCluster, countRows, redact, SUPABASE_ROLES_SHIM, DATA_SCHEMAS } from "./lib.mjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const dump = arg("dump");
const port = Number(arg("port", "55433"));
if (!dump || !fs.existsSync(dump)) {
  console.error("Usage: node scripts/db/restore-check.mjs --dump <file.dump>");
  process.exit(2);
}
const expected = JSON.parse(fs.readFileSync(dump.replace(/\.dump$/, ".counts.json"), "utf8"));

const cluster = localCluster(port);
let ok = false;
try {
  const t0 = Date.now();
  cluster.createDb("scratch");
  const url = cluster.url("scratch");
  run("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", url], { input: SUPABASE_ROLES_SHIM });

  const r = run("pg_restore", ["-d", url, "--no-owner", ...DATA_SCHEMAS.flatMap((s) => ["-n", s]), dump], { allowFail: true });
  const errors = (r.stderr.match(/pg_restore: error: [^\n]*/g) ?? []).map((e) => redact(e));
  const got = countRows(url);

  const missing = Object.keys(expected).filter((t) => !(t in got));
  const differ = Object.keys(expected).filter((t) => t in got && got[t] !== expected[t]);
  const listing = run("pg_restore", ["-l", dump]).stdout;
  const cronEntries = (listing.match(/ cron /g) ?? []).length;

  console.log(`restored into a scratch database in ${Math.round((Date.now() - t0) / 100) / 10}s`);
  console.log(`tables: ${Object.keys(expected).length} expected, ${missing.length} missing, ${differ.length} with a different row count`);
  console.log(`rows:   ${Object.values(expected).reduce((a, b) => a + b, 0)} expected, ${Object.values(got).reduce((a, b) => a + b, 0)} restored`);
  console.log(`cron:   ${cronEntries} entries in the dump (not restored locally: needs pg_cron)`);
  if (errors.length) {
    console.log(`restore errors (${errors.length}) — objects a plain PostgreSQL can't create; data tables are checked above:`);
    for (const e of errors.slice(0, 15)) console.log(`  ${e.slice(0, 200)}`);
  }
  for (const t of missing) console.log(`  MISSING ${t}`);
  for (const t of differ) console.log(`  DIFFERS ${t}: expected ${expected[t]}, got ${got[t]}`);
  ok = missing.length === 0 && differ.length === 0;
  console.log(ok ? "RESTORE CHECK PASSED" : "RESTORE CHECK FAILED");
} catch (e) {
  console.error(redact(e.message));
} finally {
  cluster.stop();
}
process.exit(ok ? 0 : 1);

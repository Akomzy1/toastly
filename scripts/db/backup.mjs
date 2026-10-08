/**
 * Full backup of a Toastly database, taken immediately before the release-1
 * cutover applies 0029 … 0034 (GO-LIVE §0g).
 *
 *   node scripts/db/backup.mjs --env .env.production.local --label production
 *
 * Reads SUPABASE_DB_URL from the env file (never printed). Writes, to
 * backups/ (git-ignored):
 *   <label>-<time>.dump               pg_dump custom format: schema + data of
 *                                     public, auth, storage and cron
 *   <label>-<time>.counts.json        exact row counts per table, for checking
 *                                     a restore
 *   <label>-<time>.public-schema.sql  public's schema as text, to compare after
 *                                     a rollback
 *   <label>-<time>.manifest.json      versions, sizes, sha256
 *
 * Not in the dump: vault (its secrets are encrypted with a key that never
 * leaves the Supabase project; the project keeps it) and storage FILES
 * (object bytes live outside the database; production holds none today).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { run, dbUrlFrom, countRows, redact, DATA_SCHEMAS } from "./lib.mjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const envFile = arg("env");
const label = arg("label", "db");
const outDir = arg("out", "backups");
if (!envFile) {
  console.error("Usage: node scripts/db/backup.mjs --env <env file> --label <production|…>");
  process.exit(2);
}

try {
  const url = dbUrlFrom(envFile);
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = path.join(outDir, `${label}-${stamp}`);

  const server = run("psql", ["-X", "-At", "-d", url, "-c", "show server_version"]).stdout.trim();
  const dumpVersion = run("pg_dump", ["--version"]).stdout.trim();
  console.log(`server ${server}; ${dumpVersion}`);

  const schemas = [...DATA_SCHEMAS, "cron"].flatMap((s) => ["-n", s]);
  const t0 = Date.now();
  run("pg_dump", ["-d", url, "--format=custom", "--compress=6", ...schemas, "-f", `${base}.dump`]);
  run("pg_dump", ["-d", url, "--schema-only", "-n", "public", "-f", `${base}.public-schema.sql`]);
  const counts = countRows(url);
  fs.writeFileSync(`${base}.counts.json`, JSON.stringify(counts, null, 2));

  const bytes = fs.readFileSync(`${base}.dump`);
  const manifest = {
    label,
    taken_at: new Date().toISOString(),
    server_version: server,
    pg_dump: dumpVersion,
    schemas: [...DATA_SCHEMAS, "cron"],
    dump_bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    tables: Object.keys(counts).length,
    rows: Object.values(counts).reduce((a, b) => a + b, 0),
    seconds: Math.round((Date.now() - t0) / 100) / 10,
  };
  fs.writeFileSync(`${base}.manifest.json`, JSON.stringify(manifest, null, 2));
  console.log(`backup: ${base}.dump (${manifest.dump_bytes} bytes, ${manifest.tables} tables, ${manifest.rows} rows, ${manifest.seconds}s)`);
  console.log(`next:   node scripts/db/restore-check.mjs --dump ${base}.dump`);
} catch (e) {
  console.error(redact(e.message));
  process.exit(1);
}

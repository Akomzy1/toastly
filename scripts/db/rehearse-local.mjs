/**
 * The backup → cutover → rollback cycle, end to end, on a throwaway local
 * PostgreSQL 17 — no Supabase, nothing remote (GO-LIVE §0g).
 *
 *   node scripts/db/rehearse-local.mjs
 *
 *   1. a database at production's state: Supabase stand-ins, migrations
 *      0001 … 0026, a few seeded members;
 *   2. backup (scripts/db/backup.mjs), then restore-check on that backup;
 *   3. the cutover's database half: 0027 … 0034, timed, then a write that
 *      the rollback must discard;
 *   4. rollback (scripts/db/rollback.mjs --yes) and its own check;
 *   5. the cutover again on the rolled-back database — it must apply cleanly.
 *
 * What this can't show: Supabase's own roles and permissions (the postgres
 * role there is not a superuser), its extensions, and the app over HTTP.
 * The staging rehearsal covers those.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { run, localCluster } from "./lib.mjs";
import { SHIMS } from "../sql-test/harness.mjs";

const MIG = path.resolve("supabase/migrations");
const migrations = fs.readdirSync(MIG).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const upTo = (n) => migrations.filter((f) => f.slice(0, 4) <= n);
const between = (a, b) => migrations.filter((f) => f.slice(0, 4) > a && f.slice(0, 4) <= b);

const node = (script, args) => {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  return { code: r.status, out: (r.stdout + r.stderr).trim() };
};
const step = (s) => console.log(`\n== ${s}`);
const timings = {};

const cluster = localCluster(55432);
let failed = false;
const work = fs.mkdtempSync(path.join(os.tmpdir(), "toastly-rehearse-"));
try {
  cluster.createDb("prod");
  const url = cluster.url("prod");
  const sql = (s) => run("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", url], { input: s });
  const apply = (files) => {
    const t0 = Date.now();
    for (const f of files) run("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", url, "-f", path.join(MIG, f)]);
    return Math.round((Date.now() - t0) / 100) / 10;
  };

  step("1. Production's state: Supabase stand-ins, 0001 … 0026, seeded members");
  sql(SHIMS);
  timings.migrations_0001_0026_s = apply(upTo("0026"));
  sql(`
    insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
      ('00000000-0000-4000-8000-0000000000a1', 'owner@example.com', '{"display_name":"Owner Test","gender":"woman","date_of_birth":"1994-03-01"}', now()),
      ('00000000-0000-4000-8000-0000000000a2', 'amaka@example.com', '{"display_name":"Amaka Test","gender":"woman","date_of_birth":"1996-05-10"}', now()),
      ('00000000-0000-4000-8000-0000000000a3', 'tobi@example.com', '{"display_name":"Tobi Test","gender":"man","date_of_birth":"1993-11-20"}', now());
    update profiles set stage = 'verified_real', phone_verified_at = now(), city = 'Lagos';
    insert into prompt_answers (profile_id, prompt_id, answer)
      select id, 1, 'Jollof, then a long walk' from profiles;
    insert into staff_members (profile_id) values ('00000000-0000-4000-8000-0000000000a1');
    insert into gist_sessions (proposer_id, invitee_id, status) values
      ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a3', 'completed');
    insert into reports (reporter_id, reported_id, reason, detail) values
      ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a3', 'harassment', 'seeded');
    insert into coin_ledger (profile_id, delta, kind, bucket) values ('00000000-0000-4000-8000-0000000000a1', 10, 'purchase', 'purchased');
  `);
  const env = path.join(work, ".env.rehearsal.local");
  fs.writeFileSync(env, `SUPABASE_DB_URL=${url}\n`);

  step("2. Backup, then prove it restores");
  let t0 = Date.now();
  const b = node("scripts/db/backup.mjs", ["--env", env, "--label", "rehearsal", "--out", path.join(work, "backups")]);
  timings.backup_s = Math.round((Date.now() - t0) / 100) / 10;
  console.log(b.out);
  if (b.code !== 0) throw new Error("backup failed");
  const dump = b.out.match(/backup: (\S+\.dump)/)[1];
  t0 = Date.now();
  const rc = node("scripts/db/restore-check.mjs", ["--dump", dump, "--port", "55433"]);
  timings.restore_check_s = Math.round((Date.now() - t0) / 100) / 10;
  console.log(rc.out);
  if (rc.code !== 0) throw new Error("restore check failed");

  step("3. The cutover's database half: 0027 … 0034, then a write the rollback must discard");
  timings.cutover_0027_0034_s = apply(between("0026", "0034"));
  sql(`insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
        ('00000000-0000-4000-8000-0000000000a4', 'after@example.com', '{"display_name":"After Cutover","gender":"man","date_of_birth":"1990-01-01"}', now());`);
  const dry = node("scripts/db/rollback.mjs", ["--env", env, "--dump", dump]);
  console.log(dry.out);
  if (dry.code !== 0 || !/Dry run/.test(dry.out)) throw new Error("rollback dry run failed");

  step("4. Rollback");
  t0 = Date.now();
  const rb = node("scripts/db/rollback.mjs", ["--env", env, "--dump", dump, "--yes"]);
  timings.rollback_s = Math.round((Date.now() - t0) / 100) / 10;
  console.log(rb.out);
  if (rb.code !== 0) throw new Error("rollback failed");
  // The signup trigger is back and works: a new auth user gets a profile.
  sql(`insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
        ('00000000-0000-4000-8000-0000000000a5', 'again@example.com', '{"display_name":"Signup Again","gender":"woman","date_of_birth":"1992-02-02"}', now());`);
  const made = run("psql", ["-X", "-At", "-d", url, "-c", "select count(*) from profiles where id = '00000000-0000-4000-8000-0000000000a5'"]).stdout.trim();
  console.log(`signup trigger after rollback creates a profile: ${made === "1"}`);
  if (made !== "1") throw new Error("signup trigger missing after rollback");

  step("5. The cutover again on the rolled-back database");
  timings.cutover_again_s = apply(between("0026", "0034"));
  console.log("0027 … 0034 applied cleanly again");

  console.log("\nTIMINGS (seconds):", JSON.stringify(timings));
  console.log("LOCAL REHEARSAL PASSED");
} catch (e) {
  failed = true;
  console.error(`LOCAL REHEARSAL FAILED: ${e.message}`);
} finally {
  cluster.stop();
  fs.rmSync(work, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);

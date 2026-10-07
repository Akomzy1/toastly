/**
 * Roll the database back to a backup taken by scripts/db/backup.mjs — the
 * rollback for the release-1 cutover after 0029 … 0034 (GO-LIVE §0g).
 *
 *   node scripts/db/rollback.mjs --env .env.production.local --dump backups/production-<time>.dump
 *        (prints the plan and changes nothing)
 *   node scripts/db/rollback.mjs --env .env.production.local --dump backups/production-<time>.dump --yes
 *
 * 0027 … 0034 change only the public schema and the policies on
 * storage.objects. So the rollback:
 *   1. finds every object OUTSIDE public that depends on public — policies
 *      (storage.objects' photo rules call public functions) and triggers
 *      (auth.users' signup trigger) — and every policy on storage.objects;
 *   2. drops those, then restores public from the dump, clean, in one
 *      transaction: every table, function, type, policy and row back to the
 *      moment of the backup;
 *   3. recreates, from the same dump, the storage.objects policies and the
 *      dropped triggers as they were at the backup;
 *   4. checks public's schema and every table's row count against the
 *      backup, and says PASSED or FAILED.
 *
 * Anything written after the backup is lost — that is what a rollback is.
 * auth, storage data, cron and vault are not touched. Code: promote the
 * previous production deployment (main) in Vercel at the same time.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { run, dbUrlFrom, countRows, redact } from "./lib.mjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const envFile = arg("env");
const dump = arg("dump");
const yes = process.argv.includes("--yes");
if (!envFile || !dump || !fs.existsSync(dump)) {
  console.error("Usage: node scripts/db/rollback.mjs --env <env file> --dump <backup .dump> [--yes]");
  process.exit(2);
}

const psql = (url, sql) => run("psql", ["-X", "-At", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-d", url, "-c", sql]).stdout.split(/\r?\n/).filter(Boolean);

/** Objects outside public that depend on public, plus every policy on storage.objects. */
const DEPENDENTS_SQL = `
select 'POLICY', n.nspname, c.relname, pol.polname
  from pg_policy pol join pg_class c on c.oid = pol.polrelid join pg_namespace n on n.oid = c.relnamespace
 where (n.nspname = 'storage' and c.relname = 'objects')
    or (n.nspname <> 'public' and exists (
         select 1 from pg_depend d join pg_proc p on p.oid = d.refobjid join pg_namespace pn on pn.oid = p.pronamespace
          where d.classid = 'pg_policy'::regclass and d.objid = pol.oid and pn.nspname = 'public'))
union
select 'TRIGGER', n.nspname, c.relname, t.tgname
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
  join pg_proc p on p.oid = t.tgfoid join pg_namespace pn on pn.oid = p.pronamespace
 where not t.tgisinternal and n.nspname <> 'public' and pn.nspname = 'public'
order by 1, 2, 3, 4`;

const q = (s) => `"${s.replace(/"/g, '""')}"`;
const normalise = (sql) =>
  // Carriage returns vary with how the text was written (function bodies keep
  // the migration files' CRLF; pg_dump -f on Windows adds its own).
  sql.replace(/\r/g, "").split("\n").filter((l) => !/^\\(un)?restrict /.test(l) && !/^-- (Dumped|Started|Completed)/.test(l)).join("\n");

try {
  const url = dbUrlFrom(envFile);
  const base = dump.replace(/\.dump$/, "");
  const expectedCounts = JSON.parse(fs.readFileSync(`${base}.counts.json`, "utf8"));
  const expectedSchema = fs.readFileSync(`${base}.public-schema.sql`, "utf8");

  const current = psql(url, DEPENDENTS_SQL).map((l) => l.split("\t"));
  console.log("Set aside before restoring public, then recreated from the backup:");
  for (const [kind, s, t, name] of current) console.log(`  ${kind} ${name} on ${s}.${t}`);

  // What the backup holds for those: every storage.objects policy, and the
  // triggers on tables outside public whose function is in public.
  const listing = run("pg_restore", ["-l", dump]).stdout.split(/\r?\n/);
  const droppedTriggers = new Set(current.filter((c) => c[0] === "TRIGGER").map((c) => `${c[1]} ${c[2]} ${c[3]}`));
  const keep = listing.filter((l) => {
    if (/^\s*;/.test(l) || !l.trim()) return false;
    if (/ POLICY storage objects /.test(l)) return true;
    const m = l.match(/ TRIGGER (\S+) (\S+) (.+?) \S+$/);
    return Boolean(m && m[1] !== "public" && droppedTriggers.has(`${m[1]} ${m[2]} ${m[3]}`));
  });
  console.log(`From the backup: ${keep.length} entries to recreate (storage.objects policies and those triggers).`);

  // Objects in public that the backup doesn't have (made by 0027 … 0034):
  // --clean only drops what's in the dump, so these go first — or a new
  // table's foreign key to profiles blocks dropping profiles.
  const inBackup = new Set(
    listing
      .map((l) => l.match(/^\d+; \d+ \d+ (TABLE|VIEW|MATERIALIZED VIEW|SEQUENCE|FUNCTION|PROCEDURE|AGGREGATE|TYPE|DOMAIN) public (.+) \S+$/))
      .filter(Boolean)
      // pg_dump writes argument types schema-qualified ("public.review_items").
      .map((m) => `${m[1]}|${m[2].replace(/\bpublic\./g, "")}`),
  );
  const present = psql(url, `
    select case c.relkind when 'r' then 'TABLE' when 'p' then 'TABLE' when 'v' then 'VIEW' when 'm' then 'MATERIALIZED VIEW' else 'SEQUENCE' end,
           c.relname, format('%I.%I', n.nspname, c.relname)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S')
       and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
    union all
    select case p.prokind when 'p' then 'PROCEDURE' when 'a' then 'AGGREGATE' else 'FUNCTION' end,
           format('%s(%s)', p.proname, oidvectortypes(p.proargtypes)),
           format('%I.%I(%s)', n.nspname, p.proname, oidvectortypes(p.proargtypes))
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    union all
    select case t.typtype when 'd' then 'DOMAIN' else 'TYPE' end, t.typname, format('%I.%I', n.nspname, t.typname)
      from pg_type t join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public' and t.typtype in ('e', 'c', 'd', 'r') and t.typcategory <> 'A'
       and (t.typrelid = 0 or (select relkind from pg_class where oid = t.typrelid) = 'c')
       and not exists (select 1 from pg_depend d where d.objid = t.oid and d.deptype = 'e')`).map((l) => l.split("\t"));
  const extras = present.filter(([kind, tag]) => !inBackup.has(`${kind}|${tag}`));
  console.log(`Not in the backup, dropped first: ${extras.length}`);
  for (const [kind, tag] of extras) console.log(`  ${kind} ${tag}`);
  console.log(`Then public is restored clean from ${path.basename(dump)}: ${Object.keys(expectedCounts).filter((t) => t.startsWith("public.")).length} tables.`);

  if (!yes) {
    console.log("\nDry run — nothing changed. Re-run with --yes to roll back.");
    process.exit(0);
  }

  // All three steps run as ONE transaction: if anything fails, nothing has
  // changed. The restore is written out as SQL first (pg_restore -f), then
  // psql runs set-aside + public + recreate together under -1.
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "toastly-rb-"));
  const f = (n) => path.join(work, n);
  const drops = current.map(([kind, s, t, name]) =>
    kind === "POLICY" ? `drop policy if exists ${q(name)} on ${q(s)}.${q(t)};` : `drop trigger if exists ${q(name)} on ${q(s)}.${q(t)};`);
  const order = ["TABLE", "MATERIALIZED VIEW", "VIEW", "SEQUENCE", "FUNCTION", "PROCEDURE", "AGGREGATE", "DOMAIN", "TYPE"];
  const dropExtras = [...extras]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([kind, , ident]) => `drop ${kind.toLowerCase()} if exists ${ident} cascade;`);
  // Every foreign key between public's tables goes too: a key added after the
  // backup (profiles → profile_photos, 0029) would block dropping a table,
  // and the restore recreates exactly the keys the backup had.
  const fks = psql(url, `
    select format('alter table if exists %I.%I drop constraint if exists %I;', n.nspname, c.relname, k.conname)
      from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
     where k.contype = 'f' and n.nspname = 'public' order by 1`);
  fs.writeFileSync(f("1-set-aside.sql"), [...drops, ...dropExtras, ...fks].join("\n") + "\n");

  // Default privileges. Supabase grants every new object in public to anon,
  // authenticated and service_role by default. A restore CREATES objects, so
  // without this every function the migrations revoked from members
  // (profile_open_to, are_matched, genotype_key, …) would come back callable
  // by them: the backup records the grants an object has, not the default
  // grants it was stripped of. So the defaults for this role are switched
  // off for the restore and put back exactly afterwards — same transaction.
  const defaults = (verb) => psql(url, `
    select format('alter default privileges for role %I %s ${verb} %s on %s ${verb === "grant" ? "to" : "from"} %s;',
                  r.rolname,
                  case when d.defaclnamespace = 0 then '' else format('in schema %I', n.nspname) end,
                  ${verb === "grant" ? "string_agg(distinct a.privilege_type, ', ')" : "'all'"},
                  case d.defaclobjtype when 'r' then 'tables' when 'S' then 'sequences' when 'f' then 'functions' when 'T' then 'types' end,
                  quote_ident(g.rolname))
      from pg_default_acl d
      join pg_roles r on r.oid = d.defaclrole
      left join pg_namespace n on n.oid = d.defaclnamespace
      cross join lateral aclexplode(d.defaclacl) a
      join pg_roles g on g.oid = a.grantee
     where d.defaclrole = current_user::regrole
       and (d.defaclnamespace = 0 or n.nspname = 'public')
       and d.defaclobjtype in ('r', 'S', 'f', 'T')
       and a.grantee <> d.defaclrole
     group by r.rolname, d.defaclnamespace, n.nspname, d.defaclobjtype, g.rolname
     order by 1`);
  const defaultsOff = defaults("revoke");
  const defaultsBack = defaults("grant");
  fs.writeFileSync(f("0-defaults-off.sql"), defaultsOff.join("\n") + "\n");
  fs.writeFileSync(f("4-defaults-back.sql"), defaultsBack.join("\n") + "\n");
  console.log(`Default privileges switched off for the restore and put back after: ${defaultsOff.length}`);
  run("pg_restore", ["--clean", "--if-exists", "-n", "public", "-f", f("2-public.sql"), dump]);
  fs.writeFileSync(f("keep.list"), keep.join("\n") + "\n");
  if (keep.length) run("pg_restore", ["-L", f("keep.list"), "-f", f("3-recreate.sql"), dump]);
  else fs.writeFileSync(f("3-recreate.sql"), "");

  const t0 = Date.now();
  run("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-1", "-d", url,
    "-f", f("0-defaults-off.sql"), "-f", f("1-set-aside.sql"), "-f", f("2-public.sql"), "-f", f("3-recreate.sql"), "-f", f("4-defaults-back.sql")],
    { env: { PGOPTIONS: "-c client_min_messages=warning" } });
  const seconds = Math.round((Date.now() - t0) / 100) / 10;
  fs.rmSync(work, { recursive: true, force: true });

  // 4. Check.
  const got = countRows(url, ["public"]);
  const want = Object.fromEntries(Object.entries(expectedCounts).filter(([t]) => t.startsWith("public.")));
  const differ = Object.keys(want).filter((t) => got[t] !== want[t]);
  const extra = Object.keys(got).filter((t) => !(t in want));
  const schemaNow = run("pg_dump", ["-d", url, "--schema-only", "-n", "public"]).stdout;
  const sameSchema = normalise(schemaNow) === normalise(expectedSchema);
  const after = psql(url, DEPENDENTS_SQL).length;
  console.log(`rolled back in ${seconds}s`);
  console.log(`public schema identical to the backup: ${sameSchema}`);
  if (!sameSchema) {
    const a = normalise(expectedSchema).split("\n");
    const b = normalise(schemaNow).split("\n");
    const inA = new Set(a);
    const inB = new Set(b);
    const onlyBackup = a.filter((l) => l.trim() && !inB.has(l));
    const onlyNow = b.filter((l) => l.trim() && !inA.has(l));
    console.log(`  lines only in the backup: ${onlyBackup.length}; only now: ${onlyNow.length}`);
    for (const l of onlyBackup.slice(0, 12)) console.log(`  - ${l.slice(0, 160)}`);
    for (const l of onlyNow.slice(0, 12)) console.log(`  + ${l.slice(0, 160)}`);
  }
  console.log(`row counts: ${Object.keys(want).length - differ.length}/${Object.keys(want).length} tables match; ${extra.length} tables the backup didn't have`);
  for (const t of differ) console.log(`  DIFFERS ${t}: backup ${want[t]}, now ${got[t]}`);
  for (const t of extra) console.log(`  EXTRA ${t}`);
  console.log(`storage policies and dependent triggers in place: ${after}`);
  const ok = sameSchema && !differ.length && !extra.length;
  console.log(ok ? "ROLLBACK PASSED" : "ROLLBACK FAILED — do not promote main's code until this is resolved");
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.error(redact(e.message));
  process.exit(1);
}

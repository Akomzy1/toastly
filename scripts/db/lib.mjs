/**
 * Shared helpers for the database backup, restore check and rollback
 * (GO-LIVE §0g). Never prints a connection string, password or key.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

/** PostgreSQL 17 client tools: PG_BIN, else the default Windows install, else PATH. */
export function pg(tool) {
  const dirs = [process.env.PG_BIN, "C:/Program Files/PostgreSQL/17/bin"].filter(Boolean);
  for (const d of dirs) {
    const exe = path.join(d, process.platform === "win32" ? `${tool}.exe` : tool);
    if (fs.existsSync(exe)) return exe;
  }
  return tool;
}

/** Run a tool; returns { code, stdout, stderr }. Secrets in args are never echoed. */
export function run(tool, args, { input, env, allowFail = false } = {}) {
  // UTF8 always: on Windows psql otherwise talks in the console's code page,
  // and a migration's em dashes would be stored as mojibake in function text.
  const r = spawnSync(pg(tool), args, { input, env: { ...process.env, PGCLIENTENCODING: "UTF8", ...env }, encoding: "utf8", maxBuffer: 1 << 28 });
  if (r.error) throw new Error(`${tool}: ${r.error.message}`);
  if (r.status !== 0 && !allowFail) {
    throw new Error(`${tool} exited ${r.status}: ${redact(r.stderr).slice(0, 2000)}`);
  }
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** Strip anything that looks like a connection string or password from text. */
export function redact(text = "") {
  return String(text).replace(/postgres(ql)?:\/\/[^\s"']+/g, "postgresql://[redacted]").replace(/password=\S+/gi, "password=[redacted]");
}

/** Read KEY=value lines from an env file. Inline "# ..." placeholders count as blank. */
export function readEnv(file) {
  if (!fs.existsSync(file)) throw new Error(`${file} doesn't exist`);
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=(.*)$/);
    if (!m) continue;
    const v = m[2].trim().replace(/^"|"$/g, "");
    out[m[1]] = v.startsWith("#") ? "" : v;
  }
  return out;
}

/** The database URL from an env file, or a clear error naming the variable. */
export function dbUrlFrom(file, name = "SUPABASE_DB_URL") {
  const v = readEnv(file)[name];
  if (!v) throw new Error(`${name} is empty in ${file} — paste the database connection string (Supabase → Connect → Session pooler or Direct).`);
  return v;
}

export const DATA_SCHEMAS = ["public", "auth", "storage"];

/** Exact row counts for every table in the given schemas: { "schema.table": n }. */
export function countRows(url, schemas = DATA_SCHEMAS) {
  const list = schemas.map((s) => `'${s}'`).join(",");
  const tables = run("psql", ["-X", "-At", "-v", "ON_ERROR_STOP=1", "-d", url, "-c",
    `select format('%I.%I', schemaname, tablename) from pg_tables where schemaname in (${list}) order by 1`]).stdout
    .split(/\r?\n/).filter(Boolean);
  if (!tables.length) return {};
  const sql = tables.map((t) => `select '${t}' as t, count(*) as n from ${t}`).join(" union all ") + " order by 1";
  const rows = run("psql", ["-X", "-At", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-d", url, "-c", sql]).stdout.split(/\r?\n/).filter(Boolean);
  return Object.fromEntries(rows.map((r) => { const [t, n] = r.split("\t"); return [t, Number(n)]; }));
}

/** A throwaway PostgreSQL 17 cluster in a temp folder, trust auth, its own port. */
export function localCluster(port = 55432) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "toastly-pg-"));
  const data = path.join(dir, "data");
  run("initdb", ["-D", data, "-U", "postgres", "-A", "trust", "-E", "UTF8", "--locale=C"]);
  // The server inherits pg_ctl's stdio; with pipes, waiting on pg_ctl would
  // wait on the server forever. So no pipes here: the log goes to a file.
  const r = spawnSync(pg("pg_ctl"), ["-D", data, "-o", `-p ${port}`, "-l", path.join(dir, "log.txt"), "-w", "-t", "60", "start"], { stdio: "ignore" });
  if (r.status !== 0) throw new Error(`pg_ctl start exited ${r.status}; see ${path.join(dir, "log.txt")}`);
  const url = (db = "postgres") => `postgresql://postgres@127.0.0.1:${port}/${db}`;
  return {
    dir,
    url,
    createDb: (name) => run("psql", ["-X", "-q", "-d", url(), "-c", `create database ${name}`]),
    stop: () => {
      run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"], { allowFail: true });
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * The roles and extension schemas a Supabase dump refers to, so a dump
 * restores into a plain PostgreSQL for checking. Never run on Supabase.
 */
export const SUPABASE_ROLES_SHIM = `
do $$ declare r text; begin
  foreach r in array array['anon','authenticated','service_role','authenticator','supabase_admin',
    'supabase_auth_admin','supabase_storage_admin','dashboard_user','pgbouncer',
    'supabase_replication_admin','supabase_read_only_user','supabase_realtime_admin'] loop
    if not exists (select 1 from pg_roles where rolname = r) then execute format('create role %I nologin', r); end if;
  end loop;
end $$;
-- pg_restore -n restores what's IN a schema, not the schema itself; on
-- Supabase these always exist.
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
`;

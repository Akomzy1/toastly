/**
 * A throwaway Supabase-shaped database for tests — no Docker, no hosted
 * project.
 *
 * Real PostgreSQL (embedded-postgres ships the binaries), plus
 * supabase-shim.sql for the parts of a Supabase project the migrations rely
 * on: the API roles and their default grants, auth.users / auth.uid(), and
 * the storage tables. Then every file in supabase/migrations, in order, each
 * in its own transaction as Supabase applies them.
 *
 * The data directory lives in the OS temp folder, never in the repo: the
 * repo sits inside OneDrive, which renames files under a running process.
 * Each run gets its own directory and a free port, so a crashed run can never
 * block the next one.
 */
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.resolve(HERE, "../../supabase/migrations");

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

/** Remove folders earlier runs couldn't delete while Postgres held them. */
function sweepOldRuns() {
  for (const name of fs.readdirSync(os.tmpdir())) {
    if (!name.startsWith("toastly-db-test-")) continue;
    try {
      fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
    } catch {
      // Still held by a running test; leave it for the next sweep.
    }
  }
}

export async function startDatabase({ quiet = true } = {}) {
  sweepOldRuns();
  const dataDir = path.join(os.tmpdir(), `toastly-db-test-${randomUUID()}`);
  const port = await freePort();
  const server = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "postgres",
    password: "postgres",
    port,
    persistent: false,
    onLog: () => {},
    onError: (e) => process.stderr.write(String(e)),
  });
  await server.initialise();
  await server.start();
  await server.createDatabase("toastly");

  const db = new pg.Client({
    host: "127.0.0.1",
    port,
    user: "postgres",
    password: "postgres",
    database: "toastly",
  });
  await db.connect();

  const files = [
    path.join(HERE, "supabase-shim.sql"),
    ...fs
      .readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => path.join(MIGRATIONS, f)),
  ];
  for (const f of files) {
    try {
      await db.query("begin");
      await db.query(fs.readFileSync(f, "utf8"));
      await db.query("commit");
      if (!quiet) console.log(`applied  ${path.basename(f)}`);
    } catch (e) {
      await db.query("rollback");
      await stop();
      throw new Error(`${path.basename(f)} failed to apply: ${e.message}`);
    }
  }

  async function stop() {
    await db.end().catch(() => {});
    await server.stop().catch(() => {});
    // Windows can hold the files for a moment after Postgres exits. A
    // leftover temp folder is harmless; a cleanup error must never hide
    // the test results, so retry and then give up quietly.
    try {
      fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    } catch {
      console.warn(`(left the temp database folder behind: ${dataDir})`);
    }
  }

  return { db, stop, migrations: files.length - 1 };
}

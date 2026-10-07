/**
 * Who reads another member's profile, after 0033 (decided 7 October 2026).
 *
 *   node --test scripts/profile-readers.test.mjs
 *
 * A member's session can read only their OWN row in profiles, profile_history
 * and profile_photos; another member comes through profile_for. Anything
 * else that needs another member's data — the staff console, spot
 * suggestions — reads it with the service key or a security-definer
 * function, never through a member session, where it would silently get no
 * row and fall back to "this member". The SQL side is tested in
 * scripts/sql-test (full-profile, review-queue, diaspora-console); this
 * covers the code paths those can't reach.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

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
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const FILES = ["app", "components", "lib"].flatMap((r) => walk(r)).map((f) => ({ f, s: code(fs.readFileSync(f, "utf8")) }));

/** Every query on the three tables: the client it runs on, and the statement up to its end. */
function queries(s) {
  const out = [];
  for (const m of s.matchAll(/(\b[\w.]+(?:\(\))?)\s*\.from\(\s*["'](profiles|profile_history|profile_photos)["']\s*\)/g)) {
    const tail = s.slice(m.index, m.index + 600);
    const stmt = tail.slice(0, (tail.search(/;|\n\s*\n|,\s*\n\s*(supabase|admin|getMember)/) + 1 || 600));
    out.push({ client: m[1], table: m[2], stmt });
  }
  return out;
}
const isAdmin = (client) => /^(admin|createAdminClient\(\))$/.test(client);
// The signed-in member's own id, as the app names it.
const OWN = /\.eq\(\s*["'](id|profile_id)["']\s*,\s*(user\.id|user\?\.id \?\? ""|userId)\s*\)/;

test("a member session reads only the member's own row in profiles, profile_history and profile_photos", () => {
  const bad = [];
  for (const { f, s } of FILES) {
    for (const q of queries(s)) {
      if (isAdmin(q.client)) continue;
      // Writes are the member's own by policy; reads must name the member's own id.
      if (/\.(insert|upsert|update|delete)\(/.test(q.stmt) && !/\.select\(/.test(q.stmt.split(/\.(insert|upsert|update|delete)\(/)[0])) continue;
      // Toastly Help's tools take the caller's own id (asserted below).
      const own = OWN.test(q.stmt) || (f === "lib/concierge/tools.ts" && /\.eq\(\s*"id"\s*,\s*profileId\s*\)/.test(q.stmt));
      if (!own) bad.push(`${f}: ${q.table} — ${q.stmt.replace(/\s+/g, " ").slice(0, 120)}`);
    }
  }
  assert.deepEqual(bad, [], "another member must come from profile_for (lib/member-profile.ts)");

  // Toastly Help: the tools' profileId is the signed-in member's own id, end to end.
  assert.match(code(fs.readFileSync("app/api/help/route.ts", "utf8")), /runHelp\(\s*\w+,\s*supabase,\s*user\.id\s*\)/);
  assert.match(code(fs.readFileSync("lib/concierge/agent.ts", "utf8")), /runConciergeTool\([^)]*,\s*supabase,\s*profileId\s*\)/);
});

test("every screen that names another member gets them from profile_for", () => {
  // The fallbacks a screen shows when it has no name: each file that has one
  // reads the other member through getMemberProfile(s), never a table.
  const FALLBACK = /["'](this member|A member)["']/;
  const files = FILES.filter(({ f, s }) => (FALLBACK.test(s) && /display_name/.test(s)) || f === "app/(app)/feed/page.tsx");
  assert.ok(files.length >= 5, `found the screens that name another member (${files.map((x) => x.f).join(", ")})`);
  for (const { f, s } of files) {
    assert.match(s, /\bgetMemberProfiles?\(/, `${f} reads the other member through profile_for`);
  }
});

test("spot suggestions read both cities with the service key, only after both said continue", () => {
  const f = "app/(app)/gist/[id]/spot-actions.ts";
  const s = code(fs.readFileSync(f, "utf8"));
  const continueAt = s.indexOf('rpc("gist_mutual_continue"');
  const refuseAt = s.indexOf("if (!mutual)");
  const readAt = s.search(/admin\s*\.from\(\s*"profiles"\s*\)/);
  assert.ok(continueAt > 0 && refuseAt > continueAt, "it checks both said continue, and stops if not");
  assert.ok(readAt > refuseAt, "the two cities are read with the service key, after that check");
  assert.match(s, /const admin = createAdminClient\(\);\s*if \(!admin\) return/, "no service key: it says so rather than reading as the member");
  assert.doesNotMatch(s, /supabase\s*\.from\(\s*"profiles"\s*\)/, "never through the member's session");
  // Neither city nor country is shown or stored: only venues go into date_spots.
  const insert = s.slice(s.indexOf('from("date_spots").insert'));
  assert.doesNotMatch(insert.slice(0, 600), /country_code|\.city\b/, "the members' locations aren't stored with the suggestions");
});

test("the staff console reads other members only through staff functions and the service key", () => {
  const staffFiles = FILES.filter(({ f }) => /^app\/\(staff\)\/|^components\/staff\//.test(f));
  assert.ok(staffFiles.length >= 4);
  for (const { f, s } of staffFiles) {
    assert.doesNotMatch(s, /\.from\(\s*["'](profiles|profile_history|profile_photos)["']\s*\)/, `${f} reads a profile table directly`);
    for (const m of s.matchAll(/\.rpc\(\s*["'](\w+)["']/g)) {
      assert.match(m[1], /^(staff_\w+|is_staff)$/, `${f} calls ${m[1]} — staff reads go through the staff_* functions`);
    }
  }
  // The one read the staff functions don't cover: the member's email, to tell them the outcome.
  const actions = code(fs.readFileSync("app/(staff)/staff/actions.ts", "utf8"));
  assert.match(actions, /admin\.auth\.admin\.getUserById\(/, "the member's email comes from the service key");
});

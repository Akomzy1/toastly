/**
 * Self-applied filters (PRD §5.2.4; migration 0031) — against a throwaway
 * Postgres (PGlite) with every migration applied. Never production.
 *
 *   node --test scripts/sql-test/filters.test.mjs
 *
 * Members act through the same role and claims a raw API request has.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb, as, makeUser, goLive } from "./harness.mjs";

async function setup() {
  const db = await freshDb();
  const me = (id, sql, params) => as(db, id, (tx) => tx.query(sql, params));

  /** A live member, optionally on a plan, with optional shown/hidden faith and tribe. */
  async function member(name, { tier = null, religion = null, religionShown = true, tribe = null, tribeVis = "public" } = {}) {
    const id = await makeUser(db, { name, email: `${crypto.randomUUID()}@example.com` });
    await goLive(db, id);
    if (tier) await db.query("insert into entitlements (profile_id, tier, source, ends_at) values ($1, $2, 'subscription', now() + interval '30 days')", [id, tier]);
    await db.query("alter table profiles disable trigger faith_rules");
    await db.query(
      "update profiles set religion = $2, religion_visibility = $3, tribe = $4, tribe_visibility = $5 where id = $1",
      [id, religion, religionShown ? "public" : "private", tribe, tribeVis],
    );
    await db.query("alter table profiles enable trigger faith_rules");
    return id;
  }

  const setFilters = (id, f) =>
    me(
      id,
      `insert into member_filters (profile_id, religions, religion_include_unsaid, tribes, tribe_include_unsaid)
       values ($1, $2, $3, $4, $5)
       on conflict (profile_id) do update set religions = excluded.religions, religion_include_unsaid = excluded.religion_include_unsaid,
         tribes = excluded.tribes, tribe_include_unsaid = excluded.tribe_include_unsaid, updated_at = now()`,
      [id, f.religions ?? [], f.religionUnsaid ?? true, f.tribes ?? [], f.tribeUnsaid ?? true],
    );
  const passes = async (viewer, candidate) =>
    (await db.query("select passes_own_filters($1, $2) as ok", [viewer, candidate])).rows[0].ok;
  const six = async (id) => (await me(id, "select candidate_id from build_daily_feed($1)", [id])).rows.map((r) => r.candidate_id);

  return { db, me, member, setFilters, passes, six };
}

test("a hidden religion or tribe is never used to include or exclude", async () => {
  const { member, setFilters, passes } = await setup();
  const viewer = await member("Viewer", { tier: "premium" });
  const shownChristian = await member("Shown Christian", { religion: "Christian" });
  const shownMuslim = await member("Shown Muslim", { religion: "Muslim" });
  const hiddenChristian = await member("Hidden Christian", { religion: "Christian", religionShown: false });
  const hiddenMuslim = await member("Hidden Muslim", { religion: "Muslim", religionShown: false });
  const empty = await member("No Religion");

  await setFilters(viewer, { religions: ["Christian"], religionUnsaid: true });
  assert.equal(await passes(viewer, shownChristian), true);
  assert.equal(await passes(viewer, shownMuslim), false, "a shown value is matched");
  assert.equal(await passes(viewer, hiddenChristian), true, "hidden counts as 'doesn't say'");
  assert.equal(await passes(viewer, hiddenMuslim), true, "…whatever the hidden value is");
  assert.equal(await passes(viewer, empty), true);

  await setFilters(viewer, { religions: ["Christian"], religionUnsaid: false });
  assert.equal(await passes(viewer, hiddenChristian), false, "with 'don't say' off, hidden is left out…");
  assert.equal(await passes(viewer, hiddenMuslim), false, "…the same way, whatever the hidden value");
  assert.equal(await passes(viewer, empty), false);

  // Tribe: only 'public' is shown; 'on_match' and 'private' are hidden from the six.
  const yorubaShown = await member("Yoruba Shown", { tribe: " yoruba " });
  const igboShown = await member("Igbo Shown", { tribe: "Igbo" });
  const yorubaOnMatch = await member("Yoruba On Match", { tribe: "Yoruba", tribeVis: "on_match" });
  const igboPrivate = await member("Igbo Private", { tribe: "Igbo", tribeVis: "private" });
  await setFilters(viewer, { tribes: ["Yoruba"], tribeUnsaid: true });
  assert.equal(await passes(viewer, yorubaShown), true, "matched case- and space-insensitively");
  assert.equal(await passes(viewer, igboShown), false);
  assert.equal(await passes(viewer, yorubaOnMatch), true, "hidden from the six counts as 'doesn't say'");
  assert.equal(await passes(viewer, igboPrivate), true, "…whatever the hidden value is");
  await setFilters(viewer, { tribes: ["Yoruba"], tribeUnsaid: false });
  assert.equal(await passes(viewer, yorubaOnMatch), false);
  assert.equal(await passes(viewer, igboPrivate), false, "both hidden, both left out alike");
});

test("a religion stored before the list, or 'Prefer not to say', counts as 'doesn't say'", async () => {
  const { member, setFilters, passes } = await setup();
  const viewer = await member("Viewer", { tier: "diaspora" });
  const legacy = await member("Legacy", { religion: "Christianity (RCCG)" });
  const prefer = await member("Prefers Not", { religion: "Prefer not to say" });
  await setFilters(viewer, { religions: ["Muslim"], religionUnsaid: true });
  assert.equal(await passes(viewer, legacy), true);
  assert.equal(await passes(viewer, prefer), true);
  await setFilters(viewer, { religions: ["Muslim"], religionUnsaid: false });
  assert.equal(await passes(viewer, legacy), false);
  assert.equal(await passes(viewer, prefer), false);
});

test("filters never change who sees the filtering member", async () => {
  const { member, setFilters, six } = await setup();
  const filterer = await member("Filterer", { tier: "premium_plus", religion: "Muslim" });
  const other = await member("Other", { tier: "premium", religion: "Christian" });
  // The filterer excludes everyone they possibly can…
  await setFilters(filterer, { religions: ["Traditional"], religionUnsaid: false, tribes: ["Tiv"], tribeUnsaid: false });
  // …and still appears in the other member's six.
  assert.ok((await six(other)).includes(filterer), "the filterer is still seen by others");
  // The other member has no filters; the filterer's filters don't apply to them.
  assert.equal((await six(filterer)).includes(other), false, "while the filterer's own six is narrowed");
});

test("no widening beyond the filter: fewer than six is shown as fewer", async () => {
  const { member, setFilters, six } = await setup();
  const viewer = await member("Viewer", { tier: "premium" });
  const christian = await member("The Christian", { religion: "Christian" });
  const muslims = [];
  for (let i = 0; i < 6; i++) muslims.push(await member(`Muslim ${i}`, { religion: "Muslim" }));
  await setFilters(viewer, { religions: ["Christian"], religionUnsaid: false });

  assert.deepEqual(await six(viewer), [christian], "only the one who matches");
  assert.deepEqual(await six(viewer), [christian], "asking again doesn't widen it");

  // The member widens their own filters: today's six fills up, never past six.
  await setFilters(viewer, { religions: ["Christian", "Muslim"], religionUnsaid: false });
  const widened = await six(viewer);
  assert.equal(widened.length, 6);
  assert.equal(widened[0], christian, "the first stays first");
  assert.equal(new Set(widened).size, 6);
});

test("Starter has no filter access", async () => {
  const { db, me, member, setFilters, passes, six } = await setup();
  const starter = await member("Starter");
  const christian = await member("Christian", { religion: "Christian" });
  const muslim = await member("Muslim", { religion: "Muslim" });
  await assert.rejects(setFilters(starter, { religions: ["Christian"] }), /row-level security/i, "can't set filters");
  assert.equal((await me(starter, "select i_have_advanced_filters() as ok")).rows[0].ok, false);

  // Filters left from a lapsed plan are ignored, not applied.
  await db.query("insert into member_filters (profile_id, religions, religion_include_unsaid) values ($1, '{Christian}', false)", [starter]);
  assert.equal(await passes(starter, muslim), true);
  const s = await six(starter);
  assert.ok(s.includes(christian) && s.includes(muslim), "the six is unfiltered");
});

test("nobody can see another member's filters, or call the rule", async () => {
  const { me, member, setFilters } = await setup();
  const a = await member("Adaora", { tier: "premium" });
  const b = await member("Bisi", { tier: "premium" });
  await setFilters(a, { religions: ["Christian"] });
  assert.equal((await me(b, "select * from member_filters where profile_id = $1", [a])).rows.length, 0);
  assert.equal((await me(a, "select * from member_filters where profile_id = $1", [a])).rows.length, 1, "the owner sees their own");
  await assert.rejects(me(b, "select passes_own_filters($1, $2)", [a, b]), /permission denied/);
  await assert.rejects(me(b, "select has_advanced_filters($1)", [a]), /permission denied/, "nor learn another member's plan");
});

test("filters are deleted with the account", async () => {
  const { db, member, setFilters } = await setup();
  const m = await member("Leaving", { tier: "premium" });
  await setFilters(m, { religions: ["Christian"] });
  await db.query("delete from auth.users where id = $1", [m]);
  assert.equal((await db.query("select 1 from member_filters where profile_id = $1", [m])).rows.length, 0);
});

test("only religion and tribe are filterable — never denomination, genotype or history", async () => {
  const { db } = await setup();
  const { rows } = await db.query(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'member_filters' order by column_name",
  );
  assert.deepEqual(rows.map((r) => r.column_name), [
    "profile_id", "religion_include_unsaid", "religions", "tribe_include_unsaid", "tribes", "updated_at",
  ]);
  await assert.rejects(
    db.query("insert into member_filters (profile_id, religions) values (gen_random_uuid(), '{Prefer not to say}')"),
    undefined,
    "'Prefer not to say' isn't a filter value",
  );
});

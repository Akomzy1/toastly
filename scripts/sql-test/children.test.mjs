/**
 * Children (migration 0044; PRD §5.2, §5.2.4, §5.1.2) — against a throwaway
 * Postgres (PGlite). Never production.
 *
 *   node --test scripts/sql-test/children.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { freshDb, as, makeUser, goLive } from "./harness.mjs";

async function setup() {
  const db = await freshDb();
  const me = (id, sql, params) => as(db, id, (tx) => tx.query(sql, params));
  async function member(name, { gender = "man", tier = null } = {}) {
    const id = await makeUser(db, { name, email: `${crypto.randomUUID()}@example.com`, gender });
    await goLive(db, id);
    if (tier) await db.query("insert into entitlements (profile_id, tier, source, ends_at) values ($1, $2, 'subscription', now() + interval '30 days')", [id, tier]);
    return id;
  }
  // As the member saves it (own row, RLS).
  const answer = (id, f) =>
    me(
      id,
      `insert into profile_history (profile_id, children, visibility, wants_children, wants_children_visibility)
       values ($1, $2, $3, $4, $5)
       on conflict (profile_id) do update set children = excluded.children, visibility = excluded.visibility,
         wants_children = excluded.wants_children, wants_children_visibility = excluded.wants_children_visibility`,
      [id, f.children ?? null, f.visibility ?? "on_match", f.wants ?? null, f.wantsVisibility ?? "public"],
    );
  const view = async (viewer, owner) => (await me(viewer, "select profile_for($1) as p", [owner])).rows[0].p;
  // The owner in the viewer's six today: the viewer can open the profile,
  // but isn't matched.
  const inSix = (viewer, owner) =>
    db.query("insert into daily_feed (profile_id, feed_date, position, candidate_id) values ($1, current_date, 1, $2)", [viewer, owner]);
  // Matched (viewer_matched, 0032): an accepted Gist between them.
  const match = async (a, b) => {
    await inSix(a, b);
    await db.query("insert into gist_sessions (proposer_id, invitee_id, status) values ($1, $2, 'completed')", [a, b]);
  };
  const setFilters = (id, f) =>
    me(
      id,
      `insert into member_filters (profile_id, wants_children, wants_children_include_unsaid) values ($1, $2, $3)
       on conflict (profile_id) do update set wants_children = excluded.wants_children,
         wants_children_include_unsaid = excluded.wants_children_include_unsaid`,
      [id, f.wants ?? [], f.unsaid ?? true],
    );
  const passes = async (viewer, candidate) => (await db.query("select passes_own_filters($1, $2) as ok", [viewer, candidate])).rows[0].ok;
  return { db, me, member, answer, view, inSix, match, setFilters, passes };
}

test("has_children becomes the count: yes -> Prefer not to say, no -> None", async () => {
  const db = await freshDb({ upTo: "0043" });
  const ids = [];
  for (const v of [true, false, null]) {
    const id = await makeUser(db, { name: `Old ${v}`, email: `${crypto.randomUUID()}@example.com`, gender: "man" });
    await db.query("insert into profile_history (profile_id, has_children) values ($1, $2)", [id, v]);
    ids.push(id);
  }
  await db.exec(fs.readFileSync("supabase/migrations/0044_children_fields.sql", "utf8"));
  const got = async (id) => (await db.query("select children from profile_history where profile_id = $1", [id])).rows[0].children;
  assert.equal(await got(ids[0]), "prefer_not_to_say");
  assert.equal(await got(ids[1]), "none");
  assert.equal(await got(ids[2]), null);
  const cols = (await db.query("select column_name from information_schema.columns where table_name = 'profile_history'")).rows.map((r) => r.column_name);
  assert.ok(!cols.includes("has_children"), "the yes/no flag is gone");
});

test("'Children' is hidden from a non-matched viewer by default; shown once matched", async () => {
  const { member, answer, view, inSix, match } = await setup();
  const owner = await member("Owner", { gender: "woman" });
  const stranger = await member("Stranger");
  const matched = await member("Matched");
  await answer(owner, { children: "two" }); // visibility left at its default
  await inSix(stranger, owner);
  await match(matched, owner);
  assert.equal((await view(stranger, owner)).matched, false, "the stranger can open the profile but isn't matched");

  assert.equal((await view(stranger, owner)).children, undefined, "hidden until a match");
  assert.equal((await view(matched, owner)).children, "two");

  // The owner may show it to everyone…
  await answer(owner, { children: "two", visibility: "public" });
  assert.equal((await view(stranger, owner)).children, "two");
  // …or to nobody.
  await answer(owner, { children: "two", visibility: "private" });
  assert.equal((await view(matched, owner)).children, undefined);
  // "Prefer not to say" is never shown as a value.
  await answer(owner, { children: "prefer_not_to_say", visibility: "public" });
  assert.equal((await view(stranger, owner)).children, undefined);
  // The default is on_match, never public.
  const { db } = await setup();
  const d = (await db.query("select column_default from information_schema.columns where table_name = 'profile_history' and column_name = 'visibility'")).rows[0].column_default;
  assert.match(d, /on_match/);
});

test("'Do you want children?' is shown by default and can be hidden", async () => {
  const { member, answer, view, inSix } = await setup();
  const owner = await member("Owner", { gender: "woman" });
  const stranger = await member("Stranger");
  await inSix(stranger, owner);
  await answer(owner, { wants: "open" });
  assert.equal((await view(stranger, owner)).wants_children, "open", "shown on the full profile by default");
  await answer(owner, { wants: "open", wantsVisibility: "private" });
  assert.equal((await view(stranger, owner)).wants_children, undefined, "hideable");
});

test("members can't read each other's children answers directly", async () => {
  const { me, member, answer } = await setup();
  const owner = await member("Owner", { gender: "woman" });
  const other = await member("Other");
  await answer(owner, { children: "one", visibility: "public", wants: "yes" });
  assert.equal((await me(other, "select * from profile_history where profile_id = $1", [owner])).rows.length, 0);
});

test("the wants-children filter ignores hidden values", async () => {
  const { member, answer, setFilters, passes } = await setup();
  const viewer = await member("Viewer", { tier: "premium" });
  const yesShown = await member("Yes Shown", { gender: "woman" });
  const noShown = await member("No Shown", { gender: "woman" });
  const yesHidden = await member("Yes Hidden", { gender: "woman" });
  const noHidden = await member("No Hidden", { gender: "woman" });
  const yesOnMatch = await member("Yes On Match", { gender: "woman" });
  const noOnMatch = await member("No On Match", { gender: "woman" });
  const unanswered = await member("Unanswered", { gender: "woman" });
  await answer(yesShown, { wants: "yes" });
  await answer(noShown, { wants: "no" });
  await answer(yesHidden, { wants: "yes", wantsVisibility: "private" });
  await answer(noHidden, { wants: "no", wantsVisibility: "private" });
  await answer(yesOnMatch, { wants: "yes", wantsVisibility: "on_match" });
  await answer(noOnMatch, { wants: "no", wantsVisibility: "on_match" });

  await setFilters(viewer, { wants: ["yes"], unsaid: true });
  assert.equal(await passes(viewer, yesShown), true);
  assert.equal(await passes(viewer, noShown), false, "a shown value is matched");
  assert.equal(await passes(viewer, yesHidden), true, "hidden counts as 'doesn't say'");
  assert.equal(await passes(viewer, noHidden), true, "…whatever the hidden value is");
  assert.equal(await passes(viewer, yesOnMatch), true, "on_match is hidden from the six too");
  assert.equal(await passes(viewer, noOnMatch), true, "…so an on_match 'No' isn't read either");
  assert.equal(await passes(viewer, unanswered), true);

  await setFilters(viewer, { wants: ["yes"], unsaid: false });
  assert.equal(await passes(viewer, yesHidden), false, "with 'don't say' off, hidden is left out…");
  assert.equal(await passes(viewer, noHidden), false, "…the same way, whatever the hidden value");
  assert.equal(await passes(viewer, unanswered), false);
  assert.equal(await passes(viewer, yesOnMatch), false, "an on_match 'Yes' is hidden, so left out too");
  assert.equal(await passes(viewer, yesShown), true);

  // "Include people who don't say" is on by default.
  const { db } = await setup();
  const d = (await db.query("select column_default from information_schema.columns where table_name = 'member_filters' and column_name = 'wants_children_include_unsaid'")).rows[0].column_default;
  assert.equal(d, "true");
});

test("Starter has no filter access", async () => {
  const { db, me, member, answer, setFilters, passes } = await setup();
  const starter = await member("Starter");
  const noShown = await member("No Shown", { gender: "woman" });
  await answer(noShown, { wants: "no" });
  await assert.rejects(setFilters(starter, { wants: ["yes"] }), /row-level security/i, "can't set the filter");
  assert.equal((await me(starter, "select i_have_advanced_filters() as ok")).rows[0].ok, false);
  // A filter left from a lapsed plan is ignored.
  await db.query("insert into member_filters (profile_id, wants_children, wants_children_include_unsaid) values ($1, '{yes}', false)", [starter]);
  assert.equal(await passes(starter, noShown), true);
});

test("the number of children can't be filtered, or read by matching or ranking", async () => {
  const { db } = await setup();
  // No filter column for it, and no value it could take.
  const cols = (await db.query("select column_name from information_schema.columns where table_name = 'member_filters'")).rows.map((r) => r.column_name);
  assert.deepEqual(cols.filter((c) => /child/.test(c)).sort(), ["wants_children", "wants_children_include_unsaid"]);

  // No database function but profile_for reads the column.
  const readers = (await db.query(
    `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosrc ~ '(^|[^a-z_.])(h|ph|profile_history)\\.children\\M'`,
  )).rows.map((r) => r.proname);
  assert.deepEqual(readers, ["profile_for"]);

  // And it changes nothing: the same people, the same filter verdicts and
  // the same six, in two worlds that differ only in the counts.
  async function world(countA, countB) {
    const w = await setup();
    const viewer = await w.member("Viewer", { tier: "premium" });
    const a = await w.member("Ada", { gender: "woman" });
    const b = await w.member("Bisi", { gender: "woman" });
    await w.answer(a, { children: countA, visibility: "public" });
    await w.answer(b, { children: countB, visibility: "public" });
    const six = (await w.me(viewer, "select candidate_id from build_daily_feed($1)", [viewer])).rows.map((r) => r.candidate_id);
    return { a: await w.passes(viewer, a), b: await w.passes(viewer, b), sixHasBoth: six.includes(a) && six.includes(b), size: six.length };
  }
  const one = await world("none", "three_plus");
  const two = await world("three_plus", "none");
  assert.deepEqual(two, one);
  assert.equal(one.sixHasBoth, true);
});

test("'Photo shows a child' is a report reason that goes to a person", async () => {
  const { db, me, member } = await setup();
  const reporter = await member("Reporter", { gender: "woman" });
  const reported = await member("Reported");
  const { rows } = await me(reporter, "insert into reports (reporter_id, reported_id, reason) values ($1, $2, 'photo_of_child') returning id", [reporter, reported]);
  const item = (await db.query("select kind, stage, urgent from review_items where source_table = 'reports' and source_id = $1", [rows[0].id])).rows[0];
  assert.ok(item, "in the review queue");
  assert.equal(item.stage, "new", "waiting for a person — nothing decided automatically");
  assert.equal((await db.query("select _report_label('photo_of_child'::report_reason) as l")).rows[0].l, "Photo shows a child");
  // Nothing removed: the reported member's photos and profile are untouched.
  assert.equal((await db.query("select count(*)::int as n from profile_photos where profile_id = $1", [reported])).rows[0].n, 4);
  assert.equal((await db.query("select count(*)::int as n from account_restrictions where profile_id = $1", [reported])).rows[0].n, 0);
});

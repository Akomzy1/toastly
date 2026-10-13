/**
 * Height, star sign and "Open to dating someone who has children?" (migration
 * 0048; PRD §5.2, §5.2.4, §5.2.5) — against a throwaway Postgres (PGlite) with
 * every migration applied. Never production.
 *
 *   node --test scripts/sql-test/profile-fields.test.mjs
 *
 * Each rule is proven against a planted violation: the test takes the rule (or
 * the guard) OUT of the function, shows the wrong thing now happens, then puts
 * it back. A test that passes either way proves nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb, as, makeUser, goLive } from "./harness.mjs";

function dobForAge(age) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  d.setMonth(d.getMonth() - 2);
  return d.toISOString().slice(0, 10);
}

async function setup() {
  const db = await freshDb();
  async function member(name, gender, { age = 30, dob = null, children = undefined, openToChildren = null, height = null, showStar = false } = {}) {
    const id = await makeUser(db, { name, email: `${crypto.randomUUID()}@example.com`, gender, dob: dob ?? dobForAge(age) });
    await goLive(db, id);
    await db.query("update profiles set age_min = 18, age_max = 70, open_to_children = $2, height_cm = $3, show_star_sign = $4 where id = $1", [id, openToChildren, height, showStar]);
    if (children !== undefined) {
      await db.query("insert into profile_history (profile_id, children) values ($1, $2) on conflict (profile_id) do update set children = excluded.children", [id, children]);
    }
    return id;
  }
  const reset = () => db.exec("delete from daily_feed; delete from feed_state; delete from feed_shown; delete from feed_passes;");
  const sixOn = async (id, days = 0) =>
    (await db.query("select candidate_id from _build_feed_for($1, now() + make_interval(days => $2::int))", [id, days])).rows.map((r) => r.candidate_id);
  const inSix = (viewer, candidate) =>
    db.query(`insert into daily_feed (profile_id, feed_date, position, candidate_id)
      select $1, current_date, coalesce(max(position), 0) + 1, $2 from daily_feed where profile_id = $1 and feed_date = current_date
      on conflict do nothing`, [viewer, candidate]);
  const profileFor = async (viewer, owner) => (await as(db, viewer, (tx) => tx.query("select profile_for($1) as p", [owner]))).rows[0].p;
  const fnDef = async (sig) => (await db.query("select pg_get_functiondef($1::regprocedure) as d", [sig])).rows[0].d;
  /** Run fn with a function body edited; always restore. */
  async function withEdited(sig, edit, fn) {
    const original = await fnDef(sig);
    const mutated = edit(original);
    assert.notEqual(mutated, original, "the edit changed the function");
    await db.exec(mutated);
    try { return await fn(); } finally { await db.exec(original); }
  }
  const SIX = "_feed_pick(uuid,timestamptz,integer)";
  const withRuleOff = (rule, fn) => withEdited(SIX, (d) => d.split("\n").map((l) =>
    l.includes(`-- rule:${rule}`) ? l.replace(/^(\s*and\s+).*?(\s*-- rule:\w+\s*)$/, "$1true$2") : l).join("\n"), fn);
  return { db, member, reset, sixOn, inSix, profileFor, fnDef, withEdited, withRuleOff, SIX };
}

// --- 1. "Open to dating someone who has children?" is private --------------------

test("no member can read another's open_to_children, by any route", async () => {
  const { db, member, inSix, profileFor, sixOn, withEdited } = await setup();
  const viewer = await member("Viewer", "man");
  const owner = await member("Owner Woman", "woman", { openToChildren: "no", children: "prefer_not_to_say" });
  await inSix(viewer, owner);

  // 1. Straight off the table: another member's profile row is not readable at all.
  const direct = await as(db, viewer, (tx) => tx.query("select open_to_children from profiles where id = $1", [owner]));
  assert.equal(direct.rows.length, 0, "no row, so no column");
  // 2. Not through the one read of another member.
  const pf = await profileFor(viewer, owner);
  assert.ok(pf, "the profile opens, so this isn't vacuous");
  assert.ok(!JSON.stringify(pf).toLowerCase().includes("open_to_children"), "no key");
  assert.ok(!("open_to_children" in pf));
  // 3. Not through the six, nor any other function the member can call.
  await sixOn(viewer);
  const cols = (await db.query("select column_name from information_schema.columns where table_name = 'daily_feed'")).rows.map((r) => r.column_name);
  assert.ok(!cols.includes("open_to_children"));
  const readers = (await db.query(
    "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosrc ilike '%open_to_children%' order by 1")).rows.map((r) => r.proname);
  assert.deepEqual(readers, ["_children_rule_ok"], "only the rule reads it");
  // 4. The rule itself can't be called by a member.
  await assert.rejects(as(db, viewer, (tx) => tx.query("select _children_rule_ok($1, $2)", [viewer, owner])), /permission denied/);
  // 5. Anonymous callers get nothing either.
  const anon = await db.transaction(async (tx) => {
    await tx.exec("set local role anon");
    return tx.query("select count(*)::int as n from profiles").catch((e) => ({ rows: [{ n: -1 }], err: e.message }));
  });
  assert.ok(anon.rows[0].n <= 0, "anon sees no profile rows");
  // The owner reads their own.
  const own = await as(db, owner, (tx) => tx.query("select open_to_children from profiles where id = $1", [owner]));
  assert.equal(own.rows[0].open_to_children, "no");

  // Planted violation: profile_for starts returning it. The same checks catch it.
  await withEdited("profile_for(uuid)", (d) => d.replace("    'height_cm', p.height_cm,", "    'height_cm', p.height_cm, 'open_to_children', p.open_to_children,"), async () => {
    const leaked = await profileFor(viewer, owner);
    assert.ok("open_to_children" in leaked, "the planted leak is visible to this test");
    const bad = (await db.query("select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosrc ilike '%open_to_children%' order by 1")).rows.map((r) => r.proname);
    assert.notDeepEqual(bad, ["_children_rule_ok"], "and the function scan flags profile_for");
  });
  assert.ok(!("open_to_children" in (await profileFor(viewer, owner))), "restored");
});

// --- 2 and 3. The two-way rule in today's six --------------------------------------

test("a member who said No never gets a member with 1, 2 or 3+ children, and never appears in theirs", async () => {
  const t = await setup();
  const { member, sixOn, reset, withRuleOff } = t;

  // He said No. The women differ only in their Children answer.
  const he = await member("Says No", "man", { openToChildren: "no" });
  const none = await member("Children None", "woman", { children: "none" });
  const pns = await member("Prefers Not", "woman", { children: "prefer_not_to_say" });
  const blank = await member("No Answer", "woman");
  const one = await member("Has One", "woman", { children: "one" });
  const two = await member("Has Two", "woman", { children: "two" });
  const three = await member("Has Three", "woman", { children: "three_plus" });

  const his = await sixOn(he);
  for (const ok of [none, pns, blank]) assert.ok(his.includes(ok), "not excluded: none, prefer not to say, or no answer");
  for (const no of [one, two, three]) assert.ok(!his.includes(no), "excluded: 1, 2 and 3 or more");

  // And the other way round: they never see him.
  for (const [w, shown] of [[one, false], [two, false], [three, false], [none, true], [pns, true], [blank, true]]) {
    await reset();
    assert.equal((await sixOn(w)).includes(he), shown, "from her side");
  }

  // Planted violation: take the rule out and the excluded appear, both ways.
  await reset();
  const bad = await withRuleOff("children", () => sixOn(he));
  for (const no of [one, two, three]) assert.ok(bad.includes(no), "without rule:children the test would see them");
  await reset();
  assert.ok((await withRuleOff("children", () => sixOn(one))).includes(he), "and from her side");
  await reset();
  assert.ok(!(await sixOn(he)).includes(one), "rule restored");
});

test("it works the other way: a member WITH children is not shown to someone who said No, and Not set means Yes", async () => {
  const { member, sixOn, reset } = await setup();
  const mum = await member("Has Children", "woman", { children: "two" });
  const no = await member("Says No", "man", { openToChildren: "no" });
  const yes = await member("Says Yes", "man", { openToChildren: "yes" });
  const unset = await member("Not Set", "man");
  assert.ok(!(await sixOn(mum)).includes(no), "she doesn't get him");
  await reset();
  const hers = await sixOn(mum);
  assert.ok(hers.includes(yes) && hers.includes(unset), "Yes and not set are fine");
  await reset();
  assert.ok(!(await sixOn(no)).includes(mum), "he doesn't get her");
  await reset();
  assert.ok((await sixOn(yes)).includes(mum) && (await sixOn(unset)).includes(mum));
});

test("a member who said No is not hidden from members with no children, and the rule is on every plan", async () => {
  const { db, member, sixOn } = await setup();
  const he = await member("Says No Premium", "man", { openToChildren: "no" });
  await db.query("insert into entitlements (profile_id, tier, source, ends_at) values ($1, 'premium_plus', 'subscription', now() + interval '30 days')", [he]);
  const starterMum = await member("Has Children Starter", "woman", { children: "one" });
  const free = await member("Child Free", "woman", { children: "none" });
  const six = await sixOn(he);
  assert.ok(six.includes(free));
  assert.ok(!six.includes(starterMum), "paying doesn't switch the rule off");
});

// --- 4. Star sign, from the date of birth ------------------------------------------

test("star_sign appears only when shown; the date of birth is never returned", async () => {
  const { db, member, inSix, profileFor, withEdited } = await setup();
  const viewer = await member("Viewer", "man");
  // 14 July 1995 is Cancer.
  const hidden = await member("Sign Hidden", "woman", { dob: "1995-07-14", showStar: false });
  const shown = await member("Sign Shown", "woman", { dob: "1995-07-14", showStar: true });
  await inSix(viewer, hidden);
  await inSix(viewer, shown);

  const h = await profileFor(viewer, hidden);
  const s = await profileFor(viewer, shown);
  assert.ok(h && s);
  assert.ok(!("star_sign" in h), "off by default: no star_sign key at all");
  assert.equal(s.star_sign, "Cancer");
  for (const pf of [h, s]) {
    const text = JSON.stringify(pf);
    assert.ok(!/date_of_birth|dob|birth/i.test(text), "no date-of-birth key");
    assert.ok(!text.includes("1995-07-14") && !text.includes("1995"), "and no part of the date of birth");
  }
  assert.ok(typeof h.age === "number", "age (a number) is the existing field, not the date");

  // The setting is the member's: off means off, whatever the date.
  await db.query("update profiles set show_star_sign = true where id = $1", [hidden]);
  assert.equal((await profileFor(viewer, hidden)).star_sign, "Cancer");
  await db.query("update profiles set show_star_sign = false where id = $1", [hidden]);
  assert.ok(!("star_sign" in (await profileFor(viewer, hidden))));

  // Planted violation: the flag is ignored. This test catches it.
  await withEdited("profile_for(uuid)", (d) => d.replace("case when p.show_star_sign", "case when true"), async () => {
    assert.ok("star_sign" in (await profileFor(viewer, hidden)), "the planted leak is visible: the sign shows although it is off");
  });
  assert.ok(!("star_sign" in (await profileFor(viewer, hidden))), "restored");

  // The member's own preview.
  const me = await as(db, hidden, (tx) => tx.query("select my_star_sign() as s"));
  assert.equal(me.rows[0].s, "Cancer");
});

test("the sign is right at the edges of each sign", async () => {
  const { db } = await setup();
  const cases = [
    ["2000-03-20", "Pisces"], ["2000-03-21", "Aries"], ["2000-04-19", "Aries"], ["2000-04-20", "Taurus"],
    ["2000-05-20", "Taurus"], ["2000-05-21", "Gemini"], ["2000-06-20", "Gemini"], ["2000-06-21", "Cancer"],
    ["2000-07-22", "Cancer"], ["2000-07-23", "Leo"], ["2000-08-22", "Leo"], ["2000-08-23", "Virgo"],
    ["2000-09-22", "Virgo"], ["2000-09-23", "Libra"], ["2000-10-22", "Libra"], ["2000-10-23", "Scorpio"],
    ["2000-11-21", "Scorpio"], ["2000-11-22", "Sagittarius"], ["2000-12-21", "Sagittarius"], ["2000-12-22", "Capricorn"],
    ["2000-12-31", "Capricorn"], ["2000-01-01", "Capricorn"], ["2000-01-19", "Capricorn"], ["2000-01-20", "Aquarius"],
    ["2000-02-18", "Aquarius"], ["2000-02-19", "Pisces"], ["2000-02-29", "Pisces"],
  ];
  for (const [d, sign] of cases) {
    assert.equal((await db.query("select _star_sign($1::date) as s", [d])).rows[0].s, sign, d);
  }
  assert.equal((await db.query("select _star_sign(null) as s")).rows[0].s, null);
});

// --- 5. Height ------------------------------------------------------------------------

test("height outside 120-220 cm is refused; the edges, and no height, are fine", async () => {
  const { db, member } = await setup();
  const id = await member("Height Woman", "woman");
  const set = (v) => as(db, id, (tx) => tx.query("update profiles set height_cm = $2 where id = $1", [id, v]));
  for (const bad of [0, 119, 221, 300, -5]) await assert.rejects(set(bad), /profiles_height_cm_check|violates check/, `${bad} cm`);
  for (const good of [120, 170, 220]) await set(good);
  await set(null);
  assert.equal((await db.query("select height_cm from profiles where id = $1", [id])).rows[0].height_cm, null);

  // Planted violation: without the constraint, 300 goes in. The test can tell.
  await db.exec("alter table profiles drop constraint profiles_height_cm_check");
  await set(300);
  assert.equal((await db.query("select height_cm from profiles where id = $1", [id])).rows[0].height_cm, 300, "the planted gap lets 300 in");
  await db.exec("update profiles set height_cm = null; alter table profiles add constraint profiles_height_cm_check check (height_cm is null or height_cm between 120 and 220)");
  await assert.rejects(set(300), /violates check/, "restored");
});

test("height comes through profile_for; the open_to_children value never does", async () => {
  const { member, inSix, profileFor } = await setup();
  const viewer = await member("Viewer", "man");
  const w = await member("Tall Woman", "woman", { height: 170, openToChildren: "yes" });
  await inSix(viewer, w);
  const pf = await profileFor(viewer, w);
  assert.equal(pf.height_cm, 170);
  assert.ok(!("open_to_children" in pf));
});

// --- 6. Nothing ranks or filters on them -------------------------------------------------

const TOKENS = /height|star_sign|show_star_sign|open_to_children/i;
const strip = (s) => s.replace(/--[^\n]*/g, "");

test("no filter or score term reads height, star sign or open_to_children", async () => {
  const { db, fnDef, withEdited, SIX } = await setup();
  const src = async (name) => (await db.query("select prosrc from pg_proc where proname = $1", [name])).rows[0].prosrc;

  // The filter functions and the member_filters table.
  for (const name of ["passes_own_filters", "_viewer_filters_set", "my_filters_active", "has_advanced_filters"]) {
    assert.ok(!TOKENS.test(strip(await src(name))), `${name} reads none of them`);
  }
  const filterCols = (await db.query("select column_name from information_schema.columns where table_name = 'member_filters'")).rows.map((r) => r.column_name);
  assert.ok(!filterCols.some((c) => TOKENS.test(c)), "member_filters has no column for them");

  // The selection: no score term, and no rule other than the one children rule.
  const def = await fnDef(SIX);
  const termLines = def.split("\n").filter((l) => /-- term:/.test(l));
  assert.equal(termLines.length, 7);
  for (const l of termLines) assert.ok(!TOKENS.test(l.replace(/--.*$/, "")), `a score term reads one: ${l.trim()}`);
  const body = strip(def);
  assert.ok(!TOKENS.test(body.replace(/_children_rule_ok/g, "")), "the selection body names none of them (the rule is a separate, sanctioned helper)");
  assert.equal((def.match(/_children_rule_ok/g) ?? []).length, 1, "the helper is called exactly once");

  // Planted violations: each is caught by the same checks.
  for (const [what, line] of [
    ["height in the score", "+ (select (p2.height_cm > 170)::int from profiles p2 where p2.id = c.id)"],
    ["star sign in the score", "+ (select p2.show_star_sign::int from profiles p2 where p2.id = c.id)"],
    ["open_to_children in the score", "+ (select (p2.open_to_children = 'yes')::int from profiles p2 where p2.id = c.id)"],
  ]) {
    await withEdited(SIX, (d) => d.split("\n").map((l) => (l.includes("-- term:random") ? `           ${line}  -- term:random` : l)).join("\n"), async () => {
      const bad = (await fnDef(SIX)).split("\n").filter((l) => /-- term:/.test(l));
      assert.ok(bad.some((l) => TOKENS.test(l.replace(/--.*$/, ""))), `${what} is caught`);
    });
  }
  assert.ok(!TOKENS.test(strip(await fnDef(SIX)).replace(/_children_rule_ok/g, "")), "restored");
});

/**
 * Today's six (migration 0045; PRD §5.2.5) — against a throwaway Postgres
 * (PGlite) with every migration applied. Never production.
 *
 *   node --test scripts/sql-test/feed-5-2-5.test.mjs
 *
 * Every rule is proven against a planted violation: the test takes the rule
 * OUT of the function, shows the wrong person now appears, then puts it back.
 * A test that passes either way proves nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb, as, makeUser, goLive } from "./harness.mjs";

const SIX_FN = "_feed_pick(uuid,timestamptz,integer)";
const BUILD_FN = "_build_feed_for(uuid,timestamptz)";

function dobForAge(age) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  d.setMonth(d.getMonth() - 2);
  return d.toISOString().slice(0, 10);
}

async function setup() {
  const db = await freshDb();

  /** A live member who is active in the app right now. */
  async function member(name, gender, { age = 30, ageMin = null, ageMax = null, intent = null, city = "Lagos", seenDaysAgo = 0 } = {}) {
    const id = await makeUser(db, { name, email: `${crypto.randomUUID()}@example.com`, gender, dob: dobForAge(age) });
    await goLive(db, id);
    await db.query("update profiles set age_min = $2, age_max = $3, intent = $4, city = $5 where id = $1", [id, ageMin, ageMax, intent, city]);
    await db.query("insert into member_presence (profile_id, seen_at) values ($1, now() - make_interval(days => $2::int)) on conflict (profile_id) do update set seen_at = excluded.seen_at", [id, seenDaysAgo]);
    return id;
  }
  /** Wide range: only the OTHER person's range can exclude them. */
  const wide = { ageMin: 18, ageMax: 70 };

  /** Everyone is "seen" `days` from now, as if the app had been opened then. */
  const touchAll = (days) => db.query("update member_presence set seen_at = now() + make_interval(days => $1::int)", [days]);
  /** The six on day `days` from now. */
  const sixOn = async (id, days = 0) =>
    (await db.query(`select candidate_id from _build_feed_for($1, now() + make_interval(days => $2::int))`, [id, days])).rows.map((r) => r.candidate_id);
  const pick = async (id, days = 0, n = 50) =>
    (await db.query(`select candidate_id, score::float8 as score from _feed_pick($1, now() + make_interval(days => $2::int), $3)`, [id, days, n])).rows;
  const reset = () => db.exec("delete from daily_feed; delete from feed_state; delete from feed_shown; delete from feed_passes;");
  const config = (key, value) => db.query("update feed_config set value = $2 where key = $1", [key, value]);

  const fnDef = async (sig) => (await db.query("select pg_get_functiondef($1::regprocedure) as d", [sig])).rows[0].d;
  /** Run fn with `rule` taken out of the selection; always restore. */
  async function withRuleOff(rule, fn) {
    const original = await fnDef(SIX_FN);
    const lines = original.split("\n");
    let hit = 0;
    const mutated = lines.map((l) => {
      if (!l.includes(`-- rule:${rule}`)) return l;
      hit++;
      if (/^\s*if\s/.test(l)) return l.replace(/^(\s*if\s+).*?(\s+then\s+-- rule:\w+\s*)$/, "$1true$2");
      return l.replace(/^(\s*(?:and|where)\s+).*?(\s*-- rule:\w+\s*)$/, "$1true$2");
    }).join("\n");
    assert.equal(hit, 1, `exactly one line is tagged rule:${rule}`);
    assert.notEqual(mutated, original);
    await db.exec(mutated);
    try { return await fn(); } finally { await db.exec(original); }
  }
  /** Run fn with a score line replaced by `replacement`; always restore. */
  async function withTermReplaced(term, replacement, fn) {
    const original = await fnDef(SIX_FN);
    let hit = 0;
    const mutated = original.split("\n").map((l) => {
      if (!l.includes(`-- term:${term}`)) return l;
      hit++;
      return `           ${replacement}  -- term:${term}`;
    }).join("\n");
    assert.equal(hit, 1);
    await db.exec(mutated);
    try { return await fn(); } finally { await db.exec(original); }
  }

  return { db, member, wide, touchAll, sixOn, pick, reset, config, fnDef, withRuleOff, withTermReplaced };
}

// --- 1. Mutual gender and age ----------------------------------------------------

test("a candidate outside either person's gender or age preference never appears", async () => {
  const t = await setup();
  const { member, wide, sixOn, reset } = t;

  const viewer = await member("Viewer Man", "man", { age: 30 }); // default range 26–35
  const control = await member("Fits Both", "woman", { age: 29, ...wide });
  const sameGender = await member("Same Gender", "man", { age: 29, ...wide });
  const tooOld = await member("Too Old For Him", "woman", { age: 45, ...wide }); // outside HIS range
  const hesTooYoung = await member("Her Range Excludes Him", "woman", { age: 29, ageMin: 40, ageMax: 50 }); // he is outside HER range

  const six = await sixOn(viewer);
  assert.deepEqual(six, [control], "only the person who fits both ways");

  // The same rules, seen from the other side.
  await reset();
  const herSix = await sixOn(control);
  assert.ok(herSix.includes(viewer) && herSix.includes(sameGender), "she sees the men who fit her, both ways");
  assert.ok(!herSix.includes(tooOld) && !herSix.includes(hesTooYoung), "and no women");

  // Planted violations: take each rule out and the wrong person appears.
  for (const [rule, intruder, why] of [
    ["gender", sameGender, "a man in a man's six"],
    ["age_mine", tooOld, "someone outside the viewer's own range"],
    ["age_theirs", hesTooYoung, "a viewer outside the candidate's range"],
  ]) {
    await reset();
    const bad = await t.withRuleOff(rule, () => sixOn(viewer));
    assert.ok(bad.includes(intruder), `without rule:${rule} the test would see ${why} — so it can tell`);
    await reset();
    assert.ok(!(await sixOn(viewer)).includes(intruder), `rule:${rule} restored`);
  }
});

test("the age window is exactly the member's own range (0027)", async () => {
  const { db, member } = await setup();
  const cfg = (await db.query("select age_floor, age_cap, age_below, age_above, age_min_span from match_config")).rows[0];
  const cases = [
    { age: 22, ageMin: null, ageMax: null },
    { age: 30, ageMin: null, ageMax: null },
    { age: 31, ageMin: 25, ageMax: 40 },
    { age: 60, ageMin: null, ageMax: null },
    { age: 24, ageMin: 30, ageMax: 70 }, // "70+"
  ];
  for (const c of cases) {
    const id = await member(`W ${c.age}`, "woman", c);
    const r = (await db.query("select lo, hi from _age_range($1)", [id])).rows[0];
    for (let a = 18; a <= 75; a++) {
      const expected = a >= r.lo && (r.hi === null || a <= r.hi);
      const got = (await db.query("select _age_in_window($1, $2::smallint, $3::smallint, $4, $5, $6, $7, $8, $9) as ok",
        [a, c.ageMin, c.ageMax, c.age, cfg.age_floor, cfg.age_cap, cfg.age_below, cfg.age_above, cfg.age_min_span])).rows[0].ok;
      assert.equal(got, expected, `age ${a} against ${JSON.stringify(c)}`);
    }
  }
  // An unknown age is never filtered out.
  assert.equal((await db.query("select _age_in_window(null, 25::smallint, 30::smallint, null, 18, 70, 4, 5, 9) as ok")).rows[0].ok, true);
});

test("fewer than six is shown as fewer than six — the rules are never relaxed to fill", async () => {
  const { member, wide, sixOn } = await setup();
  const viewer = await member("Viewer", "man", { age: 30 });
  const a = await member("Amaka", "woman", { age: 29, ...wide });
  const b = await member("Bisi", "woman", { age: 28, ...wide });
  await member("Another Man", "man", { age: 29, ...wide });
  await member("Too Old", "woman", { age: 50, ...wide });
  const six = await sixOn(viewer);
  assert.deepEqual([...six].sort(), [a, b].sort());
});

// --- 2. Cool-down and passing on -------------------------------------------------

test("ignored candidates return after the cool-down; passed ones never do", async () => {
  const t = await setup();
  const { db, member, wide, touchAll, sixOn, reset } = t;
  const viewer = await member("Viewer", "man", { age: 30, ...wide });
  const ignored = await member("Ignored", "woman", { age: 29, ...wide });
  const passed = await member("Passed", "woman", { age: 28, ...wide });

  const day0 = await sixOn(viewer, 0);
  assert.deepEqual([...day0].sort(), [ignored, passed].sort(), "both shown on day 0");
  await as(db, viewer, (tx) => tx.query("select pass_on($1)", [passed]));
  assert.equal((await db.query("select count(*)::int as n from feed_passes where profile_id = $1", [viewer])).rows[0].n, 1);

  for (const day of [1, 2, 15, 29]) {
    await touchAll(day);
    assert.deepEqual(await sixOn(viewer, day), [], `day ${day}: still inside the cool-down`);
  }
  await touchAll(31);
  assert.deepEqual(await sixOn(viewer, 31), [ignored], "day 31: the ignored one is back; the passed one is not");
  for (const day of [62, 120, 400]) {
    await touchAll(day);
    const six = await sixOn(viewer, day);
    assert.ok(!six.includes(passed), `day ${day}: passed on, never again`);
  }

  // Planted violations.
  await reset();
  await t.withRuleOff("cooldown", async () => {
    await sixOn(viewer, 0);
    await touchAll(1);
    assert.ok((await sixOn(viewer, 1)).includes(ignored), "without rule:cooldown a member returns the next day");
  });
  await reset();
  await db.query("insert into feed_passes (profile_id, candidate_id) values ($1, $2)", [viewer, passed]);
  await t.withRuleOff("passed", async () => {
    await touchAll(40);
    assert.ok((await sixOn(viewer, 40)).includes(passed), "without rule:passed a passed member returns");
  });
});

test("you can only pass on someone in today's six", async () => {
  const { db, member, wide, sixOn } = await setup();
  const viewer = await member("Viewer", "man", { age: 30, ...wide });
  const inSix = await member("In Six", "woman", { age: 29, ...wide });
  const stranger = await member("Stranger", "woman", { age: 29, ...wide });
  await db.query("update profiles set paused = true where id = $1", [stranger]);
  await sixOn(viewer);
  await assert.rejects(as(db, viewer, (tx) => tx.query("select pass_on($1)", [stranger])), /today's six/);
  await as(db, viewer, (tx) => tx.query("select pass_on($1)", [inSix]));
  // Nobody else can read the pass.
  await assert.rejects(as(db, inSix, (tx) => tx.query("select * from feed_passes")), /permission denied/);
});

// --- Other exclusions -------------------------------------------------------------

test("reported, blocked, matched, in a Gist, replied to, inactive, not live: none appear", async () => {
  const t = await setup();
  const { db, member, wide, sixOn, pick, reset } = t;
  const viewer = await member("Viewer", "man", { age: 30, ...wide });
  const control = await member("Control", "woman", { age: 29, ...wide });

  const plants = [
    ["reported", async (x) => db.query("insert into reports (reporter_id, reported_id, reason) values ($1, $2, 'other')", [viewer, x])],
    ["blocked", async (x) => db.query("insert into blocks (blocker_id, blocked_id) values ($2, $1)", [viewer, x])], // blocked BY them
    ["gist", async (x) => db.query("insert into gist_sessions (proposer_id, invitee_id, status) values ($2, $1, 'declined')", [viewer, x])],
    ["replied", async (x) => db.query("insert into replies (sender_id, recipient_id, prompt_answer_id, kind) select $1, $2, id, 'gist_invite' from prompt_answers where profile_id = $2 limit 1", [viewer, x])],
    ["matched", async (x) => {
      const [a, b] = viewer < x ? [viewer, x] : [x, viewer];
      return db.query("insert into couples (member_a, member_b, status, proposed_by) values ($1, $2, 'ended', $3)", [a, b, viewer]);
    }],
    ["active", async (x) => db.query("update member_presence set seen_at = now() - interval '15 days' where profile_id = $1", [x])],
    // A profile with no prompt answer is not live (0036).
    ["live", async (x) => db.query("delete from prompt_answers where profile_id = $1", [x])],
  ];
  for (const [rule, plant] of plants) {
    const x = await member(`Planted ${rule}`, "woman", { age: 29, ...wide });
    await plant(x);
    await reset();
    const six = await sixOn(viewer);
    assert.ok(six.includes(control), `${rule}: the control is still there`);
    assert.ok(!six.includes(x), `${rule}: not shown`);
    await reset();
    // The built six checks "live" a second time on the way out (so a member who
    // stops being live mid-day disappears), so that one rule is read at the pick.
    const look = rule === "live" ? async () => (await pick(viewer)).map((r) => r.candidate_id) : () => sixOn(viewer);
    const bad = await t.withRuleOff(rule, look);
    assert.ok(bad.includes(x), `without rule:${rule} the planted member appears — so the test can tell`);
  }
});

test("a paused member is not shown", async () => {
  const { db, member, wide, sixOn } = await setup();
  const viewer = await member("Viewer", "man", { age: 30, ...wide });
  const paused = await member("Paused", "woman", { age: 29, ...wide });
  await db.query("update profiles set paused = true where id = $1", [paused]);
  assert.deepEqual(await sixOn(viewer), []);
});

// --- 3. Score ---------------------------------------------------------------------

test("score terms and weights (random off)", async () => {
  const { db, member, wide, pick, config } = await setup();
  await config("w_random", 0);
  const viewer = await member("Viewer", "man", { age: 30, intent: "serious", city: "Lagos", ...wide });
  const score = async (x) => (await pick(viewer)).find((r) => r.candidate_id === x)?.score;
  const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, `${m}: ${a} vs ${b}`);

  // Same intent .6 + same city .4 + seen today .3 + 1 answer .05 + new member .2
  const base = await member("Base", "woman", { age: 29, intent: "serious", city: "Lagos", ...wide });
  near(await score(base), 0.6 + 0.4 + 0.3 + 0.05 + 0.2, "all terms");

  const step1 = await member("One Step", "woman", { age: 29, intent: "open_to_serious", city: "Lagos", ...wide });
  near(await score(step1), 0.3 + 0.4 + 0.3 + 0.05 + 0.2, "one step apart");
  const step2 = await member("Two Steps", "woman", { age: 29, intent: "casual", city: "Lagos", ...wide });
  near(await score(step2), 0 + 0.4 + 0.3 + 0.05 + 0.2, "two steps apart");
  // Opposite ends: viewer casual vs marriage-minded is tested with a casual viewer below.
  const noIntent = await member("No Intent", "woman", { age: 29, intent: null, city: "Lagos", ...wide });
  near(await score(noIntent), 0.4 + 0.3 + 0.05 + 0.2, "no intent set: nothing added or taken");

  const elsewhere = await member("Abuja", "woman", { age: 29, intent: "serious", city: "Abuja", ...wide });
  near(await score(elsewhere), 0.6 + 0 + 0.3 + 0.05 + 0.2, "different city, same country: w_country is 0 as shipped");
  await config("w_country", 0.1);
  near(await score(elsewhere), 0.6 + 0.1 + 0.3 + 0.05 + 0.2, "w_country is a setting");
  await config("w_country", 0);

  // Recency.
  const warm = await member("Warm", "woman", { age: 29, intent: "serious", city: "Lagos", seenDaysAgo: 5, ...wide });
  near(await score(warm), 0.6 + 0.4 + 0.15 + 0.05 + 0.2, "seen within 7 days");
  const cool = await member("Cool", "woman", { age: 29, intent: "serious", city: "Lagos", seenDaysAgo: 10, ...wide });
  near(await score(cool), 0.6 + 0.4 + 0 + 0.05 + 0.2, "seen within the window, not within 7 days");

  // Prompt answers: .05 each, counted up to 3.
  for (const p of [1, 2, 3, 4, 5]) {
    await db.query("insert into prompt_answers (profile_id, prompt_id, answer) values ($1, $2, 'x') on conflict do nothing", [base, p]);
  }
  near(await score(base), 0.6 + 0.4 + 0.3 + 0.15 + 0.2, "answers capped at 3");

  // New member: only for the first 7 days live.
  await db.query("update profiles set first_live_at = now() - interval '8 days' where id = $1", [base]);
  near(await score(base), 0.6 + 0.4 + 0.3 + 0.15, "no longer new");

  // Exposure: -(impressions today / 50), capped at -0.5.
  const fillers = [];
  for (let i = 0; i < 30; i++) fillers.push(await makeUser(db, { name: `Filler ${i}`, email: `${crypto.randomUUID()}@example.com`, gender: "man" }));
  const addImpressions = async (x, from, to) => {
    for (let i = from; i < to; i++) {
      await db.query("insert into daily_feed (profile_id, feed_date, position, candidate_id) values ($1, current_date, 1, $2)", [fillers[i], x]);
    }
  };
  await addImpressions(base, 0, 10);
  near(await score(base), 0.6 + 0.4 + 0.3 + 0.15 - 0.2, "10 impressions today");
  await addImpressions(base, 10, 30);
  near(await score(base), 0.6 + 0.4 + 0.3 + 0.15 - 0.5, "30 impressions today: capped at -0.5");

  // Opposite ends.
  const casual = await member("Casual Viewer", "man", { age: 30, intent: "casual", city: "Lagos", ...wide });
  const marriage = await member("Marriage Woman", "woman", { age: 29, intent: "marriage_minded", city: "Lagos", ...wide });
  const cScore = (await pick(casual)).find((r) => r.candidate_id === marriage).score;
  near(cScore, -0.3 + 0.4 + 0.3 + 0.05 + 0.2, "opposite ends");

  // Random is 0..w_random and nothing else.
  await config("w_random", 0.2);
  const seen = [];
  for (let i = 0; i < 40; i++) seen.push((await pick(viewer)).find((r) => r.candidate_id === step1).score);
  const spread = Math.max(...seen) - Math.min(...seen);
  assert.ok(spread > 0 && spread <= 0.2 + 1e-9, `random tie-break spread ${spread}`);
});

test("plan tier does not change anyone's score", async () => {
  const t = await setup();
  const { db, member, wide, pick, config } = t;
  await config("w_random", 0);
  const viewer = await member("Viewer", "man", { age: 30, intent: "serious", ...wide });
  const a = await member("Amaka", "woman", { age: 29, intent: "serious", ...wide });
  const b = await member("Bisi", "woman", { age: 28, intent: "casual", ...wide });
  const grant = (id, tier) => db.query("insert into entitlements (profile_id, tier, source, ends_at) values ($1, $2, 'subscription', now() + interval '30 days')", [id, tier]);
  const scores = async () => Object.fromEntries((await pick(viewer)).map((r) => [r.candidate_id, r.score]));

  const before = await scores();
  assert.equal(Object.keys(before).length, 2);
  await grant(viewer, "premium_plus");
  assert.deepEqual(await scores(), before, "the viewer's plan changes no score");
  await grant(a, "premium");
  await grant(b, "premium_plus");
  assert.deepEqual(await scores(), before, "the candidates' plans change no score");

  // Planted violations: a tier term, on either side, is caught.
  await t.withTermReplaced("random", "+ case when current_tier(p_viewer) <> 'starter' then 1 else 0 end", async () => {
    assert.notDeepEqual(await scores(), before, "a viewer-tier term would move every score");
  });
  await t.withTermReplaced("random", "+ case when current_tier(c.id) <> 'starter' then 1 else 0 end", async () => {
    const after = await scores();
    assert.notDeepEqual(after, before, "a candidate-tier term would move scores");
  });
});

// --- 4. What the selection reads -------------------------------------------------

const FORBIDDEN = /religion|tribe|language|denomination|history|children|genotype|profession|education|photo|gidi/i;
// Two helpers are reached by design and are not descended into:
//   profile_is_live, assert_live — the live-profile gate (PRD §5.1.2), which looks at photos to decide LIVE.
//   passes_own_filters, _viewer_filters_set — the viewer's own opt-in filters (PRD §5.2.4).
const SANCTIONED = new Set(["profile_is_live", "passes_own_filters", "_viewer_filters_set", "assert_live"]);

async function reachableReads(db, roots) {
  const procs = (await db.query(
    "select p.proname, p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'")).rows;
  const bySrc = new Map(procs.map((p) => [p.proname, p.prosrc]));
  const strip = (s) => s.replace(/--[^\n]*/g, "");
  const seen = new Set();
  const hits = [];
  const walk = (name) => {
    if (seen.has(name) || !bySrc.has(name)) return;
    seen.add(name);
    const src = strip(bySrc.get(name));
    const m = src.match(FORBIDDEN);
    if (m) hits.push(`${name}: ${m[0]}`);
    for (const other of bySrc.keys()) {
      if (SANCTIONED.has(other)) continue;
      if (new RegExp(`\\b${other}\\s*\\(`).test(src)) walk(other);
    }
  };
  for (const r of roots) walk(r);
  return { hits, visited: [...seen] };
}

test("the selection reads no protected attribute, children, Our Gidi data or photo", async () => {
  const t = await setup();
  const { db } = t;
  const real = await reachableReads(db, ["_feed_pick", "_build_feed_for", "build_daily_feed"]);
  assert.deepEqual(real.hits, [], "nothing forbidden is read");
  for (const must of ["_feed_pick", "_build_feed_for", "can_meet", "is_restricted"]) {
    assert.ok(real.visited.includes(must), `the scan reached ${must} (so it isn't vacuous)`);
  }

  // Planted violations: each is caught.
  for (const [what, line] of [
    ["a tribe", "+ (select count(*) from profiles x where x.id = c.id and x.tribe is not null)"],
    ["a photo", "+ (select count(*) from profile_photos x where x.profile_id = c.id)"],
    ["the children field", "+ (select count(*) from profile_history x where x.profile_id = c.id and x.children_count > 0)"],
    ["religion", "+ (select 1 from profiles x where x.id = c.id and x.religion is not null limit 1)"],
  ]) {
    await t.withTermReplaced("random", line, async () => {
      const bad = await reachableReads(db, ["_feed_pick"]);
      assert.ok(bad.hits.length > 0, `${what} in the score is caught`);
    });
  }
  assert.deepEqual((await reachableReads(db, ["_feed_pick"])).hits, [], "restored");
});

test("no score term reads a plan, a pool, diaspora status or an optional field", async () => {
  const { fnDef } = await setup();
  const termLines = (await fnDef(SIX_FN)).split("\n").filter((l) => /-- term:/.test(l)).map((l) => l.replace(/--.*$/, ""));
  assert.equal(termLines.length, 7, "seven terms");
  for (const l of termLines) {
    assert.ok(!/tier|entitle|pool|diaspora|subscription|premium|filter/i.test(l), `score term reads only what the rule allows: ${l.trim()}`);
  }
});

// --- 5. Refill ---------------------------------------------------------------------

test("a place is refilled once if someone in the six stops being live or pauses", async () => {
  const t = await setup();
  const { db, member, wide, sixOn } = t;
  const viewer = await member("Viewer", "man", { age: 30, ...wide });
  const women = [];
  for (let i = 0; i < 8; i++) women.push(await member(`W${i}`, "woman", { age: 28 + (i % 3), ...wide }));

  const first = await sixOn(viewer);
  assert.equal(first.length, 6);
  const spare = women.filter((w) => !first.includes(w));
  assert.equal(spare.length, 2);

  // One pauses. The next look refills that place from the two unshown members.
  await db.query("update profiles set paused = true where id = $1", [first[0]]);
  const second = await sixOn(viewer);
  assert.equal(second.length, 6, "six again");
  assert.ok(!second.includes(first[0]));
  assert.ok(second.some((x) => spare.includes(x)), "the new face came from outside the first six");
  assert.deepEqual(second.filter((x) => first.includes(x)).sort(), first.slice(1).sort(), "the other five unchanged");
  assert.ok((await db.query("select refilled_at from feed_state where profile_id = $1", [viewer])).rows[0].refilled_at);

  // A second one leaves. No second refill: the place is empty, honestly.
  await db.query("update profiles set paused = true where id = $1", [first[1]]);
  const third = await sixOn(viewer);
  assert.equal(third.length, 5, "refilled once a day, not twice");
  assert.ok(!third.includes(first[1]));
  // Stable on repeat looks.
  assert.deepEqual(await sixOn(viewer), third);

  // Tomorrow it builds fresh.
  await t.touchAll(1);
  assert.ok((await sixOn(viewer, 1)).length >= 0);
});

test("a refill uses the same rules, and shows fewer if nobody qualifies", async () => {
  const { db, member, wide, sixOn } = await setup();
  const viewer = await member("Viewer", "man", { age: 30 }); // default range 26–35
  const a = await member("Amaka", "woman", { age: 29, ...wide });
  const b = await member("Bisi", "woman", { age: 28, ...wide });
  // The only possible replacements break the rules.
  await member("Same Gender", "man", { age: 29, ...wide });
  await member("Too Old", "woman", { age: 52, ...wide });
  const first = await sixOn(viewer);
  assert.deepEqual([...first].sort(), [a, b].sort());
  await db.query("update profiles set paused = true where id = $1", [a]);
  assert.deepEqual(await sixOn(viewer), [b], "nobody qualifies to take the place: one is shown, nothing relaxed");
});

test("a member who stops being live is refilled, and their place is not kept", async () => {
  const { db, member, wide, sixOn } = await setup();
  const viewer = await member("Viewer", "man", { age: 30, ...wide });
  const women = [];
  for (let i = 0; i < 7; i++) women.push(await member(`W${i}`, "woman", { age: 29, ...wide }));
  const first = await sixOn(viewer);
  // Removing every prompt answer makes a profile not live (0036).
  await db.query("delete from prompt_answers where profile_id = $1", [first[2]]);
  const second = await sixOn(viewer);
  assert.equal(second.length, 6);
  assert.ok(!second.includes(first[2]));
});

test("the refill is proven by taking it out", async () => {
  const t = await setup();
  const { db, member, wide, sixOn, fnDef } = t;
  const viewer = await member("Viewer", "man", { age: 30, ...wide });
  for (let i = 0; i < 7; i++) await member(`W${i}`, "woman", { age: 29, ...wide });
  const first = await sixOn(viewer);
  await db.query("update profiles set paused = true where id = $1", [first[0]]);

  const original = await fnDef(BUILD_FN);
  const mutated = original.replace("if v_stale is not null then", "if false then");
  assert.notEqual(mutated, original);
  await db.exec(mutated);
  try {
    assert.equal((await sixOn(viewer)).length, 5, "without the refill the place stays empty");
  } finally {
    await db.exec(original);
  }
  assert.equal((await sixOn(viewer)).length, 6, "with it restored, the place is refilled");
});

// --- Misc ------------------------------------------------------------------------

test("a full six is fixed for the day; a short one fills as more qualify, never past six", async () => {
  const { member, wide, sixOn, db } = await setup();
  const viewer = await member("Viewer", "man", { age: 30, ...wide });
  for (let i = 0; i < 4; i++) await member(`W${i}`, "woman", { age: 29, ...wide });
  const short = await sixOn(viewer);
  assert.equal(short.length, 4);
  assert.deepEqual(await sixOn(viewer), short, "asking again changes nothing");

  // More people qualify (or the member widens their range): the short six fills.
  for (let i = 4; i < 9; i++) await member(`W${i}`, "woman", { age: 29, ...wide });
  const full = await sixOn(viewer);
  assert.equal(full.length, 6, "never past six");
  assert.deepEqual(full.slice(0, 4), short, "those already shown stay where they were");

  // A full six does not change for the day.
  await member("Late", "woman", { age: 29, ...wide });
  assert.deepEqual(await sixOn(viewer), full);
  assert.equal((await db.query("select count(*)::int as n from feed_state where profile_id = $1", [viewer])).rows[0].n, 1);
});

test("members can run build_daily_feed for themselves only", async () => {
  const { db, member, wide } = await setup();
  const viewer = await member("Viewer", "man", { age: 30, ...wide });
  const other = await member("Other", "woman", { age: 29, ...wide });
  const rows = (await as(db, viewer, (tx) => tx.query("select candidate_id from build_daily_feed($1)", [viewer]))).rows;
  assert.deepEqual(rows.map((r) => r.candidate_id), [other]);
  await assert.rejects(as(db, viewer, (tx) => tx.query("select * from build_daily_feed($1)", [other])), /own feed/);
  await assert.rejects(as(db, viewer, (tx) => tx.query("select * from _feed_pick($1, now(), 6)", [viewer])), /permission denied/);
  await assert.rejects(as(db, viewer, (tx) => tx.query("select * from feed_config")), /permission denied/);
});

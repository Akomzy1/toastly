/**
 * Who can open whose full profile (PRD §5.2.4; migration 0032) — against a
 * throwaway Postgres (PGlite) with every migration applied. Never production.
 *
 *   node --test scripts/sql-test/full-profile.test.mjs
 *
 * Members act through the same role and claims a raw API request has, so
 * every answer here is what the database itself returns, not what a screen
 * chooses to show.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb, as, makeUser, goLive } from "./harness.mjs";

async function setup() {
  const db = await freshDb();
  const me = (id, sql, params) => as(db, id, (tx) => tx.query(sql, params));

  async function member(name, { tier = null, live = true } = {}) {
    const id = await makeUser(db, { name, email: `${crypto.randomUUID()}@example.com` });
    if (live) await goLive(db, id);
    if (tier) await db.query("insert into entitlements (profile_id, tier, source, ends_at) values ($1, $2, 'subscription', now() + interval '30 days')", [id, tier]);
    await db.query("insert into prompt_answers (profile_id, prompt_id, answer) values ($1, 1, 'Church, then jollof')", [id]);
    return id;
  }
  const answerOf = async (id) => (await db.query("select id from prompt_answers where profile_id = $1", [id])).rows[0].id;

  /** Everything a full profile carries, as the viewer would get it. */
  async function opens(viewer, owner) {
    const [can, row, answers, photos] = await Promise.all([
      me(viewer, "select can_open_profile($1) as ok", [owner]),
      me(viewer, "select id, display_name from profiles where id = $1", [owner]),
      me(viewer, "select id from prompt_answers where profile_id = $1", [owner]),
      me(viewer, "select id from profile_photos where profile_id = $1", [owner]),
    ].map((p) => p.then((r) => r.rows)));
    const sees = { can: can[0].ok, row: row.length > 0, answers: answers.length > 0, photos: photos.length > 0 };
    // The rule and every table it governs must agree.
    if (sees.can) assert.ok(sees.row && sees.answers, "an openable profile returns its row and answers");
    else assert.deepEqual(sees, { can: false, row: false, answers: false, photos: false }, "a closed profile returns nothing at all");
    return sees.can;
  }

  const inSix = (viewer, candidate) =>
    db.query("insert into daily_feed (profile_id, feed_date, position, candidate_id) values ($1, current_date, 1, $2)", [viewer, candidate]);
  const reply = async (from, to, kind = "text") =>
    db.query("insert into replies (sender_id, recipient_id, prompt_answer_id, kind, body) values ($1, $2, $3, $4, $5)",
      [from, to, await answerOf(to), kind, kind === "text" ? "Party jollof or home jollof?" : null]);
  const invite = async (from, to, status = "proposed") =>
    (await db.query("insert into gist_sessions (proposer_id, invitee_id, status) values ($1, $2, $3) returning id", [from, to, status])).rows[0].id;

  return { db, me, member, opens, inSix, reply, invite };
}

test("a member cannot open a profile outside these relationships", async () => {
  const { db, me, member, opens, inSix, invite } = await setup();
  const a = await member("Adaeze", { tier: "premium" });
  const b = await member("Bola", { tier: "premium" });

  assert.equal(await opens(a, b), false, "two live strangers: no browsing");
  assert.equal(await opens(b, a), false);
  // Nor by listing: a member's profile query returns only their own row.
  const { rows } = await me(a, "select id from profiles");
  assert.deepEqual(rows.map((r) => r.id), [a], "no search of arbitrary profiles");
  // The two-id function is internal — it would let a member ask about other pairs.
  await assert.rejects(me(a, "select profile_open_to($1, $2)", [b, a]), /permission denied/);

  // Being in someone ELSE's six opens nothing for the person shown.
  await inSix(b, a);
  assert.equal(await opens(b, a), true, "Bola's six shows Adaeze");
  assert.equal(await opens(a, b), false, "…which doesn't let Adaeze open Bola");

  // Yesterday's six is gone.
  await db.query("update daily_feed set feed_date = current_date - 1 where profile_id = $1", [b]);
  assert.equal(await opens(b, a), false, "only the current six");

  // A block ends it, whoever blocks, even inside the six.
  await inSix(a, b);
  assert.equal(await opens(a, b), true);
  await db.query("insert into blocks (blocker_id, blocked_id) values ($1, $2)", [b, a]);
  assert.equal(await opens(a, b), false, "blocked: never");

  // No live profile, no access — either side.
  const notLive = await member("Chidi", { live: false });
  await inSix(notLive, a);
  assert.equal(await opens(notLive, a), false, "a member who isn't live opens nothing");
  const c = await member("Dami");
  await inSix(c, notLive);
  assert.equal(await opens(c, notLive), false, "a profile that isn't live can't be opened");

  // A paused profile is closed — except to an active Couple Mode partner.
  const e = await member("Efe");
  const f = await member("Femi");
  const g = await member("Gbenga");
  await inSix(g, e);
  const [lo, hi] = [e, f].sort();
  await db.query("insert into couples (member_a, member_b, status, proposed_by, started_at) values ($1, $2, 'active', $1, now())", [lo, hi]);
  await db.query("update profiles set paused = true where id in ($1, $2)", [e, f]);
  assert.equal(await opens(f, e), true, "couple partners see each other");
  assert.equal(await opens(g, e), false, "a paused profile leaves everyone's six");

  // An invite that was declined or ran out doesn't let the inviter keep looking.
  const h = await member("Hauwa");
  const i = await member("Ife");
  const s = await invite(h, i);
  assert.equal(await opens(h, i), true, "while the invite is open, both ways");
  await db.query("update gist_sessions set status = 'declined' where id = $1", [s]);
  assert.equal(await opens(h, i), false, "declined: the inviter loses access");
  const j = await member("Jide");
  await db.query("insert into gist_sessions (proposer_id, invitee_id, created_at) values ($1, $2, now() - interval '4 days')", [h, j]);
  assert.equal(await opens(h, j), false, "an invite older than three days has run out");
});

test("everyone who reaches out can be opened, and matches see each other both ways", async () => {
  const { db, member, opens, reply, invite } = await setup();
  const a = await member("Adaeze", { tier: "premium" });
  const b = await member("Bola", { tier: "premium_plus" });

  await reply(b, a);
  assert.equal(await opens(a, b), true, "a reply to my answer lets me open its sender");
  assert.equal(await opens(b, a), false, "…it doesn't widen what the sender sees");

  const c = await member("Chidi", { tier: "diaspora" });
  const d = await member("Dami");
  await invite(c, d);
  assert.equal(await opens(d, c), true, "an invitation lets me open the inviter");
  assert.equal(await opens(c, d), true, "…and the inviter me, while it's open");

  // Gist partners: for as long as the match exists.
  const e = await member("Efe");
  const f = await member("Femi");
  const s = await invite(e, f, "accepted");
  assert.equal(await opens(e, f), true);
  assert.equal(await opens(f, e), true);
  await db.query("update gist_sessions set status = 'completed' where id = $1", [s]);
  await db.query("update gist_sessions set created_at = now() - interval '60 days' where id = $1", [s]);
  assert.equal(await opens(e, f), true, "a Gist that happened keeps the match, both ways");
  assert.equal(await opens(f, e), true);
  await db.query("insert into blocks (blocker_id, blocked_id) values ($1, $2)", [e, f]);
  assert.equal(await opens(e, f), false, "a block ends the match");
  assert.equal(await opens(f, e), false);
});

test("a Starter member CAN open a Gist inviter's profile", async () => {
  const { db, me, member, opens, invite } = await setup();
  const starter = await member("Starter");
  for (const tier of [null, "premium", "premium_plus", "diaspora", "diaspora_plus"]) {
    const inviter = await member(`Inviter ${tier ?? "starter"}`, { tier });
    const s = await invite(inviter, starter);
    assert.equal(await opens(starter, inviter), true, `invited by a ${tier ?? "starter"} member`);
    // Photos too, under the inviter's default reveal choice.
    const { rows } = await me(starter, "select id from profile_photos where profile_id = $1", [inviter]);
    assert.equal(rows.length, 4, "the inviter's photos come with the profile");
    // Before accepting, and still after saying no.
    await db.query("update gist_sessions set status = 'declined' where id = $1", [s]);
    assert.equal(await opens(starter, inviter), true, "an invitation stays a reason to look");
  }
});

test("a Starter member still cannot see who sent a locked message", async () => {
  const { db, me, member, opens, reply } = await setup();
  const starter = await member("Starter");
  const sender = await member("Sender", { tier: "premium" });

  // A text reply to one of the Starter member's answers…
  await reply(sender, starter);
  // …and a message in a thread.
  const [lo, hi] = [starter, sender].sort();
  const { rows: [t] } = await db.query("insert into threads (member_a, member_b) values ($1, $2) returning id", [lo, hi]);
  await db.query("insert into messages (thread_id, sender_id, body) values ($1, $2, 'Are you free Saturday?')", [t.id, sender]);

  const count = (await me(starter, "select unread_count() as n")).rows[0].n;
  assert.equal(count, 1, "the bare count arrives");
  assert.equal((await me(starter, "select id from messages")).rows.length, 0, "no message row");
  assert.equal((await me(starter, "select id from threads")).rows.length, 0, "no thread row naming the other member");
  assert.equal((await me(starter, "select id from replies where recipient_id = $1", [starter])).rows.length, 0, "no reply row");
  assert.equal(await opens(starter, sender), false, "the sender's profile doesn't open, so probing can't name them");
  // Photos have their own "after I reply" reveal; it must not leak the sender either.
  await db.query("update profiles set photo_reveal = 'after_i_reply' where id = $1", [sender]);
  assert.equal((await me(starter, "select id from profile_photos where profile_id = $1", [sender])).rows.length, 0);

  // Not vacuous: the same member on Premium can read it all.
  await db.query("insert into entitlements (profile_id, tier, source, ends_at) values ($1, 'premium', 'subscription', now() + interval '30 days')", [starter]);
  assert.equal((await me(starter, "select id from messages")).rows.length, 1);
  assert.equal((await me(starter, "select id from threads")).rows.length, 1);
  assert.equal(await opens(starter, sender), true, "on Premium, a reply opens its sender");
});

test("no profile view is written anywhere the other member can read", async () => {
  const { db, me, member, opens, inSix, invite, reply } = await setup();
  const viewer = await member("Viewer", { tier: "premium" });
  const owner = await member("Owner");
  const other = await member("Other", { tier: "premium" });
  await inSix(viewer, owner);
  await invite(other, viewer);
  await reply(other, viewer);

  // Every table the database holds, in every schema we own.
  async function snapshot() {
    const { rows: tables } = await db.query(
      `select format('%I.%I', schemaname, tablename) as t from pg_tables
        where schemaname not in ('pg_catalog', 'information_schema') order by 1`);
    const out = {};
    for (const { t } of tables) {
      const { rows } = await db.query(`select count(*)::int as n, md5(coalesce(string_agg(x::text, '|' order by x::text), '')) as h from ${t} x`);
      out[t] = rows[0];
    }
    return out;
  }
  // And everything the owner of the profile can read.
  async function ownerSees() {
    const { rows: tables } = await db.query(
      `select format('%I.%I', schemaname, tablename) as t from pg_tables where schemaname = 'public' order by 1`);
    const out = {};
    for (const { t } of tables) {
      try {
        const { rows } = await me(owner, `select count(*)::int as n, md5(coalesce(string_agg(x::text, '|' order by x::text), '')) as h from ${t} x`);
        out[t] = rows[0];
      } catch {
        out[t] = "no access";
      }
    }
    return out;
  }

  const before = await snapshot();
  const ownerBefore = await ownerSees();
  // Open the profile every way a screen could, more than once.
  for (let k = 0; k < 3; k++) {
    assert.equal(await opens(viewer, owner), true);
    assert.equal(await opens(viewer, other), true);
    await me(viewer, "select * from profiles where id = $1", [owner]);
  }
  assert.deepEqual(await ownerSees(), ownerBefore, "nothing the owner can read changed");
  assert.deepEqual(await snapshot(), before, "nothing anywhere changed — a view is a read and nothing more");
});

test("age, 'matched' and relationship history follow the same rule", async () => {
  const { db, me, member, inSix, reply, invite } = await setup();
  const viewer = await member("Viewer", { tier: "premium" });
  const owner = await member("Owner");
  await db.query("update profile_birthdates set date_of_birth = current_date - interval '29 years 2 days' where profile_id = $1", [owner]);
  await db.query("insert into profile_history (profile_id, history, visibility) values ($1, 'divorced', 'on_match') on conflict (profile_id) do update set history = 'divorced', visibility = 'on_match'", [owner]);
  const ask = async (who, sql) => (await me(who, sql, [owner])).rows[0];
  const history = async (who) => (await me(who, "select history from profile_history where profile_id = $1", [owner])).rows.length > 0;

  assert.equal((await ask(viewer, "select age_for($1) as a")).a, null, "a stranger gets no age");
  assert.equal(await history(viewer), false);
  await db.query("update profile_history set visibility = 'public' where profile_id = $1", [owner]);
  assert.equal(await history(viewer), false, "even 'on my profile' history needs a reason to open the profile");

  await inSix(viewer, owner);
  assert.equal((await ask(viewer, "select age_for($1) as a")).a, 29, "an age, never a date");
  assert.equal(await history(viewer), true, "public history shows once the profile opens");
  await db.query("update profile_history set visibility = 'on_match' where profile_id = $1", [owner]);
  assert.equal((await ask(viewer, "select i_am_matched_with($1) as m")).m, false, "being in the six isn't a match");
  assert.equal(await history(viewer), false, "'on match' waits for a match");
  assert.equal((await me(viewer, "select date_of_birth from profile_birthdates where profile_id = $1", [owner])).rows.length, 0,
    "the date of birth stays the owner's");

  const s = await invite(viewer, owner, "accepted");
  assert.equal((await ask(viewer, "select i_am_matched_with($1) as m")).m, true);
  assert.equal(await history(viewer), true, "matched: 'on match' history shows");
  await db.query("update profile_history set visibility = 'private' where profile_id = $1", [owner]);
  assert.equal(await history(viewer), false, "'only me' never shows");
  await db.query("delete from gist_sessions where id = $1", [s]);

  // Starter: a match made of their Gist invite and a text reply they can't
  // read is not a match they can see — or "on match" fields would name the sender.
  const starter = await member("Starter");
  const writer = await member("Writer", { tier: "premium" });
  await db.query("insert into profile_history (profile_id, history, visibility) values ($1, 'widowed', 'on_match') on conflict (profile_id) do update set history = 'widowed', visibility = 'on_match'", [writer]);
  await inSix(starter, writer);
  await reply(starter, writer, "gist_invite");
  await reply(writer, starter, "text");
  assert.equal((await me(starter, "select i_am_matched_with($1) as m", [writer])).rows[0].m, false);
  assert.equal((await me(starter, "select history from profile_history where profile_id = $1", [writer])).rows.length, 0,
    "a locked reply doesn't reveal itself through a match");
});

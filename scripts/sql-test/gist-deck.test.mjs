/**
 * The Gist question deck: six cards in a fixed arc (migration 0039; PRD
 * §5.4) — against a throwaway Postgres (PGlite) with every migration applied.
 * Never production.
 *
 *   node --test scripts/sql-test/gist-deck.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb, as, makeUser, goLive } from "./harness.mjs";

async function setup() {
  const db = await freshDb();
  const me = (id, sql, params) => as(db, id, (tx) => tx.query(sql, params));
  async function member(name, gender) {
    const id = await makeUser(db, { name, email: `${crypto.randomUUID()}@example.com`, gender });
    await goLive(db, id);
    // Paid, so a test can start as many Gists as it needs.
    await db.query("insert into entitlements (profile_id, tier, source, ends_at) values ($1, 'premium', 'subscription', now() + interval '30 days')", [id]);
    return id;
  }
  /** A Gist from a man to a woman, through the real functions, connected. */
  async function liveGist(man, woman) {
    await db.query(`insert into daily_feed (profile_id, feed_date, position, candidate_id)
      select $1, current_date, coalesce(max(position), 0) + 1, $2 from daily_feed where profile_id = $1 and feed_date = current_date
      on conflict do nothing`, [man, woman]);
    const answer = (await db.query("select id from prompt_answers where profile_id = $1 limit 1", [woman])).rows[0].id;
    const s = (await me(man, "select gist_invite($1) as id", [answer])).rows[0].id;
    await me(woman, "select gist_respond($1, true)", [s]);
    await db.query("update gist_sessions set proposer_ready_at = now(), invitee_ready_at = now() where id = $1", [s]);
    await me(man, "select gist_join($1)", [s]);
    await me(woman, "select gist_join($1)", [s]);
    return s;
  }
  const deck = async (who, s) => (await me(who, "select * from gist_deck($1)", [s])).rows;
  const index = async (s) => (await db.query("select deck_index from gist_sessions where id = $1", [s])).rows[0].deck_index;
  const advance = (who, s, expected) => me(who, "select gist_deck_advance($1, $2::smallint, false) as i", [s, expected]).then((r) => r.rows[0].i);
  /** Ends the current Gist, so the pair can start another. */
  const finish = (s) => db.query("update gist_sessions set status = 'completed', ends_at = now() - interval '1 minute' where id = $1", [s]);
  return { db, me, member, liveGist, deck, index, advance, finish };
}

test("a Gist gets six cards, one per slot, in the arc's order", async () => {
  const { db, member, liveGist, deck } = await setup();
  const man = await member("Adebayo Man", "man");
  const woman = await member("Bisi Woman", "woman");
  const s = await liveGist(man, woman);
  const cards = await deck(man, s);
  assert.equal(cards.length, 6);
  assert.deepEqual(cards.map((c) => c.deck_position), [1, 2, 3, 4, 5, 6]);
  const slots = (await db.query("select q.slot from gist_session_cards c join gist_questions q on q.id = c.question_id where c.session_id = $1 order by c.position", [s])).rows.map((r) => r.slot);
  assert.deepEqual(slots, [1, 2, 3, 4, 5, 6], "1 opener, 2 everyday, 3 family, 4 money, 5 future, 6 looking for");
  assert.deepEqual(await deck(woman, s), cards, "the same deck on both screens");
  // The owner's approved bank (9 October 2026), one per slot, in this order.
  assert.deepEqual(cards.map((c) => c.question), APPROVED);
});

const APPROVED = [
  "What did you eat today, and was it a good decision?",
  "What is something you have changed your mind about recently?",
  "Who in your family would you introduce someone to first?",
  "What are you working towards right now, money-wise or otherwise?",
  "What would you want to be true about your life in five years?",
  "What made you decide you are ready for something serious?",
];

test("only active questions are dealt: the approved six, never a switched-off one", async () => {
  const { db, member, liveGist, deck, finish } = await setup();
  const man = await member("Nnamdi Man", "man");
  const woman = await member("Ola Woman", "woman");
  assert.deepEqual(
    (await db.query("select text from gist_questions where active order by slot")).rows.map((r) => r.text),
    APPROVED,
  );
  const inactive = (await db.query("select text from gist_questions where not active")).rows.map((r) => r.text);
  assert.ok(inactive.length >= 5, "the old questions stay, switched off");
  for (let i = 0; i < 3; i++) {
    const s = await liveGist(man, woman);
    const texts = (await deck(man, s)).map((c) => c.question);
    assert.deepEqual(texts, APPROVED, `Gist ${i + 1}: the same approved six`);
    assert.ok(texts.every((t) => !inactive.includes(t)));
    await finish(s);
  }
});

test("the deck never exceeds the configured count — and the end card follows the last question", async () => {
  const { db, member, liveGist, deck, index, advance, finish } = await setup();
  const man = await member("Chidi Man", "man");
  const woman = await member("Dupe Woman", "woman");
  const s = await liveGist(man, woman);
  for (let i = 0; i < 10; i++) await advance(i % 2 ? woman : man, s, await index(s));
  assert.equal(await index(s), 6, "six cards, then it stops");
  assert.equal(await advance(man, s, 6), 6, "past the last card: the end card, nothing more");
  assert.equal((await db.query("select count(*)::int as n from gist_deck_steps where session_id = $1", [s])).rows[0].n, 6);
  assert.equal((await deck(man, s)).length, 6);

  // The count is one config value: a smaller deck for the next Gist.
  await finish(s);
  await db.query("update gist_config set deck_size = 4");
  const s2 = await liveGist(man, woman);
  assert.equal((await deck(man, s2)).length, 4);
  for (let i = 0; i < 8; i++) await advance(man, s2, await index(s2));
  assert.equal(await index(s2), 4);
});

test("advancing is synchronised: either person moves it, and two taps at once move it once", async () => {
  const { member, liveGist, deck, index, advance } = await setup();
  const man = await member("Emeka Man", "man");
  const woman = await member("Funke Woman", "woman");
  const s = await liveGist(man, woman);
  // Both tap on card 1 at once.
  const [a, b] = await Promise.all([advance(man, s, 0), advance(woman, s, 0)]);
  assert.equal(await index(s), 1, "moved once, not twice");
  assert.ok([a, b].every((x) => x === 1));
  // Either person can move it on; both read the same position and card.
  await advance(woman, s, 1);
  await advance(man, s, 2);
  assert.equal(await index(s), 3);
  assert.deepEqual(await deck(man, s), await deck(woman, s));
  // A tap from a stale screen (still on card 1) doesn't skip ahead.
  assert.equal(await advance(man, s, 0), 3);
  assert.equal(await index(s), 3);
});

test("the extension adds time, not cards", async () => {
  const { db, me, member, liveGist, deck } = await setup();
  const man = await member("Gbenga Man", "man");
  const woman = await member("Halima Woman", "woman");
  const s = await liveGist(man, woman);
  const before = (await db.query("select ends_at from gist_sessions where id = $1", [s])).rows[0].ends_at;
  // Either person can extend, once (0020).
  await me(man, "select gist_extend($1)", [s]);
  const after = (await db.query("select ends_at from gist_sessions where id = $1", [s])).rows[0].ends_at;
  assert.ok(after > before, "more time");
  assert.equal((await deck(man, s)).length, 6, "the same six cards");
});

test("a pair's next Gist avoids the cards they've already had, where the bank allows", async () => {
  const { db, member, liveGist, deck, finish } = await setup();
  const man = await member("Ifeanyi Man", "man");
  const woman = await member("Jumoke Woman", "woman");
  // The approved bank has one per slot; give every slot a second active card
  // so there is something to avoid repeating.
  for (let slot = 1; slot <= 6; slot++) {
    await db.query("insert into gist_questions (text, depth, sort_order, slot, active) values ($1, 1, $2, $3, true)",
      [`A second test card for slot ${slot}, about everyday things?`, 900 + slot, slot]);
  }
  const first = await deck(man, await liveGist(man, woman).then(async (s) => { await finish(s); return s; }));
  const s2 = await liveGist(man, woman);
  const second = await deck(man, s2);
  for (let i = 0; i < 6; i++) {
    assert.notEqual(second[i].question_id, first[i].question_id, `slot ${i + 1} repeats though its bank has two`);
  }
});

test("no card may ask about religion, tribe or genotype; every card has a slot; members can't touch the deck", async () => {
  const { db, me, member, liveGist } = await setup();
  for (const text of ["Which church do you attend on Sundays?", "What is your tribe, and does it matter?", "Do you know your genotype yet?", "How often do you pray?"]) {
    await assert.rejects(db.query("insert into gist_questions (text, depth, sort_order, slot) values ($1, 1, 999, 1)", [text]), /no_protected_topics/, text);
  }
  assert.equal((await db.query("select count(*)::int as n from gist_questions where slot is null")).rows[0].n, 0);
  for (let slot = 1; slot <= 6; slot++) {
    assert.ok((await db.query("select count(*)::int as n from gist_questions where slot = $1 and active", [slot])).rows[0].n >= 1, `slot ${slot} has an active card`);
  }
  const man = await member("Kola Man", "man");
  const woman = await member("Lola Woman", "woman");
  const s = await liveGist(man, woman);
  await assert.rejects(me(man, "insert into gist_session_cards (session_id, position, question_id) values ($1, 6, 1)", [s]));
  await assert.rejects(me(man, "update gist_config set deck_size = 6"));
  const stranger = await member("Musa Man", "man");
  await assert.rejects(me(stranger, "select * from gist_deck($1)", [s]), /doesn't exist/);
});

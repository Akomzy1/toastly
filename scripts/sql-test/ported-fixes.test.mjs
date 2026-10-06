/**
 * Fixes ported from live-profile-and-prompt-14 and the AriyaPlanner brief
 * rule (migration 0028) — against a throwaway Postgres (PGlite) with every
 * migration applied. Never production.
 *
 *   node --test scripts/sql-test/ported-fixes.test.mjs
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { freshDb, as, asService, makeUser } from "./harness.mjs";

let db;
before(async () => {
  db = await freshDb();
});

async function member(name, { paid = false } = {}) {
  const id = await makeUser(db, { name, email: `${crypto.randomUUID()}@example.com` });
  await db.query("update profiles set stage = 'verified_real' where id = $1", [id]);
  if (paid) await db.query("insert into entitlements (profile_id, tier, source, ends_at) values ($1, 'premium', 'subscription', now() + interval '30 days')", [id]);
  return id;
}
const me = (id, sql, params) => as(db, id, (tx) => tx.query(sql, params));
const svc = (sql, params) => asService(db, (tx) => tx.query(sql, params));
const hash = () => crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");

test("a member can build only their own six", async () => {
  const a = await member("Feed A");
  const b = await member("Feed B");
  await assert.rejects(me(a, "select * from build_daily_feed($1)", [b]), /only build their own feed/);
  await me(a, "select * from build_daily_feed($1)", [a]);
});

test("'did both say continue?' is true for the two of them, and only a yes or no", async () => {
  const a = await member("Gist A");
  const b = await member("Gist B");
  const outsider = await member("Gist Outsider");
  const { rows: [g] } = await db.query("insert into gist_sessions (proposer_id, invitee_id) values ($1, $2) returning id", [a, b]);
  await db.query("insert into gist_outcomes (session_id, profile_id, wants_to_continue) values ($1, $2, true)", [g.id, a]);
  const ask = async (who) => (await me(who, "select gist_mutual_continue($1) as m", [g.id])).rows[0].m;
  assert.equal(await ask(a), false, "only one has answered");
  await db.query("insert into gist_outcomes (session_id, profile_id, wants_to_continue) values ($1, $2, true)", [g.id, b]);
  assert.equal(await ask(a), true, "both said yes — true when asked as a member (always false before 0028)");
  assert.equal(await ask(b), true);
  assert.equal(await ask(outsider), false, "nobody outside the Gist learns anything");
  assert.equal((await me(a, "select count(*)::int as n from gist_outcomes where session_id = $1", [g.id])).rows[0].n, 1,
    "a member still reads only their own answer");
});

test("one number, one account: bound by the server, checked by a yes/no", async () => {
  const a = await member("Phone A");
  const b = await member("Phone B");
  const h = hash();
  await assert.rejects(me(a, "select record_phone_verified($1, $2)", [a, h]), "a member can't bind a number");
  await assert.rejects(me(a, "insert into phone_identities (phone_hash, profile_id) values ($1, $2)", [h, a]));
  assert.equal((await svc("select record_phone_verified($1, $2) as r", [a, h])).rows[0].r, "ok");
  assert.equal((await me(b, "select phone_in_use($1) as u", [h])).rows[0].u, true, "taken, for anyone else");
  assert.equal((await me(a, "select phone_in_use($1) as u", [h])).rows[0].u, false, "not 'taken' for its owner");
  assert.equal((await svc("select record_phone_verified($1, $2) as r", [b, h])).rows[0].r, "in_use", "never moved to another account");
  const blocked = hash();
  await db.query("insert into blocked_phone_hashes (phone_hash, former_profile_id, retain_until) values ($1, $2, now() + interval '2 years')", [blocked, crypto.randomUUID()]);
  assert.equal((await svc("select record_phone_verified($1, $2) as r", [b, blocked])).rows[0].r, "blocked");
  const second = hash();
  await svc("select record_phone_verified($1, $2)", [a, second]);
  assert.deepEqual((await db.query("select phone_hash from phone_identities where profile_id = $1", [a])).rows.map((r) => r.phone_hash), [second],
    "a new number replaces the old one on the same account");
});

test("replies: paid members send text, Starter sends a Gist invite, nobody sends as someone else", async () => {
  const paid = await member("Replier Paid", { paid: true });
  const starter = await member("Replier Starter");
  const them = await member("Answer Writer");
  const { rows: [ans] } = await db.query("insert into prompt_answers (profile_id, prompt_id, answer) values ($1, 1, 'Jollof, obviously') returning id", [them]);
  // Members read only the answers of today's six, so they can only reply to those.
  for (const [i, who] of [paid, starter].entries()) {
    await db.query("insert into daily_feed (profile_id, feed_date, position, candidate_id) values ($1, current_date, $2, $3)", [who, i + 1, them]);
  }
  await me(paid, "insert into replies (sender_id, recipient_id, prompt_answer_id, kind, body) values ($1, $2, $3, 'text', 'Party jollof or home jollof?')", [paid, them, ans.id]);
  await assert.rejects(me(starter, "insert into replies (sender_id, recipient_id, prompt_answer_id, kind, body) values ($1, $2, $3, 'text', 'hi')", [starter, them, ans.id]),
    "Starter can't send free text");
  await me(starter, "insert into replies (sender_id, recipient_id, prompt_answer_id, kind, body) values ($1, $2, $3, 'gist_invite', null)", [starter, them, ans.id]);
  await assert.rejects(me(paid, "insert into replies (sender_id, recipient_id, prompt_answer_id, kind, body) values ($1, $2, $3, 'text', 'hi')", [starter, them, ans.id]),
    "can't send as someone else");
  const other = await member("Not The Writer");
  await assert.rejects(me(paid, "insert into replies (sender_id, recipient_id, prompt_answer_id, kind, body) values ($1, $2, $3, 'text', 'hi')", [paid, other, ans.id]),
    "the answer must be the recipient's");
});

test("the AriyaPlanner brief holds the couple's own entries", async () => {
  const a = await member("Brief A");
  const b = await member("Brief B");
  const [lo, hi] = [a, b].sort();
  const { rows: [c] } = await db.query("insert into couples (member_a, member_b, proposed_by, status) values ($1, $2, $1, 'active') returning id", [lo, hi]);
  await me(a, "insert into couple_briefs (couple_id, wedding_city, rough_date, guest_count_band, budget_band, ceremony_formats) values ($1, 'Ibadan', 'December 2027', '200-300', 'mid', array['introduction','traditional'])", [c.id]);
  await assert.rejects(me(a, "update couple_briefs set ceremony_formats = array['court'] where couple_id = $1", [c.id]),
    "only the three ceremony formats");
  const outsider = await member("Brief Outsider");
  assert.equal((await me(outsider, "select count(*)::int as n from couple_briefs where couple_id = $1", [c.id])).rows[0].n, 0);
  assert.equal((await me(b, "select wedding_city from couple_briefs where couple_id = $1", [c.id])).rows[0].wedding_city, "Ibadan");
});

/**
 * Diaspora matching under PRD §5.6, USD coin packs, and the review console's
 * case model (migration 0026) — against a throwaway Postgres (PGlite) with
 * every migration applied. Never production.
 *
 *   node --test scripts/sql-test/diaspora-console.test.mjs
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { freshDb, as, asService, makeUser, goLive } from "./harness.mjs";

let db;
let staff;
let city;
before(async () => {
  db = await freshDb();
  staff = await member("Adaeze Okafor");
  await db.query("insert into staff_members (profile_id) values ($1)", [staff]);
  city = (await db.query("select slug from diaspora_cities limit 1")).rows[0].slug;
  await db.query("update diaspora_cities set active = true where slug = $1", [city]);
});

async function member(name, { country = "NG", pool = "back_home", diasporaPlan = false, gender = "prefer_not_to_say" } = {}) {
  const id = await makeUser(db, { name, email: `${crypto.randomUUID()}@example.com`, gender });
  await db.query("update profiles set country_code = $2, stage = 'verified_real', pool = $3, diaspora_city = $4 where id = $1",
    [id, country, pool, country === "NG" ? null : city]);
  await goLive(db, id);
  if (diasporaPlan) await db.query("insert into entitlements (profile_id, tier, source, ends_at) values ($1, 'diaspora', 'subscription', now() + interval '30 days')", [id]);
  return id;
}
const feed = async (id) => (await as(db, id, (tx) => tx.query("select candidate_id from build_daily_feed($1)", [id]))).rows.map((r) => r.candidate_id);
const svc = (sql, params) => asService(db, (tx) => tx.query(sql, params));
const asStaff = (sql, params) => as(db, staff, (tx) => tx.query(sql, params));
const reset = () => db.exec("delete from daily_feed; delete from seen_candidates;");

// --- PRD §5.6 ------------------------------------------------------------------

test("one Nigeria pool: members abroad who chose back home appear to members in Nigeria, both ways", async () => {
  await reset();
  // A woman in Lagos; the members abroad are men (0036: a man and a woman only).
  const lagos = await member("Lagos Member", { gender: "woman" });
  const homeAbroad = await member("Abroad Back Home", { country: "GB", pool: "back_home" });
  const bothAbroad = await member("Abroad Both", { country: "GB", pool: "both", diasporaPlan: true });
  const onlyDiaspora = await member("Abroad Diaspora Only", { country: "GB", pool: "diaspora", diasporaPlan: true });
  const six = await feed(lagos);
  assert.ok(six.includes(homeAbroad), "free member abroad who chose back home — never paywalled");
  assert.ok(six.includes(bothAbroad), "chose both");
  assert.ok(!six.includes(onlyDiaspora), "chose only their diaspora community");
  assert.ok((await feed(homeAbroad)).includes(lagos), "and the member abroad sees Nigeria");
});

test("'Open to people living abroad' off works both ways (decided 5 October 2026)", async () => {
  await reset();
  // A woman and a man (0036), so only the setting keeps them apart.
  const closed = await member("Local Only", { gender: "woman" });
  await as(db, closed, (tx) => tx.query("update profiles set open_to_abroad = false where id = $1", [closed]));
  const abroad = await member("Abroad Looking Home", { country: "US", pool: "back_home" });
  assert.ok(!(await feed(closed)).includes(abroad), "not in their six");
  assert.ok(!(await feed(abroad)).includes(closed), "and members abroad don't see them");
});

test("diaspora-to-diaspora needs a Diaspora plan on both sides and the choice on both sides", async () => {
  await reset();
  // Paid A is a woman; the others are men (0036: a man and a woman only).
  const paidA = await member("Paid A", { country: "GB", pool: "diaspora", diasporaPlan: true, gender: "woman" });
  const paidB = await member("Paid B", { country: "GB", pool: "both", diasporaPlan: true });
  const free = await member("Free Abroad", { country: "GB", pool: "diaspora" });
  const paidHomeOnly = await member("Paid Home Only", { country: "GB", pool: "back_home", diasporaPlan: true });
  const six = await feed(paidA);
  assert.ok(six.includes(paidB));
  assert.ok(!six.includes(free), "a free member abroad isn't in the diaspora pool");
  assert.ok(!six.includes(paidHomeOnly), "chose back home only");
  const freeSix = await feed(free);
  assert.ok(!freeSix.includes(paidA) && !freeSix.includes(paidB), "free members abroad get the Nigeria pool only");
});

test("saving a diaspora pool needs a Diaspora plan; back home is open to everyone", async () => {
  const free = await member("Free Saver", { country: "GB" });
  await assert.rejects(as(db, free, (tx) => tx.query("select set_match_pool('diaspora')")), /Diaspora plan/);
  await as(db, free, (tx) => tx.query("select set_match_pool('back_home')"));
  const paid = await member("Paid Saver", { country: "GB", diasporaPlan: true });
  await as(db, paid, (tx) => tx.query("select set_match_pool('both')"));
  assert.equal((await db.query("select pool from profiles where id = $1", [paid])).rows[0].pool, "both");
});

test("a woman who signs up with a country abroad gets Diaspora Plus when she goes live", async () => {
  const id = crypto.randomUUID();
  await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)",
    [id, `${id}@example.com`, JSON.stringify({ display_name: "Abroad Woman", gender: "woman", country_code: "gb" })]);
  assert.equal((await db.query("select country_code from profiles where id = $1", [id])).rows[0].country_code, "GB");
  // The offer starts at go-live, not at sign-up (0035).
  assert.equal((await db.query("select current_tier($1) as t", [id])).rows[0].t, "starter");
  await goLive(db, id);
  assert.equal((await db.query("select current_tier($1) as t", [id])).rows[0].t, "diaspora_plus");
});

// --- USD coin packs -----------------------------------------------------------

test("members abroad buy coins in dollars; a naira pack bought from abroad raises a review, never a block", async () => {
  const packs = await db.query("select sku, amount_minor, coins from price_list where currency = 'USD' and kind = 'coin_pack' and active order by coins");
  assert.deepEqual(packs.rows, [
    { sku: "us-5", amount_minor: 100, coins: 5 },
    { sku: "us-10", amount_minor: 200, coins: 10 },
    { sku: "us-25", amount_minor: 500, coins: 25 },
    { sku: "us-50", amount_minor: 1000, coins: 50 },
  ]);
  const abroad = await member("Naira Pack Abroad", { country: "GB" });
  const o = await svc("select payment_open($1, 'ng-10', 'pack', $2, null, null) as o", [abroad, `tly_${crypto.randomUUID()}`]);
  assert.equal(o.rows[0].o.amount_minor, 100000, "the purchase still opens");
  const rev = await svc("select signal, detail->>'route' as route from integrity_reviews where profile_id = $1", [abroad]);
  assert.deepEqual(rev.rows, [{ signal: "profile_country_mismatch", route: "coin_pack" }]);
});

// --- The console's case model ---------------------------------------------------

test("cases have numbers, plain reasons, and show members by number — never by name", async () => {
  const a = await member("Kemi Reporter");
  const b = await member("Tunde Reported");
  await as(db, a, (tx) => tx.query("insert into reports (reporter_id, reported_id, reason) values ($1, $2, 'asked_for_money')", [a, b]));
  const { rows: [q] } = await asStaff("select id, case_no, kind, reason, stage from staff_queue() where kind = 'report' order by created_at desc limit 1");
  assert.ok(q.case_no >= 20001);
  assert.equal(q.reason, "Reported as “Asking for money”.");
  assert.equal(q.stage, "new");
  const item = (await asStaff("select staff_item($1) as i", [q.id])).rows[0].i;
  const json = JSON.stringify(item);
  assert.ok(!json.includes("Kemi") && !json.includes("Tunde"), "no member names in a case");
  assert.deepEqual(item.members.map((m) => m.role), ["Reported member", "Reporter"]);
  assert.ok(item.members.every((m) => m.member_no >= 40001));
  assert.equal(item.events[0].what, "Raised");
  assert.equal(item.events[0].who, "System");
});

test("every decision needs a written reason; assigning and deciding are on the case's timeline", async () => {
  const a = await member("Timeline Reporter");
  const b = await member("Timeline Subject");
  await as(db, a, (tx) => tx.query("insert into reports (reporter_id, reported_id, reason) values ($1, $2, 'harassment')", [a, b]));
  const id = (await db.query("select id from review_items where subject_id = $1", [b])).rows[0].id;
  await assert.rejects(asStaff("select staff_decide($1, 'clear', 'ok')", [id]), /reason/);
  await asStaff("select staff_assign($1)", [id]);
  assert.equal((await asStaff("select staff_item($1) as i", [id])).rows[0].i.stage, "in_review");
  await asStaff("select staff_decide($1, 'clear', 'One report, nothing else on the account.')", [id]);
  const ev = (await asStaff("select staff_item($1) as i", [id])).rows[0].i.events;
  assert.deepEqual(ev.map((e) => [e.who, e.what]), [["System", "Raised"], ["Adaeze O.", "Assigned"], ["Adaeze O.", "Clear"]]);
  assert.equal(ev[2].why, "One report, nothing else on the account.");
  assert.equal(ev[2].role, "Reviewer");
  await assert.rejects(db.query("update case_events set why = 'edited' where review_item_id = $1", [id]), /append-only/);
  await assert.rejects(db.query("delete from case_events where review_item_id = $1", [id]), /append-only/);
});

test("waiting on the member: a passing selfie brings the case back; moving to a Diaspora plan closes it", async () => {
  const a = await member("RV Reporter 2");
  const b = await member("RV Subject 2");
  await as(db, a, (tx) => tx.query("insert into reports (reporter_id, reported_id, reason) values ($1, $2, 'fake_profile')", [a, b]));
  const id = (await db.query("select id from review_items where subject_id = $1", [b])).rows[0].id;
  await asStaff("select staff_decide($1, 'request_reverification', 'Confirm the account holder first.')", [id]);
  assert.equal((await asStaff("select staff_item($1) as i", [id])).rows[0].i.stage, "waiting_member");
  const { rows: [s] } = await db.query("insert into verification_sessions (profile_id, product, environment, status) values ($1, 'smartselfie', 'sandbox', 'submitted') returning id", [b]);
  await db.query("update verification_sessions set status = 'clear', passed = true where id = $1", [s.id]);
  const back = (await asStaff("select staff_item($1) as i", [id])).rows[0].i;
  assert.equal(back.stage, "in_review", "back to the reviewer who asked");
  assert.equal(back.events.at(-1).what, "Member responded");

  const abroad = await member("Switch Subject", { country: "GB" });
  await svc("select payment_open($1, 'premium', 'pass', $2, null, null)", [abroad, `tly_${crypto.randomUUID()}`]);
  const pid = (await db.query("select id from review_items where subject_id = $1 and kind = 'pricing'", [abroad])).rows[0].id;
  await asStaff("select staff_decide($1, 'ask_switch_plan', 'Profile and payments point to the UK.')", [pid]);
  await db.query("insert into entitlements (profile_id, tier, source, ends_at) values ($1, 'diaspora', 'subscription', now() + interval '30 days')", [abroad]);
  const closed = (await asStaff("select staff_item($1) as i", [pid])).rows[0].i;
  assert.equal(closed.stage, "decided");
  assert.deepEqual(closed.events.slice(-2).map((e) => e.what), ["Member responded", "Closed"]);
});

test("decision history finds cases by case or member number, and a removed member's case survives", async () => {
  const a = await member("History Reporter");
  const b = await member("History Married");
  await as(db, a, (tx) => tx.query("insert into reports (reporter_id, reported_id, reason) values ($1, $2, 'user_is_married')", [a, b]));
  const { rows: [c] } = await db.query("select id, case_no, subject_member_no from review_items where subject_id = $1", [b]);
  await asStaff("select staff_decide($1, 'remove', 'Confirmed married by two unconnected matches.')", [c.id]);
  const byCase = await asStaff("select id from staff_history($1)", [`TC-${c.case_no}`]);
  assert.deepEqual(byCase.rows.map((r) => r.id), [c.id]);
  const byMember = await asStaff("select id from staff_history($1)", [`M-${c.subject_member_no}`]);
  assert.ok(byMember.rows.some((r) => r.id === c.id));
  const after = (await asStaff("select staff_item($1) as i", [c.id])).rows[0].i;
  assert.equal(after.stage, "decided");
  assert.equal(after.members[0].removed, true);
  assert.equal(after.members[0].member_no, c.subject_member_no, "still shown by number");
  assert.equal(after.events.at(-1).what, "Remove");
  assert.deepEqual(after.actions, []);
});

test("members can't reach any console function, the timeline, or renumber themselves", async () => {
  const m = await member("Console Curious");
  for (const sql of ["select staff_me()", "select * from staff_history()", "select staff_assign(gen_random_uuid())", "select * from case_events"]) {
    await assert.rejects(as(db, m, (tx) => tx.query(sql)), `member could run: ${sql}`);
  }
  await assert.rejects(as(db, m, (tx) => tx.query("update profiles set member_no = 1 where id = $1", [m])), /set by Toastly/);
  assert.deepEqual((await asStaff("select staff_me() as s")).rows[0].s, { name: "Adaeze O.", role: "Reviewer" });
});

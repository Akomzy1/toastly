/**
 * The staff review queue, restrictions, and the track rules (migration
 * 0025) — tested against a throwaway Postgres (PGlite) with every migration
 * applied. Never production.
 *
 *   node --test scripts/sql-test/review-queue.test.mjs
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { freshDb, as, asService, makeUser, goLive } from "./harness.mjs";

let db;
let staff;
before(async () => {
  db = await freshDb();
  staff = await member("Staff Person");
  await db.query("insert into staff_members (profile_id) values ($1)", [staff]);
});

async function member(name = "Member Test", { country = "NG", gender = "prefer_not_to_say", verified = true } = {}) {
  const id = await makeUser(db, { name, email: `${crypto.randomUUID()}@example.com`, gender });
  await db.query("update profiles set country_code = $2, stage = $3 where id = $1", [id, country, verified ? "verified_real" : "unverified"]);
  if (verified) await goLive(db, id);
  return id;
}
const svc = (sql, params) => asService(db, (tx) => tx.query(sql, params));
const asStaff = (sql, params) => as(db, staff, (tx) => tx.query(sql, params));
const items = async (subject) => (await db.query("select kind, status, decision from review_items where subject_id = $1 order by created_at", [subject])).rows;
const tierOf = async (id) => (await db.query("select current_tier($1) as t", [id])).rows[0].t;
const report = (reporter, reported, reason = "harassment") =>
  as(db, reporter, (tx) => tx.query("insert into reports (reporter_id, reported_id, reason, detail) values ($1, $2, $3, 'note to Toastly')", [reporter, reported, reason]));
/** A thread between two members (stored in canonical order), with both able to send. */
async function thread(x, y) {
  await db.query("insert into entitlements (profile_id, tier, source) values ($1, 'premium', 'manual_grant'), ($2, 'premium', 'manual_grant')", [x, y]);
  const [a, b] = [x, y].sort();
  return (await db.query("insert into threads (member_a, member_b) values ($1, $2) returning id", [a, b])).rows[0].id;
}
const itemFor = async (subject, kind) => (await db.query("select id from review_items where subject_id = $1 and kind = $2 order by created_at desc limit 1", [subject, kind])).rows[0].id;

// --- 1. Naira plans from a profile abroad ------------------------------------

test("a Naira plan bought from a profile abroad raises a review — card, bank, part-coins or coins — and nothing is blocked", async () => {
  const abroad = await member("Abroad Buyer", { country: "GB" });
  const o = await svc("select payment_open($1, 'premium', 'pass', $2, null, null) as o", [abroad, `tly_${crypto.randomUUID()}`]);
  assert.ok(o.rows[0].o.amount_minor, "the checkout still opens");
  let rev = await svc("select signal, detail->>'route' as route from integrity_reviews where profile_id = $1", [abroad]);
  assert.deepEqual(rev.rows, [{ signal: "profile_country_mismatch", route: "plan_pass" }]);
  assert.deepEqual((await items(abroad)).map((x) => x.kind), ["pricing"], "and it lands in the queue");

  // Coins: a second member abroad pays Premium entirely with coins.
  const coinPayer = await member("Coin Payer", { country: "US" });
  await db.query("insert into coin_ledger (profile_id, delta, kind, bucket) values ($1, 35, 'purchase', 'purchased')", [coinPayer]);
  const paid = await as(db, coinPayer, (tx) => tx.query("select subscribe_with_coins('premium') as r"));
  assert.equal(paid.rows[0].r.paid, true, "the plan is granted");
  rev = await svc("select signal, detail->>'route' as route from integrity_reviews where profile_id = $1", [coinPayer]);
  assert.deepEqual(rev.rows, [{ signal: "profile_country_mismatch", route: "coins" }]);

  // At home: no signal. Abroad on a dollar plan: no signal.
  const home = await member("Home Buyer");
  await svc("select payment_open($1, 'premium', 'recurring', $2, 'NG', 'CUS_h') as o", [home, `tly_${crypto.randomUUID()}`]);
  await svc("select payment_open($1, 'diaspora', 'recurring', $2, 'GB', null) as o", [abroad, `tly_${crypto.randomUUID()}`]);
  assert.equal((await svc("select count(*)::int as n from integrity_reviews where profile_id = $1", [home])).rows[0].n, 0);
  assert.equal((await svc("select count(*)::int as n from integrity_reviews where profile_id = $1", [abroad])).rows[0].n, 1);
});

// --- 2. The women's offer follows the track ---------------------------------

test("the women's launch offer is Diaspora Plus abroad and Premium Plus at home, same end date", async () => {
  const w = await member("Offer Woman", { gender: "woman" });
  assert.equal(await tierOf(w), "premium_plus");
  const end1 = (await db.query("select max(ends_at) as e from entitlements where profile_id = $1 and source = 'womens_launch_offer'", [w])).rows[0].e;
  // Country is set through confirm_country / change_country since 0027.
  await as(db, w, (tx) => tx.query("select confirm_country('GB')"));
  assert.equal(await tierOf(w), "diaspora_plus");
  await as(db, w, (tx) => tx.query("select change_country('NG')"));
  assert.equal(await tierOf(w), "premium_plus");
  const end2 = (await db.query("select max(ends_at) as e from entitlements where profile_id = $1 and source = 'womens_launch_offer'", [w])).rows[0].e;
  assert.equal(end2.getTime(), end1.getTime(), "no days added or taken");
  const man = await member("Not Offered");
  await as(db, man, (tx) => tx.query("select confirm_country('GB')"));
  assert.equal(await tierOf(man), "starter");
});

// --- 3. Staff only ---------------------------------------------------------------

test("members can't see the queue, call staff functions, or read any staff table", async () => {
  const m = await member("Curious Member");
  assert.equal((await as(db, m, (tx) => tx.query("select is_staff() as s"))).rows[0].s, false);
  assert.equal((await asStaff("select is_staff() as s")).rows[0].s, true);
  for (const sql of [
    "select * from staff_queue()",
    "select staff_item(gen_random_uuid())",
    "select staff_decide(gen_random_uuid(), 'clear')",
    "select * from review_items",
    "select * from staff_audit_log",
    "select * from staff_members",
    "insert into staff_members (profile_id) values (auth.uid())",
    "insert into account_restrictions (profile_id, reason_category) values (auth.uid(), 'x')",
    "delete from reverification_requests",
  ]) {
    await assert.rejects(as(db, m, (tx) => tx.query(sql)), `member could run: ${sql}`);
  }
});

test("every source feeds the queue: reports (married and blind marked), attendance disputes, borderline selfie checks", async () => {
  const a = await member("Reporter A");
  const b = await member("Reported B");
  await report(a, b, "user_is_married");
  await report(a, b, "harassment");
  await db.query("update reports set blind = true where reporter_id = $1 and reason = 'harassment'", [a]);
  await db.query("insert into reports (reporter_id, reported_id, reason, blind) values ($1, $2, 'scam_or_fraud', true)", [a, b]);
  const kinds = (await items(b)).map((x) => x.kind).sort();
  assert.deepEqual(kinds, ["blind_report", "married_report", "report"]);

  const c = await member("Selfie Borderline");
  const { rows: [s] } = await db.query(
    "insert into verification_sessions (profile_id, product, environment, status) values ($1, 'smartselfie', 'sandbox', 'submitted') returning id",
    [c],
  );
  await db.query("update verification_sessions set status = 'attention', result_code = 'review' where id = $1", [s.id]);
  assert.deepEqual((await items(c)).map((x) => x.kind), ["selfie_review"]);

  const queue = await asStaff("select kind from staff_queue()");
  assert.ok(queue.rows.some((r) => r.kind === "married_report"));
  assert.equal((await db.query("select count(*)::int as n from review_items where kind = 'sentinel'")).rows[0].n, 0, "Phase 1: no Sentinel items");
});

test("evidence carries the allowed facts and never a message body", async () => {
  const a = await member("Evidence Reporter");
  const b = await member("Evidence Subject");
  const t = await thread(a, b);
  await db.query("insert into messages (thread_id, sender_id, body) values ($1, $2, 'SECRET-CHAT-WORDS')", [t, b]);
  await report(a, b);
  const item = await asStaff("select staff_item($1) as i", [await itemFor(b, "report")]);
  const json = JSON.stringify(item.rows[0].i);
  assert.ok(!json.includes("SECRET-CHAT-WORDS"), "no chat content");
  const ev = item.rows[0].i.evidence;
  assert.equal(ev.reason, "Harassment");
  assert.equal(ev.messages_from_member_to_reporter, 1, "a count only — never the text");
  assert.equal(ev.reporter_note, "note to Toastly");
  assert.deepEqual(item.rows[0].i.actions, ["clear", "request_reverification", "restrict", "remove"]);
});

// --- Decisions -----------------------------------------------------------------

test("restrict hides the member and stops new contact; safety tools still work; lifting restores it — all audit-logged", async () => {
  const a = await member("Restrict Reporter");
  const b = await member("Restricted Member");
  // A woman, so only the restriction keeps the (male) restricted member out of her six (0036).
  const c = await member("Bystander", { gender: "woman" });
  await report(a, b);
  const id = await itemFor(b, "report");
  const d = await asStaff("select staff_decide($1, 'restrict', 'pattern of reports') as d", [id]);
  assert.equal(d.rows[0].d.reason_category, "report");
  assert.equal((await db.query("select status from reports where reported_id = $1", [b])).rows[0].status, "actioned");

  // Hidden from others' six, and no six of their own.
  const feedC = await as(db, c, (tx) => tx.query("select candidate_id from build_daily_feed($1)", [c]));
  assert.ok(!feedC.rows.some((r) => r.candidate_id === b));
  // A restricted account isn't live (0029), so the feed refuses outright.
  await assert.rejects(as(db, b, (tx) => tx.query("select * from build_daily_feed($1)", [b])), /isn't live/);

  // No new contact.
  await assert.rejects(as(db, b, (tx) => tx.query("insert into gist_sessions (proposer_id, invitee_id) values ($1, $2)", [b, c])), /restricted/);
  const t = await thread(b, c);
  await assert.rejects(db.query("insert into messages (thread_id, sender_id, body) values ($1, $2, 'hi')", [t, b]), /restricted/);

  // Safety still works: they can report and block.
  await report(b, c, "harassment");
  await as(db, b, (tx) => tx.query("insert into blocks (blocker_id, blocked_id) values ($1, $2)", [b, c]));

  // They can see that they're restricted (category only).
  const mine = await as(db, b, (tx) => tx.query("select reason_category from account_restrictions where lifted_at is null"));
  assert.deepEqual(mine.rows, [{ reason_category: "report" }]);

  // Lift from another open item about them.
  await report(c, b, "fake_profile");
  const item2 = await itemFor(b, "report");
  const offered = (await asStaff("select staff_item($1) as i", [item2])).rows[0].i.actions;
  assert.ok(offered.includes("lift_restriction") && !offered.includes("restrict"));
  await asStaff("select staff_decide($1, 'lift_restriction', 'second look found nothing more')", [item2]);
  await db.query("insert into messages (thread_id, sender_id, body) values ($1, $2, 'hi again')", [t, b]);

  const log = await svc("select action from staff_audit_log where subject_id = $1 order by created_at", [b]);
  assert.deepEqual(log.rows.map((r) => r.action), ["restrict", "lift_restriction"]);
  await assert.rejects(db.query("update staff_audit_log set action = 'clear' where subject_id = $1", [b]), /append-only/);
  await assert.rejects(db.query("delete from staff_audit_log where subject_id = $1", [b]), /append-only/);
});

test("re-verification hides the member from new feeds until a fresh selfie passes", async () => {
  const a = await member("RV Reporter");
  const b = await member("Asked To Re-verify");
  // A woman, so only the re-verification keeps the (male) member out of her six (0036).
  const c = await member("RV Bystander", { gender: "woman" });
  await report(a, b, "fake_profile");
  await asStaff("select staff_decide($1, 'request_reverification', 'confirm the account holder first')", [await itemFor(b, "report")]);
  assert.equal((await as(db, b, (tx) => tx.query("select reason_category from reverification_requests"))).rows[0].reason_category, "report");
  const feed = await as(db, c, (tx) => tx.query("select candidate_id from build_daily_feed($1)", [c]));
  assert.ok(!feed.rows.some((r) => r.candidate_id === b));

  const { rows: [s] } = await db.query(
    "insert into verification_sessions (profile_id, product, environment, status) values ($1, 'smartselfie', 'sandbox', 'submitted') returning id",
    [b],
  );
  await db.query("update verification_sessions set status = 'clear', passed = true where id = $1", [s.id]);
  assert.equal((await db.query("select count(*)::int as n from reverification_requests where profile_id = $1", [b])).rows[0].n, 0, "cleared by the pass");
});

test("ask to switch plan leaves a notice the member can read and dismiss; clear dismisses the signal", async () => {
  const abroad = await member("Switch Asked", { country: "GB" });
  await svc("select payment_open($1, 'premium', 'pass', $2, null, null)", [abroad, `tly_${crypto.randomUUID()}`]);
  const id = await itemFor(abroad, "pricing");
  assert.ok((await asStaff("select staff_item($1) as i", [id])).rows[0].i.actions.includes("ask_switch_plan"));
  await asStaff("select staff_decide($1, 'ask_switch_plan', 'lives in London')", [id]);
  const n = await as(db, abroad, (tx) => tx.query("select id, kind, reason_category from member_notices where dismissed_at is null"));
  assert.equal(n.rows[0].kind, "switch_plan");
  assert.equal(n.rows[0].reason_category, "plan_track");
  await as(db, abroad, (tx) => tx.query("select dismiss_notice($1)", [n.rows[0].id]));
  assert.equal((await as(db, abroad, (tx) => tx.query("select count(*)::int as n from member_notices where dismissed_at is null"))).rows[0].n, 0);
  assert.equal((await svc("select status from integrity_reviews where profile_id = $1", [abroad])).rows[0].status, "actioned");
  assert.equal((await asStaff("select staff_item($1) as i", [id])).rows[0].i.stage, "waiting_member", "the case waits on the member, still open to a later decision");
});

test("remove keeps retention records, blocks the phone and ID from verifying again, deletes the profile, and the audit survives", async () => {
  const a = await member("Remove Reporter");
  const b = await member("Married Member");
  await db.query("insert into phone_identities (profile_id, phone_hash) values ($1, 'phash-b')", [b]).catch(() => {});
  await db.query("insert into verified_id_hashes (id_hash, profile_id, id_type) values ('idhash-b', $1, 'NIN_V2')", [b]);
  await db.query("insert into payments (profile_id, provider, provider_ref, amount_minor, currency, status, purpose) values ($1, 'paystack', $2, 350000, 'NGN', 'succeeded', 'Premium')", [b, `tly_${crypto.randomUUID()}`]);
  await report(a, b, "user_is_married");
  const id = await itemFor(b, "married_report");
  const d = await asStaff("select staff_decide($1, 'remove', 'confirmed married') as d", [id]);
  assert.equal(d.rows[0].d.reason_category, "community_standards");

  assert.equal((await db.query("select count(*)::int as n from profiles where id = $1", [b])).rows[0].n, 0, "profile gone");
  assert.equal((await db.query("select count(*)::int as n from blocked_id_hashes where former_profile_id = $1", [b])).rows[0].n, 1);
  assert.equal((await db.query("select count(*)::int as n from retained_safety_records where former_profile_id = $1", [b])).rows[0].n, 1);
  assert.equal((await db.query("select count(*)::int as n from retained_payments where former_profile_id = $1", [b])).rows[0].n, 1);
  assert.equal((await db.query("select count(*)::int as n from account_removals where former_profile_id = $1", [b])).rows[0].n, 1);
  assert.equal((await db.query("select count(*)::int as n from auth.users where id = $1", [b])).rows[0].n, 1, "sign-in kept (banned by the server) until retention ends");
  assert.deepEqual((await svc("select action from staff_audit_log where subject_id = $1", [b])).rows, [{ action: "remove" }]);

  // When retention ends, the sign-in goes too.
  await db.query("update account_removals set retain_until = now() - interval '1 day' where former_profile_id = $1", [b]);
  await db.query("select purge_expired_retention()");
  assert.equal((await db.query("select count(*)::int as n from auth.users where id = $1", [b])).rows[0].n, 0);
});

test("an attendance dispute is decided by a person: attended returns both stakes", async () => {
  const a = await member("Date A");
  const b = await member("Date B");
  await db.query("insert into coin_ledger (profile_id, delta, kind, bucket) values ($1, 20, 'purchase', 'purchased'), ($2, 20, 'purchase', 'purchased')", [a, b]);
  const { rows: [d] } = await db.query(
    `insert into date_commitments (member_a, member_b, stake_coins, scheduled_for, status, a_staked_at, b_staked_at, no_show_member, contested_at, venue_name)
     values ($1, $2, 10, now() - interval '3 hours', 'under_review', now(), now(), $2, now(), 'Café Test') returning id`,
    [a, b],
  );
  await db.query("insert into coin_ledger (profile_id, delta, kind, bucket, commitment_id) values ($1, -10, 'stake_hold', 'purchased', $3), ($2, -10, 'stake_hold', 'purchased', $3)", [a, b, d.id]);
  await db.query("insert into attendance_reviews (commitment_id, contested_by) values ($1, $2)", [d.id, b]);
  const id = await itemFor(b, "attendance");
  const item = (await asStaff("select staff_item($1) as i", [id])).rows[0].i;
  assert.deepEqual(item.actions, ["attended", "no_show", "restrict", "remove"]);
  assert.equal(item.evidence.venue, "Café Test");
  await asStaff("select staff_decide($1, 'attended', 'receipt shown')", [id]);
  assert.equal((await db.query("select status from date_commitments where id = $1", [d.id])).rows[0].status, "completed");
  assert.equal((await db.query("select coin_balance($1) as b", [b])).rows[0].b, 20);
});

test("diaspora-to-diaspora stays a Diaspora-plan feature: others abroad match back home", async () => {
  await db.query("update diaspora_cities set active = true where slug = (select slug from diaspora_cities limit 1)");
  const city = (await db.query("select slug from diaspora_cities where active limit 1")).rows[0].slug;
  const free = await member("Free Abroad", { country: "GB" });
  const peer = await member("Peer Abroad", { country: "GB" });
  // A woman (0036), set after going live so she stays on the free plan too.
  await db.query("update profiles set gender = 'woman' where id = $1", [peer]);
  await db.query("update profiles set pool = 'diaspora', diaspora_city = $2 where id in ($1, $3)", [free, city, peer]);
  const feed = await as(db, free, (tx) => tx.query("select candidate_id from build_daily_feed($1)", [free]));
  assert.ok(!feed.rows.some((r) => r.candidate_id === peer), "a free member abroad doesn't get the diaspora pool");
  assert.equal((await as(db, free, (tx) => tx.query("select pool_restriction($1) as r", [free]))).rows[0].r, "tier");
});

// --- "Threatening or pressuring me" goes first (0034) ------------------------

test("a 'Threatening or pressuring me' report goes to the top of the queue, from any surface", async () => {
  const reporter = await member("Threat Reporter");
  const older = await member("Rude Member");
  const threat = await member("Threatening Member");
  await report(reporter, older, "harassment");
  await db.query("update reports set created_at = now() - interval '2 days' where reported_id = $1", [older]);
  await db.query("update review_items set created_at = now() - interval '2 days' where subject_id = $1", [older]);
  await report(reporter, threat, "threats_or_coercion");

  const queue = (await asStaff("select kind, urgent, reason from staff_queue('open')")).rows;
  assert.equal(queue[0].urgent, true, "the threat report is first, though it's the newest");
  assert.equal((await db.query("select urgent from review_items where subject_id = $1", [threat])).rows[0].urgent, true);
  assert.equal((await db.query("select urgent from review_items where subject_id = $1", [older])).rows[0].urgent, false, "other reasons keep their place");
  const ids = (await asStaff("select id from staff_queue('open')")).rows.map((r) => r.id);
  assert.equal(ids.indexOf(await itemFor(threat, "report")) < ids.indexOf(await itemFor(older, "report")), true);

  // From the locked inbox too (a blind report, no sender named to the reporter).
  const starter = await member("Locked Inbox Reader");
  const sender = await member("Locked Sender");
  const t = await thread(sender, starter);
  await db.query("delete from entitlements where profile_id = $1", [starter]);
  await db.query("insert into messages (thread_id, sender_id, body) values ($1, $2, 'Reply now or else')", [t, sender]);
  await as(db, starter, (tx) => tx.query("select blind_report_locked('threats_or_coercion', null)"));
  assert.equal((await db.query("select urgent from review_items where subject_id = $1 and kind = 'blind_report'", [sender])).rows[0].urgent, true);

  // Members never see the queue, urgent or not.
  await assert.rejects(as(db, reporter, (tx) => tx.query("select * from staff_queue('open')")));
});

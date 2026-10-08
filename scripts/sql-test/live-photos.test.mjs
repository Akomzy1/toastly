/**
 * Profile photos, the main-photo face match and "no live profile, no access"
 * (migration 0029) — against a throwaway Postgres (PGlite) with every
 * migration applied. Never production.
 *
 * Members act through the same role and claims a raw API request has: this is
 * what a modified client gets, which is the point.
 *
 *   node --test scripts/sql-test/live-photos.test.mjs
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { freshDb, as, asService, makeUser, goLive } from "./harness.mjs";

let db;
let staff;
before(async () => {
  db = await freshDb();
  staff = await member("Staff Reviewer");
  await db.query("insert into staff_members (profile_id) values ($1)", [staff]);
});

async function member(name, { live = false, paid = false } = {}) {
  const id = await makeUser(db, { name, email: `${crypto.randomUUID()}@example.com` });
  await db.query("update profiles set stage = 'verified_real', phone_verified_at = now() where id = $1", [id]);
  // 0036's steps (gender, who they'd like to meet, a first answer) done up
  // front: these tests are about photos and the selfie.
  await db.query("update profiles set gender = 'man', seeking = '{woman,man}' where id = $1", [id]);
  await db.query("insert into prompt_answers (profile_id, prompt_id, answer) values ($1, 10, 'Being early, every time') on conflict do nothing", [id]);
  if (paid) await db.query("insert into entitlements (profile_id, tier, source, ends_at) values ($1, 'premium', 'subscription', now() + interval '30 days')", [id]);
  if (live) await goLive(db, id);
  return id;
}
const me = (id, sql, params) => as(db, id, (tx) => tx.query(sql, params));
const svc = (sql, params) => asService(db, (tx) => tx.query(sql, params));
const asStaff = (sql, params) => as(db, staff, (tx) => tx.query(sql, params));
const status = async (id) => (await me(id, "select live_profile_status() as s")).rows[0].s;
const addPhoto = async (id, label) =>
  (await me(id, "insert into profile_photos (profile_id, storage_path, position) values ($1, $2, 1) returning id", [id, `${id}/${label}.jpg`])).rows[0].id;
const isLive = async (id) => (await db.query("select profile_is_live($1) as l", [id])).rows[0].l;

// --- the rule ---------------------------------------------------------------

test("not live: no feed, no other profiles, no answers, no invites, no messages, no dates", async () => {
  const notLive = await member("Not Live Yet", { paid: true });
  const live = await member("Live Member", { live: true, paid: true });
  const { rows: [ans] } = await db.query("insert into prompt_answers (profile_id, prompt_id, answer) values ($1, 1, 'Suya at midnight') returning id", [live]);
  await db.query("insert into daily_feed (profile_id, feed_date, position, candidate_id) values ($1, current_date, 1, $2)", [notLive, live]);

  await assert.rejects(me(notLive, "select * from build_daily_feed($1)", [notLive]), /isn't live/);
  assert.equal((await me(notLive, "select id from profiles where id = $1", [live])).rows.length, 0, "can't view another profile");
  assert.equal((await me(notLive, "select id from prompt_answers where id = $1", [ans.id])).rows.length, 0, "can't read answers");
  assert.equal((await me(notLive, "select * from daily_feed")).rows.length, 0, "can't read a feed built earlier");
  await assert.rejects(me(notLive, "select gist_invite($1)", [ans.id]), /isn't live/, "can't send a Gist invite");
  await assert.rejects(me(notLive, "insert into replies (sender_id, recipient_id, prompt_answer_id, kind, body) values ($1, $2, $3, 'text', 'hi')", [notLive, live, ans.id]));
  await assert.rejects(me(notLive, "insert into gist_sessions (proposer_id, invitee_id) values ($1, $2)", [notLive, live]));
  const [lo, hi] = [notLive, live].sort();
  const { rows: [t] } = await db.query("insert into threads (member_a, member_b) values ($1, $2) returning id", [lo, hi]);
  await assert.rejects(me(notLive, "insert into messages (thread_id, sender_id, body) values ($1, $2, 'hi')", [t.id, notLive]));
  await assert.rejects(me(notLive, "select unread_count()"), /isn't live/);
  await assert.rejects(me(notLive, "select date_propose(gen_random_uuid(), now() + interval '3 days', 2)"), /isn't live/);

  // And nobody sees them.
  assert.equal((await me(live, "select id from profiles where id = $1", [notLive])).rows.length, 0, "hidden from live members");
  await assert.rejects(me(live, "insert into gist_sessions (proposer_id, invitee_id) values ($1, $2)", [live, notLive]), "can't invite a member who isn't live");
});

test("not live: verification, photos, settings, data and consents stay open", async () => {
  const m = await member("Still Setting Up");
  assert.equal((await me(m, "select id from profiles where id = $1", [m])).rows.length, 1, "their own profile");
  const p = await addPhoto(m, "first");
  await me(m, "select nominate_main_photo($1)", [p]);
  await me(m, "insert into consents (profile_id, kind, version) values ($1, 'verification_selfie', '2026-10-05')", [m]);
  await me(m, "update profiles set bio = 'Hello' where id = $1", [m]);
  const s = await status(m);
  assert.equal(s.live, false);
  assert.equal(s.photo_count, 0, "a candidate being checked doesn't count yet");
  assert.equal(s.main, "pending");
  assert.equal(s.was_live, false, "'not live yet', not 'paused'");
});

test("four photos and a matched main photo make a verified member live; below four, or no main photo, pauses access", async () => {
  const m = await member("Going Live");
  const photos = [];
  for (const l of ["a", "b", "c", "d"]) photos.push(await addPhoto(m, l));
  await me(m, "select nominate_main_photo($1)", [photos[0]]);
  assert.equal(await isLive(m), false, "the main photo hasn't matched yet");
  await svc("select record_main_photo_match($1, 'matched')", [photos[0]]);
  assert.equal(await isLive(m), true);
  assert.equal((await status(m)).was_live, true);

  await me(m, "delete from profile_photos where id = $1", [photos[3]]);
  assert.equal(await isLive(m), false, "three photos: paused");
  const s = await status(m);
  assert.equal(s.was_live, true, "'access paused', not 'not live yet'");
  assert.equal(s.photo_count, 3);
  await addPhoto(m, "e");
  assert.equal(await isLive(m), true, "back to four: live again");

  await me(m, "delete from profile_photos where id = $1", [photos[0]]);
  assert.equal(await isLive(m), false, "removing the main photo pauses access");
  assert.equal((await status(m)).main, "none");
});

test("members can't set their own result or point their profile at a photo", async () => {
  const m = await member("Self Grader");
  const p = await addPhoto(m, "x");
  await assert.rejects(me(m, "update profile_photos set face_match = 'matched' where id = $1", [p]), /recorded by Toastly/);
  await assert.rejects(me(m, "update profiles set main_photo_id = $2 where id = $1", [m, p]), /nominate_main_photo/);
  await assert.rejects(me(m, "select record_main_photo_match($1, 'matched')", [p]));
  const other = await member("Someone Else");
  await assert.rejects(me(other, "select nominate_main_photo($1)", [p]), /isn't yours/);
});

test("six photos, plus one replacement in flight", async () => {
  const m = await member("Full Set", { live: true });
  await addPhoto(m, "e");
  await addPhoto(m, "f");
  await addPhoto(m, "g");
  await assert.rejects(addPhoto(m, "h"), /photo_limit/);
});

// --- replacing the main photo ---------------------------------------------------

test("a replacement is checked while the old main photo stays live, and stays private until it matches", async () => {
  const m = await member("Replacer", { live: true });
  const viewer = await member("Viewer", { live: true });
  // The viewer has a reason to see the profile (0032): it's in their six.
  await db.query("insert into daily_feed (profile_id, feed_date, position, candidate_id) values ($1, current_date, 1, $2)", [viewer, m]);
  const oldMain =(await db.query("select main_photo_id from profiles where id = $1", [m])).rows[0].main_photo_id;
  const cand = await addPhoto(m, "new-main");
  await me(m, "select nominate_main_photo($1)", [cand]);
  assert.equal(await isLive(m), true, "the old main photo keeps the profile live");
  // Another member's photos come only from profile_for (0033).
  const seen = ((await me(viewer, "select profile_for($1) as p", [m])).rows[0].p?.photos ?? []).map((r) => r.id);
  assert.ok(seen.includes(oldMain) && !seen.includes(cand), "others see the old main photo, not the candidate");

  const replaced = (await svc("select record_main_photo_match($1, 'matched') as p", [cand])).rows[0].p;
  assert.equal(replaced, `${m}/live-0.jpg`, "returns the old file, for the server to delete");
  assert.equal((await db.query("select main_photo_id from profiles where id = $1", [m])).rows[0].main_photo_id, cand);
  assert.equal((await db.query("select count(*)::int as n from profile_photos where id = $1", [oldMain])).rows[0].n, 0, "the old main photo is gone");
  assert.equal(await isLive(m), true);
});

test("a later mismatch is 'verification drift'; 'face not clear' can be kept as another photo", async () => {
  const m = await member("Drifter", { live: true });
  const unlike = await addPhoto(m, "unlike");
  await me(m, "select nominate_main_photo($1)", [unlike]);
  await svc("select record_main_photo_match($1, 'mismatch', 'not_matching')", [unlike]);
  const drift = (await db.query("select count(*)::int as n from trust_events where profile_id = $1 and kind = 'verification_drift'", [m])).rows[0].n;
  assert.equal(drift, 1);
  assert.equal(await isLive(m), true, "the matched main photo stays live");
  assert.equal((await me(m, "select main_photo_check() as c")).rows[0].c.candidate_reason, "not_matching");

  const blurry = await addPhoto(m, "blurry");
  await me(m, "select nominate_main_photo($1)", [blurry]);
  await svc("select record_main_photo_match($1, 'mismatch', 'face_not_clear')", [blurry]);
  await assert.rejects(me(m, "select request_photo_review($1)", [blurry]), "a face that isn't clear isn't sent to a person");
  const before = (await status(m)).photo_count;
  await me(m, "select keep_as_other_photo($1)", [blurry]);
  assert.equal((await status(m)).photo_count, before + 1, "'Use it as another photo' counts it");
});

test("'Ask a person to look' opens a photo case; a person's decision settles it — and a second time reopens it", async () => {
  const m = await member("Asks A Person", { live: true });
  const p = await addPhoto(m, "ask");
  await me(m, "select nominate_main_photo($1)", [p]);
  await svc("select record_main_photo_match($1, 'mismatch', 'not_matching')", [p]);
  await me(m, "select request_photo_review($1)", [p]);
  const item = (await db.query("select id, kind from review_items where source_table = 'profile_photos' and source_id = $1", [p])).rows[0];
  assert.equal(item.kind, "photo_match");
  await asStaff("select staff_decide($1, 'clear', 'Same person, different lighting.')", [item.id]);
  assert.equal((await db.query("select main_photo_id from profiles where id = $1", [m])).rows[0].main_photo_id, p, "cleared: it's the main photo now");

  const p2 = await addPhoto(m, "ask-again");
  await me(m, "select nominate_main_photo($1)", [p2]);
  await svc("select record_main_photo_match($1, 'review')", [p2]);
  const item2 = (await db.query("select id from review_items where source_id = $1", [p2])).rows[0].id;
  await asStaff("select staff_decide($1, 'request_reverification', 'Please take a fresh selfie.')", [item2]);
  assert.equal((await db.query("select face_match from profile_photos where id = $1", [p2])).rows[0].face_match, "mismatch");
  await me(m, "select request_photo_review($1)", [p2]);
  const reopened = (await db.query("select stage from review_items where id = $1", [item2])).rows[0].stage;
  assert.equal(reopened, "new", "the decided case reopens rather than dropping the request");
});

// --- the onboarding selfie -------------------------------------------------------

async function onboardingSession(m, photo) {
  const { rows: [s] } = await db.query(
    "insert into verification_sessions (profile_id, product, environment, photo_id, step) values ($1, 'smartselfie', 'sandbox', $2, 'onboard') returning id",
    [m, photo]);
  return s.id;
}

test("one onboarding selfie: live and matched makes the member Verified Real and live", async () => {
  const m = await member("Onboarding");
  await db.query("update profiles set stage = 'phone_verified' where id = $1", [m]);
  const photos = [];
  for (const l of ["a", "b", "c", "d"]) photos.push(await addPhoto(m, l));
  await me(m, "select nominate_main_photo($1)", [photos[0]]);
  const s = await onboardingSession(m, photos[0]);
  await svc("select record_onboarding_check($1, 'passed', 'matched')", [s]);
  const p = await db.query("select stage, liveness_verified_at from profiles where id = $1", [m]);
  assert.equal(p.rows[0].stage, "verified_real");
  assert.ok(p.rows[0].liveness_verified_at);
  assert.equal(await isLive(m), true);
});

test("a live person whose photo doesn't match is Verified Real but not live", async () => {
  const m = await member("Wrong Photo");
  await db.query("update profiles set stage = 'phone_verified' where id = $1", [m]);
  const photos = [];
  for (const l of ["a", "b", "c", "d"]) photos.push(await addPhoto(m, l));
  await me(m, "select nominate_main_photo($1)", [photos[0]]);
  const s = await onboardingSession(m, photos[0]);
  await svc("select record_onboarding_check($1, 'passed', 'mismatch', 'not_matching')", [s]);
  assert.equal((await db.query("select stage from profiles where id = $1", [m])).rows[0].stage, "verified_real");
  assert.equal(await isLive(m), false);
});

test("a borderline onboarding selfie goes to a person, whose 'clear' settles Verified Real and the photo", async () => {
  const m = await member("Borderline");
  await db.query("update profiles set stage = 'phone_verified' where id = $1", [m]);
  const photos = [];
  for (const l of ["a", "b", "c", "d"]) photos.push(await addPhoto(m, l));
  await me(m, "select nominate_main_photo($1)", [photos[0]]);
  const s = await onboardingSession(m, photos[0]);
  await db.query("update verification_sessions set status = 'attention' where id = $1", [s]);
  await svc("select record_onboarding_check($1, 'review', 'review')", [s]);
  const item = (await db.query("select id, kind from review_items where source_table = 'verification_sessions' and source_id = $1", [s])).rows[0];
  assert.equal(item.kind, "selfie_review");
  assert.equal(await isLive(m), false, "nothing decided automatically");
  await asStaff("select staff_decide($1, 'clear', 'Real person, same face as the photo.')", [item.id]);
  assert.equal((await db.query("select stage from profiles where id = $1", [m])).rows[0].stage, "verified_real");
  assert.equal(await isLive(m), true);
});

test("replacement checks reach a person as photo cases, never as ID reviews", async () => {
  const m = await member("Replacement Job", { live: true });
  const { rows: [s] } = await db.query(
    "insert into verification_sessions (profile_id, product, environment, step, check_id) values ($1, 'photo_match', 'sandbox', 'compare', gen_random_uuid()) returning id", [m]);
  await db.query("update verification_sessions set status = 'attention' where id = $1", [s.id]);
  assert.equal((await db.query("select count(*)::int as n from review_items where source_id = $1", [s.id])).rows[0].n, 0);
});

// --- deletion while a review is open -----------------------------------------------

test("deleting while a review is open holds the number until it's settled; cleared, it's freed", async () => {
  const reporter = await member("Holder Reporter", { live: true });
  const m = await member("Leaves Mid Review", { live: true });
  const hash = crypto.randomUUID().replace(/-/g, "").repeat(2);
  await svc("select record_phone_verified($1, $2)", [m, hash]);
  await me(reporter, "insert into reports (reporter_id, reported_id, reason) values ($1, $2, 'fake_profile')", [reporter, m]);
  const item = (await db.query("select id from review_items where subject_id = $1", [m])).rows[0].id;
  await me(m, "select prepare_account_deletion()");
  const held = (await db.query("select held_for_review from blocked_phone_hashes where phone_hash = $1", [hash])).rows[0];
  assert.equal(held?.held_for_review, item, "held while the review is open");
  await asStaff("select staff_decide($1, 'clear', 'Nothing in the report holds up.')", [item]);
  assert.equal((await db.query("select count(*)::int as n from blocked_phone_hashes where phone_hash = $1", [hash])).rows[0].n, 0, "cleared: the number is free");
});

test("deleting an account un-pauses the partner and returns their staked coins", async () => {
  const leaver = await member("Leaving Partner", { live: true });
  const partner = await member("Staying Partner", { live: true });
  const [a, b] = [leaver, partner].sort();
  await db.query("insert into couples (member_a, member_b, proposed_by, status, started_at) values ($1, $2, $1, 'active', now())", [a, b]);
  await db.query("update profiles set paused = true where id in ($1, $2)", [a, b]);
  const { rows: [d] } = await db.query(
    "insert into date_commitments (member_a, member_b, stake_coins, scheduled_for, b_staked_at) values ($1, $2, 3, now() + interval '3 days', now()) returning id",
    [leaver, partner]);
  await db.query("insert into coin_ledger (profile_id, delta, kind, bucket, txn_id) values ($1, 5, 'purchase', 'purchased', gen_random_uuid())", [partner]);
  await db.query("insert into coin_ledger (profile_id, delta, kind, bucket, commitment_id, txn_id) values ($1, -3, 'stake_hold', 'purchased', $2, gen_random_uuid())", [partner, d.id]);
  const before = (await db.query("select purchased_balance($1) as b", [partner])).rows[0].b;

  await me(leaver, "select prepare_account_deletion()");
  assert.equal((await db.query("select paused from profiles where id = $1", [partner])).rows[0].paused, false, "the partner is visible again");
  const after = (await db.query("select purchased_balance($1) as b", [partner])).rows[0].b;
  assert.equal(Number(after), Number(before) + 3, "their stake came back");
  assert.equal((await db.query("select cancel_reason from date_commitments where id = $1", [d.id])).rows[0].cancel_reason, "account_deleted");
});

test("consents are append-only and private", async () => {
  const m = await member("Consenter");
  await me(m, "insert into consents (profile_id, kind, version) values ($1, 'replace_main_photo', '2026-10-05')", [m]);
  await assert.rejects(me(m, "update consents set version = 'x' where profile_id = $1", [m]));
  await assert.rejects(me(m, "delete from consents where profile_id = $1", [m]));
  const other = await member("Not Them");
  assert.equal((await me(other, "select * from consents where profile_id = $1", [m])).rows.length, 0);
  await assert.rejects(me(other, "insert into consents (profile_id, kind, version) values ($1, 'id_check', 'v')", [m]));
});

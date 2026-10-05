/**
 * 0018: the human review queue, account standing and the blocklist.
 * Cases are raised automatically; every decision is a named person's,
 * logged first, and nothing restricts or removes an account on its own.
 */
import { randomUUID } from "node:crypto";

export default async function review(t) {
  const { member, service, root } = t;
  const G = "review queue";

  // A reviewer: an ordinary sign-in listed as staff.
  const staffId = randomUUID();
  await root("insert into auth.users (id, raw_user_meta_data) values ($1, '{}')", [staffId]);
  await root("insert into staff_members (user_id, display_name) values ($1, 'Adaeze O.')", [staffId]);
  const staff = (sql, params) => member(staffId, sql, params);
  const decide = (c, action, note) => staff("select decide_case($1, $2, $3)", [c, action, note]);
  const caseOf = async (subject, kind) =>
    (await root("select * from review_cases where subject_ref = $1 and kind = $2 order by created_at desc limit 1", [subject, kind])).rows[0];
  const bindPhone = (id, hash) => service("select record_phone_verified($1, $2)", [id, hash]);

  const R = await t.makeLive("Reporter");
  const X = await t.makeLive("Reported");
  const P = await t.makeLive("X's partner");
  await bindPhone(X.id, `phone-${X.id}`);
  await service("select record_id_fingerprint($1, $2)", [X.id, `id-fingerprint-${X.id}`.padEnd(40, "0")]);
  const [ca, cb] = [X.id, P.id].sort();
  await root("insert into couples (member_a, member_b, proposed_by, status, a_accepted_at, b_accepted_at, started_at) values ($1, $2, $1, 'active', now(), now(), now())", [ca, cb]);
  await root("update profiles set paused = true where id in ($1, $2)", [X.id, P.id]);

  // --- cases are raised automatically -----------------------------------------
  await member(R.id, "insert into reports (reporter_id, reported_id, reason) values ($1, $2, 'user_is_married')", [R.id, X.id]);
  let married = await caseOf(X.id, "married");
  t.record(G, "a married-user report raises a married-user case", married?.summary === "A match says this member is married. First report on the account.");
  const R2 = await t.makeLive("Second reporter");
  await member(R2.id, "insert into reports (reporter_id, reported_id, reason) values ($1, $2, 'user_is_married')", [R2.id, X.id]);
  const after = await caseOf(X.id, "married");
  t.record(G, "a second report joins the open case", after.id === married.id && /^2 separate matches/.test(after.summary), after.summary);

  await root("insert into integrity_reviews (profile_id, signal) values ($1, 'payment_geography_mismatch')", [R.id]);
  t.record(G, "a pricing signal raises a pricing case", Boolean(await caseOf(R.id, "pricing")));

  const [ta, tb] = [R.id, X.id].sort();
  const thread = (await root("insert into threads (member_a, member_b) values ($1, $2) returning id", [ta, tb])).rows[0].id;
  await root("insert into messages (thread_id, sender_id, body) values ($1, $2, 'send me money for my visa please')", [thread, X.id]);
  await root("delete from entitlements where profile_id = $1 and source = 'manual_grant'", [R.id]); // R on Starter
  await member(R.id, "select blind_report_locked('asked_for_money')");
  const blind = await caseOf(X.id, "blind");
  t.record(G, "a locked-inbox report raises a locked-inbox case", blind && /reporter hasn't read the messages/.test(blind.summary), blind?.summary);

  // --- staff only ------------------------------------------------------------
  t.refused(G, "a member can't open the queue", await member(R.id, "select review_queue()"), "42501");
  t.refused(G, "a member can't decide a case", await member(R.id, "select decide_case($1, 'clear', 'looks fine to me honestly')", [married.id]), "42501");
  t.ok(G, "staff can open the queue", await staff("select review_queue()"), 1);
  t.refused(G, "a decision needs a reason", await decide(married.id, "restrict", "short"));

  // --- the evidence never includes message text -------------------------------
  const detail = t.value(await staff("select review_case_detail($1)", [blind.id]));
  const text = JSON.stringify(detail);
  t.record(G, "case evidence never contains message text", !text.includes("visa"));
  t.record(G, "…but does count the messages", detail?.report?.messages_from_reported_to_reporter === 1);
  t.record(G, "…and says the reporter couldn't read them", detail?.report?.from_locked_inbox === true);
  t.record(G, "…and never shows a phone or ID fingerprint", !text.includes(`phone-${X.id}`) && !text.includes("id-fingerprint"));

  // --- restrict, then clear --------------------------------------------------------
  t.ok(G, "a reviewer restricts, with a reason", await decide(married.id, "restrict", "Two independent reports with matching details."), 1);
  let s = t.value(await member(X.id, "select live_profile_status()"));
  t.record(G, "restricted: not live, and told why (married)", s?.live === false && s?.standing === "restricted" && s?.standing_reason === "married");
  t.record(G, "restricting ends Couple Mode and un-pauses the partner",
    (await root("select paused from profiles where id = $1", [P.id])).rows[0].paused === false);
  t.ok(G, "a reviewer clears it after a second look", await decide(married.id, "clear", "Reporters confused two members; not this one."), 1);
  s = t.value(await member(X.id, "select live_profile_status()"));
  t.record(G, "cleared: good standing and live again", s?.standing === "good" && s?.live === true);

  // --- the log is append-only --------------------------------------------------
  const log = await root("select count(*)::int as n from review_decisions where case_id = $1", [married.id]);
  t.record(G, "every step is logged", log.rows[0].n >= 4, `${log.rows[0].n} entries`);
  t.refused(G, "a decision can't be edited", await service("update review_decisions set note = 'changed my mind entirely' where case_id = $1", [married.id]), "42501");
  t.refused(G, "a decision can't be deleted", await service("delete from review_decisions where case_id = $1", [married.id]), "42501");

  // --- remove: closed, and the blocklist keeps them out for two years ------------
  t.ok(G, "a reviewer removes, with a reason", await decide(blind.id, "remove", "Repeated money requests confirmed by three reporters."), 1);
  s = t.value(await member(X.id, "select live_profile_status()"));
  t.record(G, "removed: closed and told why", s?.standing === "removed" && s?.live === false);
  const blocked = await root("select kind, retain_until from blocked_identifiers where case_id = $1", [blind.id]);
  t.record(G, "phone and ID fingerprints are blocklisted for two years",
    blocked.rows.length === 2 && blocked.rows.every((b) => b.retain_until && new Date(b.retain_until) > new Date(Date.now() + 700 * 86400e3)),
    blocked.rows.map((b) => b.kind).join(", "));
  const N = await t.makeMember("Returning");
  t.refused(G, "a new account can't use the removed member's number", await bindPhone(N.id, `phone-${X.id}`), "23505");
  t.record(G, "…and is told only that it's in use", t.value(await member(N.id, "select phone_in_use($1)", [`phone-${X.id}`])) === true);
  t.refused(G, "…nor their ID", await service("select record_id_fingerprint($1, $2)", [N.id, `id-fingerprint-${X.id}`.padEnd(40, "0")]), "23505");

  // --- deletion: in good standing frees the number; under review holds it -----
  const D = "deletion and the blocklist";
  const Good = await t.makeLive("Leaves in good standing");
  await bindPhone(Good.id, `phone-${Good.id}`);
  t.record(D, "no open review: the deletion screen says nothing extra", t.value(await member(Good.id, "select has_open_review()")) === false);
  await service("select prepare_account_deletion($1)", [Good.id]);
  await root("delete from auth.users where id = $1", [Good.id]);
  const Fresh = await t.makeMember("Gets the number later");
  t.ok(D, "deleting in good standing frees the number", await bindPhone(Fresh.id, `phone-${Good.id}`), 1);

  const Held = await t.makeLive("Leaves under review");
  await bindPhone(Held.id, `phone-${Held.id}`);
  await member(R2.id, "insert into reports (reporter_id, reported_id, reason) values ($1, $2, 'scam_or_fraud')", [R2.id, Held.id]);
  const heldCase = await caseOf(Held.id, "safety");
  t.record(D, "an open review: the member is told records are kept until it's settled", t.value(await member(Held.id, "select has_open_review()")) === true);
  await service("select prepare_account_deletion($1)", [Held.id]);
  await root("delete from auth.users where id = $1", [Held.id]);
  const Try = await t.makeMember("Tries the held number");
  t.refused(D, "the number is held while the review is open", await bindPhone(Try.id, `phone-${Held.id}`), "23505");
  t.record(D, "the case survives the deletion", (await root("select subject_id from review_cases where id = $1", [heldCase.id])).rows[0].subject_id === null);
  await decide(heldCase.id, "clear", "Report not substantiated; nothing to act on.");
  t.ok(D, "cleared: the held number is released", await bindPhone(Try.id, `phone-${Held.id}`), 1);

  // --- photo and selfie checks come here too -------------------------------------
  const F = "photo and selfie checks";
  const Ph = await t.makeLive("Photo under review");
  const newMain = await t.addPhoto(Ph, "new-main");
  await member(Ph.id, "select nominate_main_photo($1)", [newMain]);
  await service("select record_main_photo_match($1, 'review')", [newMain]);
  const photoCase = await caseOf(Ph.id, "photo");
  t.record(F, "a borderline replacement photo raises a photo case", Boolean(photoCase), photoCase?.summary);
  t.refused(F, "photo cases don't take 'clear'", await decide(photoCase.id, "clear", "No reason to doubt the photo."));
  t.ok(F, "a reviewer confirms the match", await decide(photoCase.id, "confirm_match", "Same person as the other four photos."), 1);
  t.record(F, "…and the new photo becomes the main photo",
    (await root("select main_photo_id from profiles where id = $1", [Ph.id])).rows[0].main_photo_id === newMain);
}

/**
 * No live profile, no access (PRD §5.1.2, migration 0013) — called directly,
 * as members who aren't live, plus live controls proving the same calls work
 * between live members.
 */
export default async function liveGuard(t) {
  const { member, service, root } = t;

  const L1 = await t.makeLive("Live One");
  const L2 = await t.makeLive("Live Two");
  const L3 = await t.makeLive("Live Three");
  const R1 = await t.makeLive("Replacing");
  const P1 = await t.makeLive("Photo Remover"); // drops to 3 photos later
  const M1 = await t.makeLive("Main Remover"); // deletes the main photo later
  const K1 = await t.makeLive("M1's partner"); // in Couple Mode with M1

  // Never live: verified, phone confirmed, main photo matched — but 3 photos.
  const N1 = await t.makeMember("Never Live");
  for (const l of ["a", "b", "c"]) await t.addPhoto(N1, l);
  await t.setMainPhoto(N1, N1.photos[0].id);

  // History made while P1 and M1 were live, so the guard has something real
  // to withhold once they aren't.
  const L1feedBefore = await member(L1.id, "select candidate_id from build_daily_feed($1)", [L1.id]);
  await member(P1.id, "select * from build_daily_feed($1)", [P1.id]);
  const S1 = (await root("insert into gist_sessions (proposer_id, invitee_id) values ($1, $2) returning id", [L1.id, P1.id])).rows[0].id;
  const S2 = (await root("insert into gist_sessions (proposer_id, invitee_id, status) values ($1, $2, 'completed') returning id", [P1.id, L2.id])).rows[0].id;
  await root("insert into gist_outcomes (session_id, profile_id, wants_to_continue) values ($1, $2, true), ($1, $3, true)", [S2, P1.id, L2.id]);
  const SPOT = (await root("insert into date_spots (session_id, place_id, name, address, category) values ($1, 'x', 'Cafe', 'VI', 'cafe') returning id", [S2])).rows[0].id;
  await root("insert into date_commitments (member_a, member_b, scheduled_for) values ($1, $2, now() + interval '2 days')", [P1.id, L2.id]);
  const [a, b] = [P1.id, L3.id].sort();
  const T1 = (await root("insert into threads (member_a, member_b) values ($1, $2) returning id", [a, b])).rows[0].id;
  await root("insert into messages (thread_id, sender_id, body) values ($1, $2, 'hello')", [T1, L3.id]);
  const [ca, cb] = [M1.id, K1.id].sort();
  const COUPLE = (await root(
    "insert into couples (member_a, member_b, proposed_by, status, a_accepted_at, b_accepted_at, started_at) values ($1, $2, $1, 'active', now(), now(), now()) returning id",
    [ca, cb],
  )).rows[0].id;
  await root("insert into coin_ledger (profile_id, delta, kind) values ($1, 50, 'purchase')", [P1.id]);

  // Drop below the bar — through the members' OWN sessions, as the app would.
  const del1 = await member(P1.id, "delete from profile_photos where id = $1", [P1.photos[3].id]);
  const del2 = await member(M1.id, "delete from profile_photos where id = $1", [M1.photos[0].id]);
  t.record("setup", "P1 deletes a photo with their own session", del1.count === 1);
  t.record("setup", "M1 deletes their main photo with their own session", del2.count === 1);

  // --- every not-live member, every guarded path ------------------------------
  for (const [g, m] of [
    ["N1 never live (3 photos)", N1],
    ["P1 paused (dropped to 3)", P1],
    ["M1 paused (main removed)", M1],
  ]) {
    const s = await t.status(m);
    t.record(g, "live_profile_status says not live, with the reason", s && s.live === false,
      JSON.stringify({ live: s?.live, was_live: s?.was_live, photos: s?.photo_count, main: s?.main_photo }));

    t.refused(g, "build_daily_feed(own id) refused", await member(m.id, "select * from build_daily_feed($1)", [m.id]), "PT403");
    t.empty(g, "daily_feed rows unreadable", await member(m.id, "select * from daily_feed"));
    t.empty(g, "other members' profiles unreadable", await member(m.id, "select id from profiles where id <> $1", [m.id]));
    t.empty(g, "other members' prompt answers unreadable", await member(m.id, "select id from prompt_answers where profile_id <> $1", [m.id]));
    t.empty(g, "other members' photo rows unreadable", await member(m.id, "select id from profile_photos where profile_id <> $1", [m.id]));
    t.empty(g, "other members' photo files unreadable", await member(m.id, "select name from storage.objects where bucket_id = 'profile-photos' and name not like $1", [`${m.id}/%`]));
    t.refused(g, "reply to a live member's answer refused",
      await member(m.id, "insert into replies (sender_id, recipient_id, prompt_answer_id, kind) values ($1, $2, $3, 'gist_invite')", [m.id, L1.id, L1.answers[0]]));
    t.refused(g, "propose a Gist to a live member refused",
      await member(m.id, "insert into gist_sessions (proposer_id, invitee_id) values ($1, $2)", [m.id, L2.id]));
    t.empty(g, "gist sessions unreadable", await member(m.id, "select id from gist_sessions"));
    t.empty(g, "threads unreadable", await member(m.id, "select id from threads"));
    t.empty(g, "messages unreadable", await member(m.id, "select id from messages"));
    t.refused(g, "locked-inbox count refused", await member(m.id, "select unread_count()"), "PT403");
    t.empty(g, "date spots unreadable", await member(m.id, "select id from date_spots"));
    t.empty(g, "date commitments unreadable", await member(m.id, "select id from date_commitments"));

    t.ok(g, "OPEN: own profile readable", await member(m.id, "select id from profiles where id = $1", [m.id]), 1);
    t.ok(g, "OPEN: settings save (bio)", await member(m.id, "update profiles set bio = 'still me' where id = $1", [m.id]), 1);
    t.ok(g, "OPEN: own photos readable", await member(m.id, "select id from profile_photos where profile_id = $1", [m.id]), 1);
    t.ok(g, "OPEN: report a member", await member(m.id, "insert into reports (reporter_id, reported_id, reason) values ($1, $2, 'other')", [m.id, L1.id]), 1);
    t.ok(g, "OPEN: block a member", await member(m.id, "insert into blocks (blocker_id, blocked_id) values ($1, $2)", [m.id, L3.id]), 1);
    await root("delete from blocks where blocker_id = $1", [m.id]);
    t.ok(g, "OPEN: safety kit emergency contact", await member(m.id, "insert into emergency_contacts (profile_id, label, phone_e164) values ($1, 'Sis', '+2348000000000')", [m.id]), 1);
    t.ok(g, "OPEN: blind report (locked inbox)", await member(m.id, "select blind_report_locked('harassment')"), 1);
    t.ok(g, "OPEN: coin balance readable", await member(m.id, "select coin_balance($1)", [m.id]), 1);
  }

  // History P1 held while live.
  const PG = "P1 paused (dropped to 3)";
  t.empty(PG, "cannot accept the Gist invite they hold", await member(P1.id, "update gist_sessions set status = 'accepted' where id = $1", [S1]));
  t.record(PG, "…and the invite is still unanswered", (await root("select status from gist_sessions where id = $1", [S1])).rows[0].status === "proposed");
  t.refused(PG, "cannot submit a Gist outcome", await member(P1.id, "insert into gist_outcomes (session_id, profile_id, wants_to_continue) values ($1, $2, true)", [S1, P1.id]));
  t.empty(PG, "cannot accept a date spot", await member(P1.id, "update date_spots set status = 'accepted' where id = $1", [SPOT]));
  t.refused(PG, "cannot add a date spot", await member(P1.id, "insert into date_spots (session_id, place_id, name, address, category) values ($1, 'y', 'Park', 'Ikoyi', 'park')", [S2]));
  t.refused(PG, "cannot message their match", await member(P1.id, "insert into messages (thread_id, sender_id, body) values ($1, $2, 'hi')", [T1, P1.id]));
  t.refused(PG, "no date can be arranged with them, even server-side",
    await service("insert into date_commitments (member_a, member_b, scheduled_for) values ($1, $2, now() + interval '3 days')", [P1.id, L1.id]), "PT403");

  // --- decided 2026-10-05: what stays open while paused ------------------------
  const D = "paused, but still open (2026-10-05 ruling)";
  t.ok(D, "P1 sees their coin history", await member(P1.id, "select id from coin_ledger"), 1);
  t.record(D, "P1's balance reads correctly", t.value(await member(P1.id, "select coin_balance($1)", [P1.id])) === 50);
  t.ok(D, "a coin purchase can still be credited to P1", await service("insert into coin_ledger (profile_id, delta, kind) values ($1, 20, 'purchase')", [P1.id]), 1);
  t.ok(D, "a plan can still be granted to P1", await service("insert into entitlements (profile_id, tier, source) values ($1, 'premium', 'subscription')", [P1.id]), 1);
  t.ok(D, "M1 still sees their Couple Mode space", await member(M1.id, "select id from couples where id = $1", [COUPLE]), 1);
  t.ok(D, "M1 can still log a milestone", await member(M1.id, "insert into couple_milestones (couple_id, kind, occurred_on, created_by) values ($1, 'official', current_date, $2)", [COUPLE, M1.id]), 1);
  t.ok(D, "…and read the shared timeline", await member(M1.id, "select id from couple_milestones where couple_id = $1", [COUPLE]), 1);

  // --- a member cannot make themselves live ------------------------------------
  const H = "self-promotion blocked";
  t.refused(H, "N1 cannot write stage", await member(N1.id, "update profiles set stage = 'id_confirmed' where id = $1", [N1.id]), "42501");
  t.refused(H, "N1 cannot point main_photo_id at a photo", await member(N1.id, "update profiles set main_photo_id = $2 where id = $1", [N1.id, N1.photos[1].id]), "42501");
  t.refused(H, "N1 cannot set first_live_at", await member(N1.id, "update profiles set first_live_at = now() where id = $1", [N1.id]), "42501");
  t.refused(H, "N1 cannot mark a photo face-matched", await member(N1.id, "update profile_photos set face_match = 'matched' where id = $1", [N1.photos[1].id]), "42501");
  t.refused(H, "N1 cannot repoint a matched photo at a new file", await member(N1.id, "update profile_photos set storage_path = $2 where id = $1", [N1.photos[0].id, `${N1.id}/stolen.jpg`]), "42501");
  await member(N1.id, "insert into profile_photos (profile_id, storage_path, face_match) values ($1, $2, 'matched')", [N1.id, `${N1.id}/forged.jpg`]);
  t.record(H, "a photo inserted as 'matched' is stored as unchecked",
    (await root("select face_match from profile_photos where storage_path = $1", [`${N1.id}/forged.jpg`])).rows[0]?.face_match === "unchecked");
  await root("delete from profile_photos where storage_path = $1", [`${N1.id}/forged.jpg`]);
  t.refused(H, "N1 cannot record their own face match", await member(N1.id, "select record_main_photo_match($1, 'matched')", [N1.photos[1].id]), "42501");
  const fileDel = await member(N1.id, "delete from storage.objects where name = $1", [N1.photos[0].path]);
  const fileLeft = (await root("select 1 from storage.objects where name = $1", [N1.photos[0].path])).rowCount;
  t.record(H, "N1 cannot delete the file under a matched photo", fileDel.count === 0 && fileLeft === 1, `file still there: ${fileLeft === 1}`);
  t.refused(H, "N1 cannot re-upload over a matched photo's path",
    await member(N1.id, "insert into storage.objects (bucket_id, name, owner) values ('profile-photos', $1, $2)", [N1.photos[0].path, N1.id]));
  t.refused(H, "no member can settle a date commitment", await member(L1.id, "select settle_commitment(gen_random_uuid(), 'completed')"), "42501");
  t.refused(H, "a live member cannot build someone else's feed", await member(L2.id, "select * from build_daily_feed($1)", [L1.id]), "42501");

  // --- live controls -------------------------------------------------------------
  const C = "live control";
  const hidden = [N1.id, P1.id, M1.id];
  t.record(C, "L1's feed built while P1/M1 were live included them", [P1.id, M1.id].some((h) => t.ids(L1feedBefore).includes(h)));
  const feedAfter = await member(L1.id, "select candidate_id from build_daily_feed($1)", [L1.id]);
  t.record(C, "same-day feed now drops the hidden profiles",
    !feedAfter.error && t.ids(feedAfter).length > 0 && !t.ids(feedAfter).some((x) => hidden.includes(x)),
    feedAfter.error ?? `${t.ids(feedAfter).length} candidates, none hidden`);
  const others = await member(L1.id, "select id from profiles where id <> $1", [L1.id]);
  t.record(C, "L1 sees live members, never a hidden one", !others.error && others.count >= 3 && !t.ids(others).some((x) => hidden.includes(x)), `${others.count} visible`);
  t.ok(C, "L1 reads L2's photos", await member(L1.id, "select id from profile_photos where profile_id = $1", [L2.id]), 4);
  t.empty(C, "L1 cannot see a hidden member's photos", await member(L1.id, "select id from profile_photos where profile_id = $1", [P1.id]));
  const l2answer = t.value(await member(L1.id, "select id from prompt_answers where profile_id = $1", [L2.id]));
  t.ok(C, "L1 replies to L2's answer", await member(L1.id, "insert into replies (sender_id, recipient_id, prompt_answer_id, kind, body) values ($1, $2, $3, 'text', 'Jollof take?')", [L1.id, L2.id, l2answer]), 1);
  t.ok(C, "L1 proposes a Gist to L2", await member(L1.id, "insert into gist_sessions (proposer_id, invitee_id) values ($1, $2)", [L1.id, L2.id]), 1);
  t.refused(C, "L1 cannot propose a Gist to hidden N1", await member(L1.id, "insert into gist_sessions (proposer_id, invitee_id) values ($1, $2)", [L1.id, N1.id]));
  t.refused(C, "L1 cannot mark ready on a session with hidden P1", await member(L1.id, "update gist_sessions set proposer_ready_at = now() where id = $1", [S1]), "PT403");
  t.ok(C, "L1 can still cancel that session", await member(L1.id, "update gist_sessions set status = 'cancelled' where id = $1", [S1]), 1);
  t.ok(C, "L3 gets the locked-inbox count", await member(L3.id, "select unread_count()"), 1);

  // --- restoring un-pauses -------------------------------------------------------
  const RS = "restore";
  await t.addPhoto(P1, "e");
  const p1s = await t.status(P1);
  t.record(RS, "P1 adds a fourth photo and is live again", p1s?.live === true, JSON.stringify({ live: p1s?.live, photos: p1s?.photo_count }));
  t.ok(RS, "P1's feed works again", await member(P1.id, "select * from build_daily_feed($1)", [P1.id]), 1);
  t.ok(RS, "P1 reads their sessions again", await member(P1.id, "select id from gist_sessions"), 1);

  // --- replacing the main photo ----------------------------------------------------
  const RP = "main-photo replacement";
  const oldMain = R1.photos[0];
  const newId = await t.addPhoto(R1, "new");
  await member(R1.id, "select nominate_main_photo($1)", [newId]);
  let s = await t.status(R1);
  t.record(RP, "while the new photo is checked, R1 stays live", s?.live === true && s?.replacement_checking === true);
  let seen = t.ids(await member(L2.id, "select id from profile_photos where profile_id = $1", [R1.id]));
  t.record(RP, "others still see the old matched main photo", seen.includes(oldMain.id));
  t.record(RP, "others cannot see the unchecked replacement row", !seen.includes(newId));
  t.empty(RP, "others cannot fetch the replacement file", await member(L2.id, "select name from storage.objects where name = $1", [`${R1.id}/new.jpg`]));
  t.ok(RP, "R1 can see their own replacement file", await member(R1.id, "select name from storage.objects where name = $1", [`${R1.id}/new.jpg`]), 1);
  await service("select record_main_photo_match($1, 'matched')", [newId]);
  const mainOf = async () => (await root("select main_photo_id from profiles where id = $1", [R1.id])).rows[0].main_photo_id;
  t.record(RP, "once it matches, it replaces the old main photo", (await mainOf()) === newId && (await t.status(R1))?.live === true);
  t.record(RP, "and others now see it", t.ids(await member(L2.id, "select id from profile_photos where profile_id = $1", [R1.id])).includes(newId));
  const mis = await t.addPhoto(R1, "mismatch");
  await member(R1.id, "select nominate_main_photo($1)", [mis]);
  await service("select record_main_photo_match($1, 'mismatch')", [mis]);
  t.record(RP, "a mismatch leaves the matched main photo live", (await t.status(R1))?.live === true && (await mainOf()) === newId);
  const rev = await t.addPhoto(R1, "review");
  await member(R1.id, "select nominate_main_photo($1)", [rev]);
  await service("select record_main_photo_match($1, 'review')", [rev]);
  s = await t.status(R1);
  t.record(RP, "a borderline result goes to review, not rejection; still live", s?.live === true && s?.replacement_checking === true);
}

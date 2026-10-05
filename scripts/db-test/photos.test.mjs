/**
 * Prompt 14 photo rules (0015): the limit, the two "couldn't confirm"
 * reasons, review, replace-on-match, private candidates, verification drift,
 * and the new report category.
 */
export default async function photos(t) {
  const { member, service, root } = t;
  const G = "photos (Prompt 14)";

  const A = await t.makeLive("Photo A");
  const viewer = await t.makeLive("Viewer");

  // --- the limit: six visible, plus one replacement in flight ---------------
  await t.addPhoto(A, "e");
  await t.addPhoto(A, "f");
  const seventh = await member(A.id, "insert into profile_photos (profile_id, storage_path) values ($1, $2)", [A.id, `${A.id}/g.jpg`]);
  t.ok(G, "a seventh row is allowed (a replacement main photo in flight)", seventh, 1);
  t.refused(G, "an eighth is refused", await member(A.id, "insert into profile_photos (profile_id, storage_path) values ($1, $2)", [A.id, `${A.id}/h.jpg`]), "23514");
  await root("delete from profile_photos where storage_path in ($1, $2)", [`${A.id}/g.jpg`, `${A.id}/e.jpg`]);
  A.photos = A.photos.filter((p) => !["e"].includes(p.label));

  // --- the member can't write the reason either --------------------------------
  t.refused(G, "a member cannot write a face-match reason", await member(A.id, "update profile_photos set face_match_reason = 'not_matching' where id = $1", [A.photos[1].id]), "42501");

  // --- "face not clear": private, not counted, can be kept as another photo -----
  const oldMain = A.photos[0];
  const blurry = await t.addPhoto(A, "blurry");
  await member(A.id, "select nominate_main_photo($1)", [blurry]);
  await service("select record_main_photo_match($1, 'mismatch', 'face_not_clear')", [blurry]);
  const check = t.value(await member(A.id, "select main_photo_check()"));
  t.record(G, "the member is told 'face not clear'", check?.candidate_id === blurry && check?.candidate_reason === "face_not_clear");
  t.record(G, "the old main photo stays live", (await t.status(A))?.live === true && check?.main_photo_id === oldMain.id);
  t.record(G, "an unconfirmed candidate isn't counted toward the six",
    (await t.status(A))?.photo_count === 5);
  t.record(G, "…and isn't shown to anyone else",
    !t.ids(await member(viewer.id, "select id from profile_photos where profile_id = $1", [A.id])).includes(blurry));
  t.empty(G, "…nor is its file", await member(viewer.id, "select name from storage.objects where name = $1", [`${A.id}/blurry.jpg`]));
  t.refused(G, "'face not clear' can't be sent to a person", await member(A.id, "select request_photo_review($1)", [blurry]), "42501");
  t.ok(G, "'Use it as another photo' keeps it", await member(A.id, "select keep_as_other_photo($1)", [blurry]), 1);
  t.record(G, "…and now it counts and shows",
    (await t.status(A))?.photo_count === 6 &&
    t.ids(await member(viewer.id, "select id from profile_photos where profile_id = $1", [A.id])).includes(blurry));
  await member(A.id, "delete from profile_photos where id = $1", [blurry]);

  // --- "doesn't look like your selfie" -> ask a person -----------------------------
  const unlike = await t.addPhoto(A, "unlike");
  await member(A.id, "select nominate_main_photo($1)", [unlike]);
  await service("select record_main_photo_match($1, 'mismatch', 'not_matching')", [unlike]);
  const drift = await root("select count(*)::int as n from trust_events where profile_id = $1 and kind = 'verification_drift'", [A.id]);
  t.record(G, "a later mismatch is a Sentinel 'verification drift' event", drift.rows[0].n >= 1, `${drift.rows[0].n} events`);
  t.ok(G, "'Ask a person to look' sends it to review", await member(A.id, "select request_photo_review($1)", [unlike]), 1);
  const inReview = t.value(await member(A.id, "select main_photo_check()"));
  t.record(G, "…and the member sees it's with a person", inReview?.candidate_state === "review");
  t.record(G, "…while the old main photo stays live", (await t.status(A))?.live === true);

  // --- a person approves: replace, and the old main photo goes -------------------
  const replaced = t.value(await service("select record_main_photo_match($1, 'matched')", [unlike]));
  t.record(G, "a match replaces the main photo and returns the old file to delete", replaced === oldMain.path, String(replaced));
  t.record(G, "…the old main photo row is gone",
    (await root("select 1 from profile_photos where id = $1", [oldMain.id])).rowCount === 0);
  t.record(G, "…and the profile is still live", (await t.status(A))?.live === true);

  // --- a mismatch with no main photo yet is not "drift" ---------------------------
  const B = await t.makeMember("First Main");
  for (const l of ["a", "b", "c", "d"]) await t.addPhoto(B, l);
  await member(B.id, "select nominate_main_photo($1)", [B.photos[0].id]);
  await service("select record_main_photo_match($1, 'mismatch', 'not_matching')", [B.photos[0].id]);
  const firstDrift = await root("select count(*)::int as n from trust_events where profile_id = $1 and kind = 'verification_drift'", [B.id]);
  t.record(G, "a first main photo that doesn't match is not drift", firstDrift.rows[0].n === 0);
  t.record(G, "…and that member isn't live", (await t.status(B))?.live === false);

  // --- the new report category ------------------------------------------------------
  t.ok(G, "'these photos aren't them' can be reported",
    await member(viewer.id, "insert into reports (reporter_id, reported_id, reason) values ($1, $2, 'photos_not_them')", [viewer.id, A.id]), 1);
}

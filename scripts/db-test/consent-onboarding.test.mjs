/**
 * 0017: consent records with their version, and the ONE onboarding selfie
 * that settles Verified Real and the main photo together.
 */
import { randomUUID } from "node:crypto";

export default async function consentOnboarding(t) {
  const { member, service, root } = t;

  // A member at the start of the new order: phone confirmed, not Verified
  // Real, four photos with a main photo chosen and waiting for the selfie.
  async function onboarding(name) {
    const id = randomUUID();
    await root("insert into auth.users (id, raw_user_meta_data, phone_confirmed_at) values ($1, $2, now())", [id, { display_name: name }]);
    await root("update profiles set stage = 'phone_verified', phone_verified_at = now() where id = $1", [id]);
    const m = { id, name, photos: [] };
    for (const l of ["a", "b", "c", "d"]) await t.addPhoto(m, l);
    await member(id, "select nominate_main_photo($1)", [m.photos[0].id]);
    return m;
  }

  // --- consents ------------------------------------------------------------------
  const C = "consent records";
  const A = await onboarding("Consenter");
  const B = await onboarding("Someone else");
  t.ok(C, "a member records their own consent with a version",
    await member(A.id, "insert into consents (profile_id, kind, version) values ($1, 'verification_selfie', '2026-10-05')", [A.id]), 1);
  t.refused(C, "nobody records consent for someone else",
    await member(A.id, "insert into consents (profile_id, kind, version) values ($1, 'id_check', '2026-10-05')", [B.id]), "42501");
  t.empty(C, "a consent can't be edited afterwards",
    await member(A.id, "update consents set version = 'forged' where profile_id = $1", [A.id]));
  t.empty(C, "…or deleted", await member(A.id, "delete from consents where profile_id = $1", [A.id]));
  t.empty(C, "members read only their own", await member(B.id, "select * from consents where profile_id = $1", [A.id]));

  // --- the one onboarding selfie -------------------------------------------------
  const O = "one onboarding selfie";
  const before = t.value(await member(A.id, "select main_photo_check()"));
  t.record(O, "before the selfie the main photo waits — 'not checked yet', not 'checking'",
    before?.candidate_state === "pending" && before?.check_running === false);
  t.refused(O, "a member cannot record their own selfie result",
    await member(A.id, "select record_onboarding_check($1, 'passed', 'matched')", [A.photos[0].id]), "42501");

  await root("insert into face_match_jobs (profile_id, photo_id, check_id, step) values ($1, $2, gen_random_uuid(), 'onboard')", [A.id, A.photos[0].id]);
  t.record(O, "while Smile ID runs, the member sees 'checking'",
    t.value(await member(A.id, "select main_photo_check()"))?.check_running === true);

  await service("select record_onboarding_check($1, 'passed', 'matched')", [A.photos[0].id]);
  const a = t.value(await member(A.id, "select live_profile_status()"));
  t.record(O, "one pass: Verified Real AND the main photo matched — and live", a?.verified_real === true && a?.main_photo === "matched" && a?.live === true);

  // Live, but the photo isn't them: the seal is earned, the profile stays hidden.
  const N = await onboarding("Not My Photo");
  await service("select record_onboarding_check($1, 'passed', 'mismatch', 'not_matching')", [N.photos[0].id]);
  const n = t.value(await member(N.id, "select live_profile_status()"));
  t.record(O, "live but not their photo: Verified Real, still hidden", n?.verified_real === true && n?.live === false);
  t.record(O, "…told 'doesn't look like your selfie'",
    t.value(await member(N.id, "select main_photo_check()"))?.candidate_reason === "not_matching");

  // Couldn't read the images: nothing recorded as passed.
  const R = await onboarding("Retake");
  await service("select record_onboarding_check($1, 'retake', 'mismatch', 'face_not_clear')", [R.photos[0].id]);
  t.record(O, "a retake records no pass", t.value(await member(R.id, "select live_profile_status()"))?.verified_real === false);

  // A person decides: nothing recorded yet, the photo stays private and pending.
  const V = await onboarding("Reviewed");
  await service("select record_onboarding_check($1, 'review', 'review')", [V.photos[0].id]);
  const v = t.value(await member(V.id, "select main_photo_check()"));
  t.record(O, "under review: no pass yet, the photo is with a person",
    t.value(await member(V.id, "select live_profile_status()"))?.verified_real === false && v?.candidate_state === "review");

  // Never a skip: no phone, no seal.
  const P = randomUUID();
  await root("insert into auth.users (id, raw_user_meta_data) values ($1, '{}')", [P]);
  const pm = { id: P, photos: [] };
  for (const l of ["a", "b", "c", "d"]) await t.addPhoto(pm, l);
  await member(P, "select nominate_main_photo($1)", [pm.photos[0].id]);
  await service("select record_onboarding_check($1, 'passed', 'matched')", [pm.photos[0].id]);
  t.record(O, "without a confirmed phone, a pass doesn't award the seal",
    t.value(await member(P, "select live_profile_status()"))?.verified_real === false);
}

/**
 * Download your data and delete your account (0016) — the privacy policy's
 * promises, and the lines they must not cross.
 */
export default async function dataRights(t) {
  const { member, service, root } = t;

  // --- export ------------------------------------------------------------------
  const X = "download your data";
  const S = await t.makeLive("Starter Reader");
  await root("delete from entitlements where profile_id = $1 and source = 'manual_grant'", [S.id]); // Starter now
  const P = await t.makeLive("Premium Sender");
  const [a, b] = [S.id, P.id].sort();
  const thread = (await root("insert into threads (member_a, member_b) values ($1, $2) returning id", [a, b])).rows[0].id;
  await root("insert into messages (thread_id, sender_id, body) values ($1, $2, 'a locked hello')", [thread, P.id]);

  const sDoc = t.value(await member(S.id, "select export_my_data()"));
  const sText = JSON.stringify(sDoc);
  t.record(X, "Starter: a locked message's text is not in the export", !sText.includes("a locked hello"));
  t.record(X, "Starter: nor is who sent it", !sText.includes(P.id));
  t.record(X, "Starter: just the count", sDoc?.messages_waiting_unread === 1, String(sDoc?.messages_waiting_unread));
  const pDoc = t.value(await member(P.id, "select export_my_data()"));
  t.record(X, "the sender's export has their own message", JSON.stringify(pDoc).includes("a locked hello"));

  // The other side of "continue?" stays private (0003).
  const gs = (await root("insert into gist_sessions (proposer_id, invitee_id, status) values ($1, $2, 'completed') returning id", [S.id, P.id])).rows[0].id;
  await root("insert into gist_outcomes (session_id, profile_id, wants_to_continue) values ($1, $2, true), ($1, $3, false)", [gs, S.id, P.id]);
  const session = t.value(await member(S.id, "select export_my_data()"))?.gist_sessions?.[0];
  t.record(X, "a Gist shows your own 'continue?' answer", session?.your_answer_to_continue === true);
  t.record(X, "…and never theirs, nor who they are", session && !("their_answer" in session) && !JSON.stringify(session).includes(P.id));
  t.record(X, "Sentinel events are never in a member's export", !/trust_event|verification_recheck|gist_invitation/.test(sText));
  t.record(X, "the export says what it leaves out", Array.isArray(sDoc?.not_included) && sDoc.not_included.length >= 3);

  // Always open: a member whose access is paused can still take their data.
  await member(S.id, "delete from profile_photos where id = $1", [S.photos[3].id]);
  t.record(X, "a paused member can still download their data",
    (await t.status(S))?.live === false && Boolean(t.value(await member(S.id, "select export_my_data()"))?.profile));

  // --- deletion ------------------------------------------------------------------
  const D = "delete your account";
  const leaver = await t.makeLive("Leaver");
  const partner = await t.makeLive("Partner");
  const dater = await t.makeLive("Dater");

  const [ca, cb] = [leaver.id, partner.id].sort();
  await root("insert into couples (member_a, member_b, proposed_by, status, a_accepted_at, b_accepted_at, started_at) values ($1, $2, $3, 'active', now(), now(), now())", [ca, cb, leaver.id]);
  await root("update profiles set paused = true where id in ($1, $2)", [leaver.id, partner.id]);
  const date = (await root(
    "insert into date_commitments (member_a, member_b, scheduled_for, status, a_staked_at, b_staked_at, created_by) values ($1, $2, now() + interval '2 days', 'confirmed', now(), now(), $1) returning id",
    [leaver.id, dater.id],
  )).rows[0].id;
  await root("insert into payments (profile_id, provider, provider_ref, amount_minor, currency, purpose) values ($1, 'paystack', 'ref-leaver', 150000, 'NGN', 'premium')", [leaver.id]);
  await root("insert into reports (reporter_id, reported_id, reason) values ($1, $2, 'harassment'), ($2, $1, 'other')", [dater.id, leaver.id]);

  t.refused(D, "a member cannot run the deletion step themselves", await member(leaver.id, "select prepare_account_deletion($1)", [leaver.id]), "42501");

  const prep = t.value(await service("select prepare_account_deletion($1)", [leaver.id]));
  t.record(D, "it returns the photo files to delete", prep?.photo_paths?.length === 4, `${prep?.photo_paths?.length} paths`);
  const del = await root("delete from auth.users where id = $1", [leaver.id]);
  t.record(D, "the account deletes cleanly", del.rowCount === 1);
  t.record(D, "the profile is gone", (await root("select 1 from profiles where id = $1", [leaver.id])).rowCount === 0);
  t.record(D, "Couple Mode ended and the partner is un-paused",
    (await root("select paused from profiles where id = $1", [partner.id])).rows[0].paused === false);
  t.record(D, "the other person's date stake came back",
    (await root("select 1 from coin_ledger where profile_id = $1 and commitment_id = $2 and kind = 'stake_return'", [dater.id, date])).rowCount === 1);
  const pay = (await root("select profile_id, account_deleted_at from payments where provider_ref = 'ref-leaver'")).rows[0];
  t.record(D, "the payment record is kept, de-linked", pay && pay.profile_id === null && pay.account_deleted_at !== null);
  const reps = (await root("select reporter_id, reported_id, account_deleted_at from reports where account_deleted_at is not null and (reporter_id = $1 or reported_id = $1)", [dater.id])).rows;
  t.record(D, "both reports are kept as safety records, de-linked", reps.length === 2 && reps.every((r) => r.reporter_id === null || r.reported_id === null));
  t.record(D, "the erasure is logged with no personal data",
    (await root("select payments_kept, reports_kept from account_deletions where profile_id = $1", [leaver.id])).rows[0]?.reports_kept === 2);
  t.record(D, "everyone else is untouched",
    (await root("select count(*)::int as n from profiles where id in ($1, $2)", [partner.id, dater.id])).rows[0].n === 2);
}

/**
 * Prompt 17 (0019): the coin balance and date attendance. Includes the
 * test the prompt requires — a member who reports or cancels for safety
 * can never lose coins.
 */
import { randomUUID } from "node:crypto";

export default async function coinsDates(t) {
  const { member, service, root } = t;
  const C = "coin balance";
  const D = "dates and attendance";
  const S = "safety never costs coins";

  const VENUE = { lat: 6.4474, lng: 3.4211 }; // Ikoyi
  const NEAR = { lat: 6.4479, lng: 3.4214 }; // ~60 m away
  const FAR = { lat: 6.5244, lng: 3.3792 }; // Yaba, ~9 km

  const balance = async (m) => t.value(await member(m.id, "select coin_balance($1)", [m.id]));
  const stakeable = async (m) => t.value(await member(m.id, "select stakeable_balance($1)", [m.id]));
  const buy = (m, n) => service("select credit_coin_purchase($1, $2, null)", [m.id, n]);

  const A = await t.makeLive("Amaka");
  const B = await t.makeLive("Femi");
  await buy(A, 50);
  await buy(B, 50);
  await service("select grant_promotional_coins($1, 15, null)", [A.id]);

  // A Gist both wanted to continue, and a spot they both accepted.
  const session = (await root("insert into gist_sessions (proposer_id, invitee_id, status) values ($1, $2, 'completed') returning id", [A.id, B.id])).rows[0].id;
  await root("insert into gist_outcomes (session_id, profile_id, wants_to_continue) values ($1, $2, true), ($1, $3, true)", [session, A.id, B.id]);
  const spot = (await root(
    "insert into date_spots (session_id, place_id, name, address, category, lat, lng, status) values ($1, 'neo', 'Café Neo', 'Awolowo Road', 'cafe', $2, $3, 'accepted') returning id",
    [session, VENUE.lat, VENUE.lng],
  )).rows[0].id;

  // --- the balance ------------------------------------------------------------
  t.record(C, "purchased and bonus coins are separate", (await stakeable(A)) === 50 && (await balance(A)) === 65);
  t.refused(C, "the ledger can't be edited", await service("update coin_ledger set delta = 999 where profile_id = $1", [A.id]), "42501");
  t.refused(C, "…or have rows removed", await service("delete from coin_ledger where profile_id = $1", [A.id]), "42501");
  t.refused(C, "a member can't credit themselves", await member(A.id, "select credit_coin_purchase($1, 100, null)", [A.id]), "42501");
  t.refused(C, "there's no withdrawal of any kind", await member(A.id, "select withdrawable_balance($1)", [A.id]), "42883");

  // --- arranging and staking ------------------------------------------------------
  const newDate = async (when, stake = 10) =>
    t.value(await member(A.id, "select create_date($1, $2, $3)", [spot, when, stake]));
  const at = (hours) => new Date(Date.now() + hours * 3600e3).toISOString();
  const stakeBoth = async (id) => {
    await member(A.id, "select stake_date($1)", [id]);
    await member(B.id, "select stake_date($1)", [id]);
  };
  const dateRow = async (id) => (await root("select * from date_commitments where id = $1", [id])).rows[0];

  const d1 = await newDate(at(48));
  t.record(D, "a date is arranged from an accepted spot", Boolean(d1));
  await member(A.id, "select stake_date($1)", [d1]);
  t.record(D, "staking takes purchased coins only", (await stakeable(A)) === 40 && (await balance(A)) === 55);
  t.record(D, "one stake in: waiting for the other", (await dateRow(d1)).status === "pending");
  await member(B.id, "select stake_date($1)", [d1]);
  t.record(D, "both staked: the date is on", (await dateRow(d1)).status === "confirmed");

  const Poor = await t.makeLive("Bonus only");
  await service("select grant_promotional_coins($1, 30, null)", [Poor.id]);
  const [pa, pb] = [Poor.id, B.id];
  const ps = (await root("insert into gist_sessions (proposer_id, invitee_id, status) values ($1, $2, 'completed') returning id", [pa, pb])).rows[0].id;
  await root("insert into gist_outcomes (session_id, profile_id, wants_to_continue) values ($1, $2, true), ($1, $3, true)", [ps, pa, pb]);
  const pspot = (await root("insert into date_spots (session_id, place_id, name, address, category, lat, lng, status) values ($1, 'p', 'Café', 'Yaba', 'cafe', 6.5, 3.38, 'accepted') returning id", [ps])).rows[0].id;
  const pd = t.value(await member(Poor.id, "select create_date($1, $2, 10)", [pspot, at(48)]));
  t.refused(D, "bonus coins can't be staked", await member(Poor.id, "select stake_date($1)", [pd]));

  // --- cancelling ------------------------------------------------------------------
  t.record(D, "cancelling before the cut-off is free", t.value(await member(A.id, "select cancel_date($1)", [d1])) === "free");
  t.record(D, "…both stakes come back", (await stakeable(A)) === 50 && (await stakeable(B)) === 50);

  const d2 = await newDate(at(3));
  await stakeBoth(d2);
  t.record(D, "cancelling after the cut-off is late", t.value(await member(A.id, "select cancel_date($1)", [d2])) === "late");
  t.record(D, "…the canceller's stake goes to the other person", (await stakeable(A)) === 40 && (await stakeable(B)) === 60);

  // --- check-in -----------------------------------------------------------------------
  const d3 = await newDate(at(1));
  await stakeBoth(d3);
  t.record(D, "check-in isn't open hours early", t.value(await member(A.id, "select check_in($1, $2, $3)", [d3, NEAR.lat, NEAR.lng])) === "outside_window");
  await root("update date_commitments set scheduled_for = now() where id = $1", [d3]);
  t.record(D, "far from the venue doesn't count", t.value(await member(A.id, "select check_in($1, $2, $3)", [d3, FAR.lat, FAR.lng])) === "too_far");
  t.record(D, "near the venue checks in", t.value(await member(A.id, "select check_in($1, $2, $3)", [d3, NEAR.lat, NEAR.lng])) === "checked_in");
  t.record(D, "both here: settled straight away", t.value(await member(B.id, "select check_in($1, $2, $3)", [d3, NEAR.lat, NEAR.lng])) === "both_here");
  t.record(D, "…and both stakes come back", (await stakeable(A)) === 40 && (await stakeable(B)) === 60);
  const cols = (await root("select column_name from information_schema.columns where table_name = 'date_commitments'")).rows.map((r) => r.column_name);
  t.record(D, "no location is stored — only the check-in time", !cols.some((c) => /lat|lng|location|coord/i.test(c)));

  // --- one absent ---------------------------------------------------------------------
  const past = async () => {
    const id = await newDate(at(1));
    await stakeBoth(id);
    await root("update date_commitments set scheduled_for = now() - interval '3 hours', a_checked_in_at = now() - interval '3 hours' where id = $1", [id]);
    await member(A.id, "select close_date_window($1)", [id]);
    return id;
  };
  const d4 = await past();
  const row4 = await dateRow(d4);
  t.record(D, "one absent: a provisional no-show with 24 hours to answer",
    row4.status === "provisional" && row4.absent_member === B.id && row4.contest_deadline);
  t.record(D, "…nothing moves yet", (await stakeable(A)) === 30 && (await stakeable(B)) === 50);
  await member(B.id, "select answer_no_show($1, 'came_up')", [d4]);
  t.record(D, "'Something came up': the stake goes, as they agreed", (await stakeable(A)) === 50 && (await stakeable(B)) === 50);

  const d5 = await past();
  await member(B.id, "select answer_no_show($1, 'was_there', 'I was inside at the back table')", [d5]);
  t.record(D, "'I was there': disputed, and nothing moves", (await dateRow(d5)).status === "disputed" && (await stakeable(B)) === 40);
  const dispute = (await root("select * from review_cases where source_id = $1 and kind = 'date'", [d5])).rows[0];
  t.record(D, "…a person gets a date-dispute case", Boolean(dispute));
  const staffId = randomUUID();
  await root("insert into auth.users (id, raw_user_meta_data) values ($1, '{}')", [staffId]);
  await root("insert into staff_members (user_id, display_name) values ($1, 'Kemi A.')", [staffId]);
  t.refused(D, "a dispute doesn't take 'clear'", await member(staffId, "select decide_case($1, 'clear', 'Both seem to have been there.')", [dispute.id]));
  await member(staffId, "select decide_case($1, 'both_attended', 'Both check-in screens opened inside the venue.')", [dispute.id]);
  t.record(D, "…'both attended' returns both stakes", (await stakeable(A)) === 40 + 10 && (await stakeable(B)) === 50);

  const d6 = await past();
  await root("update date_commitments set contest_deadline = now() - interval '1 minute' where id = $1", [d6]);
  await service("select settle_due_dates()");
  t.record(D, "no answer in 24 hours: the stake goes", (await dateRow(d6)).status === "no_show");

  // Toastly keeps nothing: every date's ledger rows sum to zero.
  // (This suite's dates only — other suites seed commitments directly,
  // without holding any coins.)
  const sums = (await root(
    "select l.commitment_id, sum(l.delta)::int as s from coin_ledger l join date_commitments d on d.id = l.commitment_id where $1 in (d.member_a, d.member_b) group by l.commitment_id",
    [A.id],
  )).rows;
  t.record(D, "Toastly never keeps a coin", sums.every((r) => r.s === 0), sums.map((r) => r.s).join(","));

  // --- safety ---------------------------------------------------------------------------
  const balancesBefore = async () => ({ a: await stakeable(A), b: await stakeable(B) });
  let before = await balancesBefore();
  const s1 = await newDate(at(2));
  await stakeBoth(s1);
  t.record(S, "a late SAFETY cancellation is free", t.value(await member(A.id, "select cancel_date($1, true)", [s1])) === "free");
  let now = await balancesBefore();
  t.record(S, "…the canceller loses nothing", now.a === before.a, `${before.a} -> ${now.a}`);

  before = await balancesBefore();
  const s2 = await newDate(at(24));
  await stakeBoth(s2);
  await member(A.id, "insert into reports (reporter_id, reported_id, reason) values ($1, $2, 'threats_or_coercion')", [A.id, B.id]);
  now = await balancesBefore();
  t.record(S, "a safety report returns the reporter's stake in full", now.a === before.a && (await dateRow(s2)).safety === true);

  before = await balancesBefore();
  const s3 = await past();
  await member(B.id, "select answer_no_show($1, 'unsafe')", [s3]);
  now = await balancesBefore();
  t.record(S, "'I didn't feel safe' after a no-show: their stake comes back in full", now.b === before.b);

  before = await balancesBefore();
  const s4 = await past();
  await member(B.id, "insert into reports (reporter_id, reported_id, reason) values ($1, $2, 'harassment')", [B.id, A.id]);
  now = await balancesBefore();
  t.record(S, "a report while marked absent: still never loses coins", now.b === before.b && (await dateRow(s4)).safety === true);

  // --- paying a plan with coins -------------------------------------------------------
  const P = "paying a plan with coins";
  t.refused(P, "a Diaspora (dollar) plan can never take coins", await member(A.id, "select coin_checkout_quote('diaspora')"));
  const q = t.value(await member(A.id, "select coin_checkout_quote('premium')"));
  t.record(P, "coins apply first, at ₦100 each", q?.coins_used === Math.min(35, (await balance(A))) && q?.price === 3500, JSON.stringify(q));
  const Rich = await t.makeLive("Abroad, coins");
  await root("update profiles set country_code = 'GB' where id = $1", [Rich.id]);
  await root("delete from entitlements where profile_id = $1 and source = 'manual_grant'", [Rich.id]); // Starter
  await buy(Rich, 40);
  t.refused(P, "a part-coin checkout waits for the card payment", await member(B.id, "select pay_plan_with_coins('premium_plus')"));
  t.ok(P, "a member abroad CAN pay a naira plan in coins — never blocked", await member(Rich.id, "select pay_plan_with_coins('premium')"), 1);
  t.record(P, "…a person is asked to look at it", (await root("select count(*)::int as n from review_cases where subject_ref = $1 and kind = 'pricing'", [Rich.id])).rows[0].n === 1);
  t.record(P, "…and the plan was granted", t.value(await member(Rich.id, "select current_tier($1)", [Rich.id])) === "premium");
}

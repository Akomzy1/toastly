/**
 * 0020: the women's offer follows where the member lives; "Open to people
 * living abroad" on a member in Nigeria's own six; the fallback notice only
 * for a city that isn't open; the brief holds only couple-entered fields.
 */
import { randomUUID } from "node:crypto";

export default async function abroadBrief(t) {
  const { member, root } = t;

  // --- the women's offer ------------------------------------------------------
  const G1 = "women's offer by country (0020)";
  const offer = async (id) =>
    (await root("select tier::text, ends_at from entitlements where profile_id = $1 and source = 'womens_launch_offer'", [id])).rows;

  const W = randomUUID();
  await root("insert into auth.users (id, raw_user_meta_data) values ($1, $2)", [W, { display_name: "Offer W", gender: "woman" }]);
  const atSignup = await offer(W);
  t.record(G1, "a woman in Nigeria gets 30 days of Premium Plus", atSignup.length === 1 && atSignup[0].tier === "premium_plus", atSignup[0]?.tier);

  t.ok(G1, "she can say she lives abroad", await member(W, "update profiles set country_code = 'GB' where id = $1", [W]), 1);
  const abroad = await offer(W);
  t.record(G1, "…and the offer becomes Diaspora Plus", abroad[0]?.tier === "diaspora_plus", abroad[0]?.tier);
  t.record(G1, "…with the same end date", String(abroad[0]?.ends_at) === String(atSignup[0]?.ends_at));
  t.record(G1, "…and it is her plan now", t.value(await member(W, "select current_tier($1)::text", [W])) === "diaspora_plus");

  await member(W, "update profiles set country_code = 'NG' where id = $1", [W]);
  t.record(G1, "moving home switches it back to Premium Plus", (await offer(W))[0]?.tier === "premium_plus");

  // A grant made while she already lives abroad is Diaspora Plus from the start.
  await member(W, "update profiles set country_code = 'US' where id = $1", [W]);
  await root("delete from entitlements where profile_id = $1 and source = 'womens_launch_offer'", [W]);
  await root("insert into entitlements (profile_id, tier, source, ends_at) values ($1, 'premium_plus', 'womens_launch_offer', now() + interval '30 days')", [W]);
  t.record(G1, "an offer granted to a woman abroad is Diaspora Plus", (await offer(W))[0]?.tier === "diaspora_plus");

  // An offer that has ended is history: a move doesn't rewrite it.
  await root("update entitlements set ends_at = now() - interval '1 day' where profile_id = $1 and source = 'womens_launch_offer'", [W]);
  await member(W, "update profiles set country_code = 'NG' where id = $1", [W]);
  t.record(G1, "an ended offer isn't changed by a later move", (await offer(W))[0]?.tier === "diaspora_plus");

  t.refused(G1, "a member still can't grant herself anything", await member(W, "insert into entitlements (profile_id, tier, source) values ($1, 'premium_plus', 'womens_launch_offer')", [W]));

  const M = randomUUID();
  await root("insert into auth.users (id, raw_user_meta_data) values ($1, $2)", [M, { display_name: "Offer M", gender: "man" }]);
  t.record(G1, "nobody else gets the offer", (await offer(M)).length === 0);

  // --- "Open to people living abroad" ------------------------------------------
  const G2 = "open to people living abroad (0020)";
  const viewerOn = await t.makeLive("Lagos On");
  const viewerOff = await t.makeLive("Lagos Off");
  const home = await t.makeLive("Lagos Home");

  // Abroad, Starter-equivalent plan: back home is the only pool, so they
  // want back-home matches.
  const backHome = await t.makeLive("London Back Home");
  await root("delete from entitlements where profile_id = $1", [backHome.id]);
  await root("insert into entitlements (profile_id, tier, source) values ($1, 'starter', 'default')", [backHome.id]);
  await root("update profiles set country_code = 'GB', diaspora_city = 'gb-london', pool = 'back_home' where id = $1", [backHome.id]);

  // Abroad, Diaspora plan, open city, diaspora only: doesn't want back home.
  const diasporaOnly = await t.makeLive("London Diaspora Only");
  await root("delete from entitlements where profile_id = $1", [diasporaOnly.id]);
  await root("insert into entitlements (profile_id, tier, source) values ($1, 'diaspora', 'manual_grant')", [diasporaOnly.id]);
  await root("update diaspora_cities set active = true where slug = 'gb-london'");
  await root("update profiles set country_code = 'GB', diaspora_city = 'gb-london', pool = 'diaspora' where id = $1", [diasporaOnly.id]);

  // Only these three are new to the viewers; everyone from earlier suites is
  // already "seen", so the six can't be crowded by chance.
  const fresh = [home.id, backHome.id, diasporaOnly.id];
  for (const v of [viewerOn, viewerOff]) {
    await root(
      "insert into seen_candidates (profile_id, candidate_id) select $1, id from profiles where id <> $1 and not (id = any($2::uuid[])) on conflict do nothing",
      [v.id, fresh],
    );
  }

  t.record(G2, "it is on by default", t.value(await member(viewerOn.id, "select open_to_abroad from profiles where id = $1", [viewerOn.id])) === true);
  t.ok(G2, "a member can switch it off", await member(viewerOff.id, "update profiles set open_to_abroad = false where id = $1", [viewerOff.id]), 1);

  const sixOn = t.ids(await member(viewerOn.id, "select candidate_id from build_daily_feed($1)", [viewerOn.id]));
  t.record(G2, "on: members abroad who want back home are in the six", sixOn.includes(backHome.id), `${sixOn.length} in the six`);
  t.record(G2, "on: members in Nigeria still are", sixOn.includes(home.id));
  t.record(G2, "on: members abroad who chose diaspora-only are not", !sixOn.includes(diasporaOnly.id));

  const sixOff = t.ids(await member(viewerOff.id, "select candidate_id from build_daily_feed($1)", [viewerOff.id]));
  t.record(G2, "off: members abroad are left out of their own six", !sixOff.includes(backHome.id) && sixOff.includes(home.id));

  // Their own filter only: the member who switched it off still appears to
  // members abroad looking back home.
  await root(
    "insert into seen_candidates (profile_id, candidate_id) select $1, id from profiles where id <> $1 and id <> $2 on conflict do nothing",
    [backHome.id, viewerOff.id],
  );
  const theirs = t.ids(await member(backHome.id, "select candidate_id from build_daily_feed($1)", [backHome.id]));
  t.record(G2, "switching it off never hides you from anyone", theirs.includes(viewerOff.id));

  // --- the fallback notice is about the city, not the plan ------------------------
  const G3 = "fallback notice vs plan (0020)";
  await root("update diaspora_cities set active = false where slug = 'gb-london'");
  await root("update profiles set pool = 'diaspora' where id = $1", [backHome.id]);
  t.record(G3, "abroad without a Diaspora plan: no 'city not open' notice",
    t.value(await member(backHome.id, "select pool_fallback_city($1)", [backHome.id])) == null);
  t.record(G3, "on a Diaspora plan in a closed city: the notice names the city",
    t.value(await member(diasporaOnly.id, "select pool_fallback_city($1)", [diasporaOnly.id])) === "London");
  t.record(G3, "a member abroad without the plan still wants back home",
    t.value(await root("select wants_back_home($1)", [backHome.id])) === true);

  // --- the brief: couple-entered fields only ---------------------------------------
  const G4 = "AriyaPlanner brief rule (0020)";
  const a = await t.makeLive("Brief A");
  const b = await t.makeLive("Brief B");
  const { rows } = await root(
    "insert into couples (member_a, member_b, proposed_by, status) values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid), $1, 'active') returning id",
    [a.id, b.id],
  );
  const couple = rows[0].id;
  t.ok(G4, "the couple can enter the PRD's brief fields",
    await member(a.id,
      "insert into couple_briefs (couple_id, wedding_city, rough_date, guest_count_band, budget_band, ceremony_formats) values ($1, 'Ibadan', 'December 2027', '200-300', 'mid', array['introduction','traditional'])",
      [couple]), 1);
  t.refused(G4, "a ceremony format outside the three is refused",
    await member(a.id, "update couple_briefs set ceremony_formats = array['court'] where couple_id = $1", [couple]), "23514");
  t.refused(G4, "genotype can't be tucked into the style notes",
    await member(a.id, "update couple_briefs set aesthetic = '{\"genotype\": \"AA\"}' where couple_id = $1", [couple]), "23514");
  t.refused(G4, "…or the budget cues",
    await member(b.id, "update couple_briefs set budget_cues = '{\"genotype\": \"AS\"}' where couple_id = $1", [couple]), "23514");
  t.empty(G4, "nobody outside the couple reads it",
    await member(home.id, "select * from couple_briefs where couple_id = $1", [couple]));
}

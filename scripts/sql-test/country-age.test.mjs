/**
 * Where a member lives, "Open to people living abroad" both ways, and the age
 * range (migration 0027) — against a throwaway Postgres (PGlite) with every
 * migration applied. Never production.
 *
 *   node --test scripts/sql-test/country-age.test.mjs
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { freshDb, as, asService, makeUser } from "./harness.mjs";

let db;
let gbCity;
before(async () => {
  db = await freshDb();
  gbCity = (await db.query("select slug from diaspora_cities where country_code = 'GB' limit 1")).rows[0].slug;
  await db.query("update diaspora_cities set active = true where slug = $1", [gbCity]);
});

async function member(name, { phone = null, gender = "prefer_not_to_say", dob = "1995-01-01" } = {}) {
  const id = await makeUser(db, { name, email: `${crypto.randomUUID()}@example.com`, gender, dob });
  await db.query("update auth.users set phone = $2 where id = $1", [id, phone]);
  await db.query("update profiles set stage = 'verified_real', phone_verified_at = now() where id = $1", [id]);
  return id;
}
const me = (id, sql, params) => as(db, id, (tx) => tx.query(sql, params));
const row = async (id) => (await db.query("select * from profiles where id = $1", [id])).rows[0];
const signals = async (id) => (await db.query("select signal::text, detail from integrity_reviews where profile_id = $1 order by created_at", [id])).rows;
const feed = async (id) => (await me(id, "select candidate_id from build_daily_feed($1)", [id])).rows.map((r) => r.candidate_id);
const reset = () => db.exec("delete from daily_feed; delete from seen_candidates;");
// Only these members are new to the viewer, so the six can't be crowded by chance.
const only = (viewer, ids) => db.query("insert into seen_candidates (profile_id, candidate_id) select $1, id from profiles where id <> $1 and not (id = any($2::uuid[])) on conflict do nothing", [viewer, ids]);

// --- Where you live -------------------------------------------------------------

test("confirming where you live sets it, logs it, and only works once", async () => {
  const m = await member("Confirm NG", { phone: "+2348031234567" });
  assert.equal((await row(m)).country_confirmed_at, null);
  await me(m, "select confirm_country('NG')");
  const p = await row(m);
  assert.equal(p.country_code, "NG");
  assert.ok(p.country_confirmed_at);
  assert.equal(p.country_changed_at, null, "the first answer doesn't start the 30-day clock");
  const log = (await db.query("select kind, to_country, phone_code from country_changes where profile_id = $1", [m])).rows;
  assert.deepEqual(log, [{ kind: "confirmed", to_country: "NG", phone_code: "234" }]);
  assert.deepEqual(await signals(m), [], "phone and country agree: nothing to review");
  await assert.rejects(me(m, "select confirm_country('GB')"), /already confirmed/);
});

test("members can't write their country directly", async () => {
  const m = await member("Direct Write");
  await assert.rejects(me(m, "update profiles set country_code = 'GB' where id = $1", [m]), /changed in settings/);
  await assert.rejects(me(m, "update profiles set country_confirmed_at = now() where id = $1", [m]), /changed in settings/);
  await assert.rejects(me(m, "insert into country_changes (profile_id, kind, to_country) values ($1, 'changed', 'GB')", [m]));
});

test("a member abroad picks a city in that country, or none", async () => {
  const m = await member("Abroad City", { phone: "+447700900412" });
  await assert.rejects(me(m, "select confirm_country('GB', 'us-new-york')"), /city in the country/);
  await me(m, "select confirm_country('GB', $1)", [gbCity]);
  const p = await row(m);
  assert.equal(p.country_code, "GB");
  assert.equal(p.diaspora_city, gbCity);
  const n = await member("Abroad No City", { phone: "+233201234567" });
  await me(n, "select confirm_country('GH')");
  assert.equal((await row(n)).country_code, "GH");
  await assert.rejects(me(n, "select change_country('ZZ')"), /from the list/);
});

test("a phone code that disagrees with where you live is a review signal, never a block", async () => {
  const m = await member("Phone Mismatch", { phone: "+2348039998888" });
  const r = (await me(m, "select confirm_country('GB', $1) as r", [gbCity])).rows[0].r;
  assert.equal(r.country, "GB", "saved all the same");
  assert.deepEqual((await signals(m)).map((s) => [s.signal, s.detail.phone_code, s.detail.country]), [["phone_country_mismatch", "234", "GB"]]);
  const item = (await db.query("select _case_reason(i) as r from review_items i where subject_id = $1", [m])).rows[0].r;
  assert.equal(item, "Says they live in the UK, but their phone number has a +234 code.");
});

test("changing where you live: once every 30 days, logged, and the women's offer follows", async () => {
  const w = await member("Mover", { phone: "+447700900111", gender: "woman" });
  await me(w, "select confirm_country('GB', $1)", [gbCity]);
  assert.equal((await db.query("select current_tier($1) as t", [w])).rows[0].t, "diaspora_plus");
  await assert.rejects(me(w, "select change_country('GB')"), /already where you live/);
  await me(w, "select change_country('NG')");
  const p = await row(w);
  assert.equal(p.country_code, "NG");
  assert.equal(p.diaspora_city, null);
  assert.equal(p.pool, "back_home");
  assert.ok(p.country_changed_at);
  assert.equal((await db.query("select current_tier($1) as t", [w])).rows[0].t, "premium_plus");
  await assert.rejects(me(w, "select change_country('US')"), /again on/);
  await db.query("update profiles set country_changed_at = now() - interval '31 days' where id = $1", [w]);
  await me(w, "select change_country('US')");
  const kinds = (await db.query("select kind, from_country, to_country from country_changes where profile_id = $1 order by created_at", [w])).rows;
  assert.deepEqual(kinds, [
    { kind: "confirmed", from_country: "NG", to_country: "GB" },
    { kind: "changed", from_country: "GB", to_country: "NG" },
    { kind: "changed", from_country: "NG", to_country: "US" },
  ]);
  await assert.rejects(db.query("update country_changes set to_country = 'CA' where profile_id = $1", [w]), /append-only/);
});

test("a plan on the old track runs to its period end and is marked to stop renewing", async () => {
  const m = await member("Plan Mover", { phone: "+2348030000001" });
  await me(m, "select confirm_country('NG')");
  await db.query(
    "insert into subscriptions (profile_id, provider, tier, provider_subscription_id, status, current_period_end) values ($1, 'paystack', 'premium', $2, 'active', now() + interval '12 days')",
    [m, `SUB_${crypto.randomUUID()}`]);
  const r = (await me(m, "select change_country('GB', $1) as r", [gbCity])).rows[0].r;
  assert.equal(r.track_changed, true);
  assert.equal(r.stop_renewing.length, 1);
  const sub = (await db.query("select status, track_changed_at from subscriptions where profile_id = $1", [m])).rows[0];
  assert.equal(sub.status, "active", "nothing ends early");
  assert.ok(sub.track_changed_at);
  const same = await member("Same Track", { phone: "+447700900222" });
  await me(same, "select confirm_country('GB', $1)", [gbCity]);
  await db.query("update profiles set country_changed_at = null where id = $1", [same]);
  const r2 = (await me(same, "select change_country('US') as r")).rows[0].r;
  assert.equal(r2.track_changed, false, "the UK to the US keeps dollar plans");
});

test("dollar payments: card and connection country are checked against where you live", async () => {
  const m = await member("Dollar Payer", { phone: "+447700900333" });
  await me(m, "select confirm_country('GB', $1)", [gbCity]);
  const ref = `tly_${crypto.randomUUID()}`;
  const sku = (await db.query("select sku from price_list where currency = 'USD' and kind = 'coin_pack' and active limit 1")).rows[0].sku;
  await asService(db, (tx) => tx.query("select payment_open($1, $2, 'pack', $3, 'NG', null)", [m, sku, ref]));
  const amount = (await db.query("select amount_minor from payments where provider_ref = $1", [ref])).rows[0].amount_minor;
  await asService(db, (tx) => tx.query("select payment_settle('stripe', $1, $2, 'USD', 'NG')", [ref, amount]));
  const s = await signals(m);
  assert.deepEqual(s.map((x) => [x.signal, x.detail.track]).sort(), [["ip_country_mismatch", "usd"], ["payment_geography_mismatch", "usd"]]);
  assert.equal((await db.query("select status from payments where provider_ref = $1", [ref])).rows[0].status, "succeeded", "never a block");
});

// --- "Open to people living abroad", both ways --------------------------------------

test("switched off: the member doesn't see members abroad, and they don't see the member", async () => {
  await reset();
  const closed = await member("Local Only");
  await me(closed, "select confirm_country('NG')");
  await me(closed, "update profiles set open_to_abroad = false where id = $1", [closed]);
  const open = await member("Local Open");
  await me(open, "select confirm_country('NG')");
  const abroad = await member("Abroad Looking Home", { phone: "+447700900444" });
  await me(abroad, "select confirm_country('GB', $1)", [gbCity]);
  await only(closed, [abroad, open]);
  assert.ok(!(await feed(closed)).includes(abroad), "not in their six");
  await only(abroad, [closed, open]);
  const theirs = await feed(abroad);
  assert.ok(!theirs.includes(closed), "and they aren't in the six of members abroad");
  assert.ok(theirs.includes(open), "members in Nigeria who left it on still are");
});

// --- Age range ------------------------------------------------------------------

test("the age range defaults around the member's own age, from config", async () => {
  const thisYear = new Date().getUTCFullYear();
  const m = await member("Age 29", { dob: `${thisYear - 29}-01-01` });
  const r = (await me(m, "select my_age_range() as r")).rows[0].r;
  assert.deepEqual([r.lo, r.hi, r.is_default], [25, 34, true], "four below, five above");
  const young = await member("Age 20", { dob: `${thisYear - 20}-01-01` });
  const y = (await me(young, "select my_age_range() as r")).rows[0].r;
  assert.deepEqual([y.lo, y.hi], [18, 27], "never below 18, at least nine years wide");
  await db.query("update match_config set age_below = 2, age_above = 2, age_min_span = 4");
  const c = (await me(m, "select my_age_range() as r")).rows[0].r;
  assert.deepEqual([c.lo, c.hi], [27, 31], "configurable");
  await db.query("update match_config set age_below = 4, age_above = 5, age_min_span = 9");
});

test("the age range filters only the member's own six, on every plan, and 70 means 70+", async () => {
  await reset();
  const thisYear = new Date().getUTCFullYear();
  const viewer = await member("Viewer 30", { dob: `${thisYear - 30}-01-01` });
  await me(viewer, "select confirm_country('NG')");
  const inRange = await member("Age 31", { dob: `${thisYear - 31}-01-01` });
  const tooOld = await member("Age 50", { dob: `${thisYear - 50}-01-01` });
  await db.query("update entitlements set ends_at = now() where profile_id = $1 and tier <> 'starter'", [viewer]);
  assert.equal((await db.query("select current_tier($1) as t", [viewer])).rows[0].t, "starter", "free plan");
  await only(viewer, [inRange, tooOld]);
  const six = await feed(viewer);
  assert.ok(six.includes(inRange));
  assert.ok(!six.includes(tooOld), "outside the default range");
  await reset();
  await me(tooOld, "update profiles set age_min = 18, age_max = 70 where id = $1", [tooOld]);
  await only(tooOld, [viewer]);
  assert.ok((await feed(tooOld)).includes(viewer), "the filter is the viewer's own; others still see them");
  await reset();
  await me(viewer, "update profiles set age_min = 25, age_max = 70 where id = $1", [viewer]);
  await only(viewer, [inRange, tooOld]);
  assert.ok((await feed(viewer)).includes(tooOld), "70 is 70+");
  await assert.rejects(me(viewer, "update profiles set age_min = 17, age_max = 30 where id = $1", [viewer]));
  await assert.rejects(me(viewer, "update profiles set age_min = 30, age_max = 30 where id = $1", [viewer]));
});

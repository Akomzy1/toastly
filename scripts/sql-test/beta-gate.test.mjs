/**
 * The founding-members beta (migration 0050) — against a throwaway Postgres
 * (PGlite) with every migration applied. Never production.
 *
 *   node --test scripts/sql-test/beta-gate.test.mjs
 *
 * Every rule is proved twice: the assertions pass on the real migration, and
 * they FAIL on a copy of it with that one rule taken out (a planted
 * violation). A test that still passes with its rule removed proves nothing.
 *
 *   - An application is stored only through beta_apply(); nobody can read or
 *     write the table; a number outside Lagos is waitlisted automatically and
 *     can never be approved while the beta is Lagos-only; one application per
 *     number, and a repeat looks exactly like the first.
 *   - The gate says yes only to an approved number.
 *   - Approvals stop at the cap; staff only; every change audited; a number is
 *     shown only while it is approved and unused.
 *   - Founding members: made when an approved applicant confirms their phone
 *     while the beta is open; the same three months for every wave and for a
 *     late joiner; the perk starts only when start_founding_perk runs, and
 *     running it twice changes nothing; nobody can read the table.
 *   - No stacking: a woman who is a founding member is not also given the
 *     30-day offer, and a member never holds two free grants.
 *   - Feedback, and the 90-day retention.
 */
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb, as, asService, makeUser, goLive } from "./harness.mjs";

const MIGRATION = path.resolve("supabase/migrations/0050_beta_gate.sql");
const SOURCE = fs.readFileSync(MIGRATION, "utf8");

/** A fresh database with 0050 applied, optionally with some of its text changed. */
async function dbWith(edits = []) {
  const db = await freshDb({ upTo: "0049" });
  let sql = SOURCE;
  for (const [from, to] of edits) {
    assert.ok(sql.includes(from), `planted edit not found: ${from.slice(0, 60)}`);
    sql = sql.split(from).join(to);
  }
  await db.exec(sql);
  await db.query("update beta_settings set applications_open_at = now() - interval '1 day'");
  return db;
}

/** The assertions must hold on the real migration and fail on the broken one. */
async function proves(name, edits, assertions) {
  await assertions(await dbWith(), "clean");
  let failed = false;
  try {
    await assertions(await dbWith(edits), "planted");
  } catch {
    failed = true;
  }
  assert.ok(failed, `planted violation not caught: ${name}`);
}

const hex = (n) => n.toString(16).padStart(64, "0");
const svc = (db, sql, params) => asService(db, (tx) => tx.query(sql, params));

/** An application through the real insert function. */
async function apply(db, n, over = {}) {
  const a = {
    first_name: "Ada", age: 27, gender: "woman", location_type: "lagos", lagos_area: "lekki", other_location: null,
    phone_e164: `+23480300000${String(n).padStart(2, "0")}`, phone_key: hex(n), source: "instagram", consent: true, ...over,
  };
  const r = await svc(db, "select beta_apply($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as r", [
    a.first_name, a.age, a.gender, a.location_type, a.lagos_area, a.other_location, a.phone_e164, a.phone_key, a.source, a.consent,
  ]);
  return r.rows[0].r;
}
const rowOf = async (db, n) => (await db.query("select * from beta_applications where phone_key = $1", [hex(n)])).rows[0];
const idOf = async (db, n) => (await rowOf(db, n)).id;
const approved = async (db, key) => (await svc(db, "select beta_number_approved($1) as ok", [key])).rows[0].ok;

async function staffMember(db) {
  const id = await makeUser(db, { name: "Staff Person", email: `${crypto.randomUUID()}@example.com`, gender: "woman" });
  await db.query("insert into staff_members (profile_id) values ($1)", [id]);
  return id;
}
const asStaff = (db, id, sql, params) => as(db, id, (tx) => tx.query(sql, params));
const decide = (db, staff, ids, status, wave = null) =>
  asStaff(db, staff, "select staff_beta_decide($1::uuid[], $2, $3) as r", [ids, status, wave]).then((r) => r.rows[0].r);

/** Approve numbers by owner-level update (the staff function has its own tests). */
const approveDirect = (db, n, wave = null) =>
  db.query("update beta_applications set status = 'approved', wave = $2 where phone_key = $1", [hex(n), wave]);

async function claimedMember(db, n, { gender = "woman", name = "Ada" } = {}) {
  const id = await makeUser(db, { name, email: `${crypto.randomUUID()}@example.com`, gender });
  const r = await svc(db, "select beta_claim($1, $2) as r", [id, hex(n)]);
  return { id, result: r.rows[0].r };
}
const isFounder = async (db, id) => (await db.query("select * from founding_members where user_id = $1", [id])).rows[0];

// --- 1. Applications ------------------------------------------------------------

test("an application is stored through beta_apply only; Lagos is pending, anywhere else is waitlisted at once", async () => {
  await proves("outside Lagos is waitlisted automatically", [
    ["case when s.lagos_only and p_location_type <> 'lagos' then 'waitlisted' else 'pending' end", "'pending'"],
  ], async (db) => {
    assert.equal(await apply(db, 1), "stored");
    assert.equal((await rowOf(db, 1)).status, "pending");
    assert.equal(await apply(db, 2, { location_type: "elsewhere_nigeria", lagos_area: null, other_location: "Abuja" }), "stored");
    assert.equal((await rowOf(db, 2)).status, "waitlisted", "elsewhere in Nigeria");
    assert.equal(await apply(db, 3, { location_type: "outside_nigeria", lagos_area: null, other_location: "United Kingdom" }), "stored");
    assert.equal((await rowOf(db, 3)).status, "waitlisted", "outside Nigeria");
  });
});

test("nothing but the listed fields is kept, and the table rejects what the form would", async () => {
  const db = await dbWith();
  const cols = (await db.query("select column_name from information_schema.columns where table_name = 'beta_applications' order by 1")).rows.map((r) => r.column_name);
  assert.deepEqual(cols, [
    "age", "approved_at", "consent_at", "created_at", "first_name", "gender", "id", "lagos_area", "location_type",
    "other_location", "phone_e164", "phone_key", "source", "status", "status_changed_at", "used_at", "wave",
  ], "no photo, ethnicity, religion, health or income column — and no more than the brief lists");
  await assert.rejects(apply(db, 1, { age: 17 }), "under 18");
  await assert.rejects(apply(db, 2, { gender: "other" }), "only the app's two options");
  await assert.rejects(apply(db, 3, { lagos_area: "narnia" }), "an area outside the list");
  await assert.rejects(apply(db, 4, { lagos_area: null }), "Lagos needs an area");
  await assert.rejects(apply(db, 5, { location_type: "elsewhere_nigeria", lagos_area: null, other_location: null }), "elsewhere needs a place");
  await assert.rejects(apply(db, 6, { phone_e164: "+447700900123" }), "only +234");
  await assert.rejects(apply(db, 7, { consent: false }), "consent is required");
});

test("one application per number, and a repeat looks exactly like the first", async () => {
  await proves("one application per number", [["unique check (char_length(phone_key) = 64)", "check (char_length(phone_key) = 64)"], ["on conflict (phone_key) do nothing", ""]],
    async (db) => {
      assert.equal(await apply(db, 1), "stored");
      const again = await apply(db, 1, { first_name: "Someone Else" });
      assert.equal(again, "duplicate");
      assert.equal((await db.query("select count(*)::int as n from beta_applications")).rows[0].n, 1);
      assert.equal((await rowOf(db, 1)).first_name, "Ada", "the first application is untouched");
    });
});

test("applications are closed until they open", async () => {
  const db = await dbWith();
  await db.query("update beta_settings set applications_open_at = now() + interval '1 day'");
  assert.equal(await apply(db, 1), "not_open");
  assert.equal((await db.query("select count(*)::int as n from beta_applications")).rows[0].n, 0);
});

test("nobody reads or writes applications, settings, the audit log or founding members through the API", async () => {
  const db = await dbWith();
  await apply(db, 1);
  const member = await makeUser(db, { name: "Member", email: "m@example.com", gender: "man" });
  const staff = await staffMember(db);
  for (const table of ["beta_applications", "beta_settings", "beta_audit_log", "founding_members", "beta_apply_attempts", "beta_feedback"]) {
    for (const who of [member, staff]) {
      await assert.rejects(as(db, who, (tx) => tx.query(`select * from ${table}`)), `${table}: no read`);
      await assert.rejects(as(db, who, (tx) => tx.query(`delete from ${table}`)), `${table}: no delete`);
    }
    await assert.rejects(as(db, null, (tx) => tx.query(`select * from ${table}`)), `${table}: not even signed out`);
  }
  await assert.rejects(as(db, member, (tx) => tx.query("select beta_apply('A',20,'man','lagos','lekki',null,'+2348030000099',$1,'friend',true)", [hex(99)])), "a member can't insert an application");
  await assert.rejects(as(db, member, (tx) => tx.query("select beta_number_approved($1)", [hex(1)])), "a member can't ask the gate");
  await assert.rejects(as(db, member, (tx) => tx.query("select beta_claim($1,$2)", [member, hex(1)])), "a member can't claim");
  await assert.rejects(as(db, staff, (tx) => tx.query("select start_founding_perk(current_date)")), "even staff can't start the perk from the screen");
});

test("our own rate limit: five an hour from one address, and the address is only a key", async () => {
  await proves("the per-address limit", [["ip_key = p_ip_key and at > now() - interval '1 hour') >= 5", "ip_key = p_ip_key and at > now() - interval '1 hour') >= 500"]],
    async (db) => {
      const allow = (key) => svc(db, "select beta_apply_allow($1) as ok", [key]).then((r) => r.rows[0].ok);
      for (let i = 0; i < 5; i++) assert.equal(await allow(hex(1)), true, `attempt ${i + 1}`);
      assert.equal(await allow(hex(1)), false, "the sixth in an hour");
      assert.equal(await allow(hex(2)), true, "another address is untouched");
      assert.equal(await allow("203.0.113.9"), false, "a raw address is refused: only keys are stored");
      await db.query("update beta_apply_attempts set at = at - interval '2 hours'");
      assert.equal(await allow(hex(1)), true, "an hour later it opens again");
    });
});

// --- 2. Outside Lagos can never be approved, and the gate -------------------------

test("a number outside Lagos is never approved while the beta is Lagos-only", async () => {
  await proves("the database refuses an approval outside Lagos", [
    ["if s.lagos_only and new.location_type <> 'lagos' then\n      raise exception 'The beta is open to Lagos only for now.' using errcode = '23514';\n    end if;", ""],
    ["if s.lagos_only and a.location_type <> 'lagos' then\n        raise exception 'The beta is open to Lagos only for now; outside Lagos stays on the waitlist.' using errcode = '23514';\n      end if;", ""],
  ], async (db) => {
    const staff = await staffMember(db);
    await apply(db, 1, { location_type: "elsewhere_nigeria", lagos_area: null, other_location: "Abuja" });
    await apply(db, 2, { location_type: "outside_nigeria", lagos_area: null, other_location: "Ghana" });
    await apply(db, 3);
    await assert.rejects(decide(db, staff, [await idOf(db, 1)], "approved"), "staff can't approve elsewhere in Nigeria");
    await assert.rejects(decide(db, staff, [await idOf(db, 2)], "approved"), "or outside Nigeria");
    await assert.rejects(decide(db, staff, [await idOf(db, 3), await idOf(db, 2)], "approved"), "a batch with one is refused whole");
    assert.equal((await rowOf(db, 3)).status, "pending", "and nothing in that batch changed");
    await assert.rejects(approveDirect(db, 1), "not even a direct update");
    assert.equal(await approved(db, hex(1)), false);
  });
});

test("the gate: only an approved number passes — pending, waitlisted, declined and never-applied all look the same", async () => {
  await proves("the gate answers yes only to approved", [["and a.status = 'approved'\n       and", "and a.status in ('approved', 'waitlisted')\n       and"]],
    async (db) => {
      const staff = await staffMember(db);
      await apply(db, 1); // pending
      await apply(db, 2); // approved
      await apply(db, 3); // declined
      await apply(db, 4); // waitlisted by staff
      await apply(db, 5, { location_type: "elsewhere_nigeria", lagos_area: null, other_location: "Abuja" }); // waitlisted at once
      await decide(db, staff, [await idOf(db, 2)], "approved", 1);
      await decide(db, staff, [await idOf(db, 3)], "declined");
      await decide(db, staff, [await idOf(db, 4)], "waitlisted");
      assert.equal(await approved(db, hex(2)), true);
      for (const [label, key] of [["pending", hex(1)], ["declined", hex(3)], ["waitlisted", hex(4)], ["waitlisted outside Lagos", hex(5)], ["never applied", hex(50)]]) {
        assert.equal(await approved(db, key), false, label);
      }
    });
});

test("the gate repeats the Lagos rule: a non-Lagos row marked approved still doesn't pass", async () => {
  await proves("beta_number_approved checks Lagos itself", [["and (a.location_type = 'lagos' or not s.lagos_only)", ""]],
    async (db) => {
      await apply(db, 1, { location_type: "outside_nigeria", lagos_area: null, other_location: "Ghana" });
      // Take the trigger away, to say 'approved' by some other route.
      await db.exec("alter table beta_applications disable trigger beta_application_guard");
      await db.query("update beta_applications set status = 'approved', approved_at = now() where phone_key = $1", [hex(1)]);
      assert.equal(await approved(db, hex(1)), false);
    });
});

// --- 3. Staff -------------------------------------------------------------------

test("approvals stop at the cap — one at a time and in a batch, all or nothing", async () => {
  await proves("the cap", [
    ["if v_approved + v_new_approvals > s.cap then", "if false then"],
    ["if v_taken >= s.cap then", "if false then"],
  ], async (db) => {
    const staff = await staffMember(db);
    for (let i = 1; i <= 5; i++) await apply(db, i);
    await asStaff(db, staff, "select staff_beta_update_settings($1::jsonb)", [JSON.stringify({ cap: 3 })]);
    assert.equal((await decide(db, staff, [await idOf(db, 1), await idOf(db, 2)], "approved", 1)).approved_total, 2);
    await assert.rejects(decide(db, staff, [await idOf(db, 3), await idOf(db, 4)], "approved", 1), "a batch that would pass the cap");
    assert.equal((await rowOf(db, 3)).status, "pending", "nothing from that batch was approved");
    assert.equal((await decide(db, staff, [await idOf(db, 3)], "approved", 1)).places_left, 0);
    await assert.rejects(decide(db, staff, [await idOf(db, 4)], "approved", 2), "the 4th with a cap of 3");
    assert.equal((await db.query("select count(*)::int as n from beta_applications where status = 'approved'")).rows[0].n, 3);
  });
});

test("the cap can't be set below what is already approved, and only four settings can be changed", async () => {
  const db = await dbWith();
  const staff = await staffMember(db);
  for (let i = 1; i <= 3; i++) {
    await apply(db, i);
    await approveDirect(db, i, 1);
  }
  const set = (patch) => asStaff(db, staff, "select staff_beta_update_settings($1::jsonb) as r", [JSON.stringify(patch)]).then((r) => r.rows[0].r);
  await assert.rejects(set({ cap: 2 }), "below 3 approved");
  assert.equal((await set({ cap: 250, women_target_pct: 60 })).cap, 250);
  assert.equal((await set({ beta_closes_at: "2027-01-01T00:00:00Z" })).beta_closes_at.startsWith("2027-01-01"), true);
  assert.equal((await set({ beta_closes_at: null })).beta_closes_at, null, "null opens it again");
  await assert.rejects(set({ lagos_only: false }), "widening the beta isn't a screen");
  await assert.rejects(set({ founding_perk_starts_on: "2026-12-01" }), "nor the launch date");
  await assert.rejects(set({ women_target_pct: 120 }), "a percentage");
  const s = (await db.query("select cap, women_target_pct, lagos_only from beta_settings")).rows[0];
  assert.deepEqual([s.cap, s.women_target_pct, s.lagos_only], [250, 60, true]);
});

test("the defaults are the owner's: 200 places, 55% women, Lagos only, applications open 27 October", async () => {
  // Not dbWith(): that opens applications for the other tests.
  const db = await freshDb({ upTo: "0049" });
  await db.exec(SOURCE);
  const s = (await db.query("select cap, women_target_pct, lagos_only, beta_closes_at, to_char(applications_open_at at time zone 'Africa/Lagos', 'YYYY-MM-DD HH24:MI') as opens from beta_settings")).rows[0];
  assert.deepEqual([s.cap, s.women_target_pct, s.lagos_only, s.beta_closes_at], [200, 55, true, null]);
  assert.equal(s.opens, "2026-10-27 00:00");
});

test("only staff can use the approval functions, and every change is audited without a phone number", async () => {
  await proves("the staff check", [["perform _require_staff();\n  if p_status not in", "if p_status not in"]], async (db) => {
    const staff = await staffMember(db);
    const member = await makeUser(db, { name: "Member", email: `${crypto.randomUUID()}@example.com`, gender: "man" });
    await apply(db, 1);
    const id = await idOf(db, 1);
    await assert.rejects(decide(db, member, [id], "approved"), "a member can't decide");
    assert.equal((await rowOf(db, 1)).status, "pending");
    await decide(db, staff, [id], "approved", 2);
    await decide(db, staff, [id], "waitlisted");
    const log = (await db.query("select * from beta_audit_log order by at, id")).rows;
    assert.equal(log.length, 2);
    assert.deepEqual(log.map((l) => l.detail.to), ["approved", "waitlisted"]);
    assert.equal(log[0].staff_id, staff);
    assert.ok(!JSON.stringify(log).includes("+234"), "the audit log never holds a number");
    await assert.rejects(db.query("update beta_audit_log set action = 'x'"), "append-only");
    await assert.rejects(db.query("delete from beta_audit_log"), "append-only");
  });
});

test("the list shows a number only while it is approved and unused; counts split by status, gender and area; elsewhere is counted apart", async () => {
  await proves("a number is shown only while approved and unused", [["case when a.status = 'approved' and a.used_at is null then a.phone_e164 end as phone", "a.phone_e164 as phone"]],
    async (db) => {
      const staff = await staffMember(db);
      await apply(db, 1, { gender: "woman", lagos_area: "lekki" });
      await apply(db, 2, { gender: "man", lagos_area: "yaba" });
      await apply(db, 3, { gender: "woman", lagos_area: "yaba" });
      await apply(db, 4, { gender: "man", location_type: "elsewhere_nigeria", lagos_area: null, other_location: "Abuja" });
      await apply(db, 5, { gender: "woman", location_type: "outside_nigeria", lagos_area: null, other_location: "Ghana" });
      await decide(db, staff, [await idOf(db, 1)], "approved", 1);
      await decide(db, staff, [await idOf(db, 2)], "declined");
      const list = (await asStaff(db, staff, "select staff_beta_list() as r")).rows[0].r;
      const byName = Object.fromEntries(list.rows.map((r) => [r.id, r]));
      assert.ok(byName[await idOf(db, 1)].phone, "approved: the number is there to send the invitation to");
      for (const n of [2, 3, 4, 5]) assert.equal(byName[await idOf(db, n)].phone ?? null, null, `application ${n}: no number`);
      // Once the number has signed up there is nothing left to show.
      await claimedMember(db, 1);
      const after = (await asStaff(db, staff, "select staff_beta_list('approved') as r")).rows[0].r;
      assert.equal(after.rows[0].phone ?? null, null);
      assert.ok(after.rows[0].used_at);

      const o = (await asStaff(db, staff, "select staff_beta_overview() as r")).rows[0].r;
      assert.deepEqual(o.by_status, { approved: 1, declined: 1, pending: 1, waitlisted: 2 });
      assert.deepEqual(o.by_gender, { woman: 3, man: 2 });
      assert.equal(o.by_area.yaba, 2);
      assert.equal(o.by_area.lekki, 1);
      assert.equal(o.by_area.elsewhere_nigeria, 1);
      assert.deepEqual(o.waitlisted_elsewhere, { elsewhere_nigeria: 1, outside_nigeria: 1 });
      assert.equal(o.approved.places_left, 199);
      assert.equal(o.settings.women_target_pct, 55);

      const women = (await asStaff(db, staff, "select staff_beta_list(null, 'woman', null) as r")).rows[0].r;
      assert.equal(women.total, 3);
      const yaba = (await asStaff(db, staff, "select staff_beta_list(null, null, 'yaba') as r")).rows[0].r;
      assert.equal(yaba.total, 2);
    });
});

test("an application whose number has signed up can't be undone from the screen", async () => {
  const db = await dbWith();
  const staff = await staffMember(db);
  await apply(db, 1);
  await decide(db, staff, [await idOf(db, 1)], "approved", 1);
  await claimedMember(db, 1);
  await assert.rejects(decide(db, staff, [await idOf(db, 1)], "declined"));
  assert.equal((await rowOf(db, 1)).status, "approved");
});

// --- 4. Founding members --------------------------------------------------------

test("an approved applicant who confirms their phone while the beta is open becomes a founding member — the same for every wave", async () => {
  await proves("eligibility doesn't depend on the wave", [["insert into founding_members (user_id, starts_at) values (p_profile, v_start)", "insert into founding_members (user_id, starts_at) select p_profile, v_start where a.wave is null or a.wave = 1"]],
    async (db) => {
      for (const [n, wave] of [[1, 1], [2, 2], [3, 5], [4, null]]) {
        await apply(db, n);
        await approveDirect(db, n, wave);
      }
      for (const n of [1, 2, 3, 4]) {
        const { id, result } = await claimedMember(db, n);
        assert.equal(result, "founding", `wave ${n}`);
        assert.ok(await isFounder(db, id), `application ${n} (wave) is a founding member`);
        assert.equal((await isFounder(db, id)).perk, "premium_3_months");
        assert.equal((await isFounder(db, id)).starts_at, null, "before launch the perk has not started");
      }
    });
});

test("signing up marks the invitation used and removes the number; running the claim twice changes nothing", async () => {
  const db = await dbWith();
  await apply(db, 1);
  await approveDirect(db, 1, 1);
  const { id } = await claimedMember(db, 1);
  const row = await rowOf(db, 1);
  assert.ok(row.used_at);
  assert.equal(row.phone_e164, null, "nothing needs the raw number now");
  assert.equal((await svc(db, "select beta_claim($1,$2) as r", [id, hex(1)])).rows[0].r, "already_used");
  assert.equal((await db.query("select count(*)::int as n from founding_members")).rows[0].n, 1);
  // A number that isn't approved claims nothing.
  await apply(db, 2);
  const other = await claimedMember(db, 2);
  assert.equal(other.result, "none");
  assert.equal(await isFounder(db, other.id), undefined);
  assert.equal((await rowOf(db, 2)).used_at, null);
});

test("through record_phone_verified_beta: the number is bound and the invitation used in one step", async () => {
  const db = await dbWith();
  await apply(db, 1);
  await approveDirect(db, 1, 1);
  const id = await makeUser(db, { name: "Ada", email: "ada@example.com", gender: "woman" });
  const hash = "f".repeat(64);
  assert.equal((await svc(db, "select record_phone_verified_beta($1,$2,$3) as r", [id, hash, hex(1)])).rows[0].r, "ok");
  assert.ok(await isFounder(db, id));
  assert.equal((await db.query("select count(*)::int as n from phone_identities where profile_id = $1", [id])).rows[0].n, 1);
  // A number already on another account is refused, and nothing is claimed.
  await apply(db, 2);
  await approveDirect(db, 2, 1);
  const second = await makeUser(db, { name: "Bayo", email: "bayo@example.com", gender: "man" });
  assert.equal((await svc(db, "select record_phone_verified_beta($1,$2,$3) as r", [second, hash, hex(2)])).rows[0].r, "in_use");
  assert.equal(await isFounder(db, second), undefined);
  assert.equal((await rowOf(db, 2)).used_at, null);
});

test("once the beta is closed, nobody new becomes a founding member — but an approved applicant can still sign up", async () => {
  await proves("beta_closes_at", [["if s.beta_closes_at is not null and s.beta_closes_at <= now() then\n    return 'used_beta_closed';\n  end if;", ""]],
    async (db) => {
      await apply(db, 1);
      await approveDirect(db, 1, 1);
      await apply(db, 2);
      await approveDirect(db, 2, 1);
      await apply(db, 3);
      await approveDirect(db, 3, 1);
      // Open with a date still ahead: founding.
      await db.query("update beta_settings set beta_closes_at = now() + interval '1 day'");
      assert.ok(await isFounder(db, (await claimedMember(db, 1)).id), "closing tomorrow: still open today");
      // Closed.
      await db.query("update beta_settings set beta_closes_at = now() - interval '1 minute'");
      const late = await claimedMember(db, 2);
      assert.equal(late.result, "used_beta_closed");
      assert.equal(await isFounder(db, late.id), undefined);
      assert.ok((await rowOf(db, 2)).used_at, "the invitation still works");
      // Open (null).
      await db.query("update beta_settings set beta_closes_at = null");
      assert.ok(await isFounder(db, (await claimedMember(db, 3)).id));
    });
});

test("the perk starts only when start_founding_perk runs, once; a late joiner gets the same three months; running it twice changes nothing", async () => {
  await proves("a late joiner starts at once, not in the past", [["greatest((s.founding_perk_starts_on::timestamp at time zone 'Africa/Lagos'), now())", "(s.founding_perk_starts_on::timestamp at time zone 'Africa/Lagos')"]],
    async (db) => {
      for (const n of [1, 2, 3]) {
        await apply(db, n);
        await approveDirect(db, n, n);
      }
      const early1 = (await claimedMember(db, 1)).id;
      const early2 = (await claimedMember(db, 2)).id;
      assert.equal((await isFounder(db, early1)).starts_at, null);

      const day = new Date(Date.now() - 20 * 86400_000).toISOString().slice(0, 10); // launched 20 days ago (a run in the past is allowed up to a day)
      await assert.rejects(svc(db, "select start_founding_perk($1::date)", [day]), "a launch date in the past is refused");
      const launch = new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10);
      const first = (await svc(db, "select start_founding_perk($1::date) as r", [launch])).rows[0].r;
      assert.equal(first.changed, 2);
      const s1 = (await isFounder(db, early1)).starts_at;
      const s2 = (await isFounder(db, early2)).starts_at;
      assert.equal(new Date(s1).getTime(), new Date(s2).getTime(), "all at once");
      assert.equal(new Date(s1).toISOString(), new Date(`${launch}T00:00:00+01:00`).toISOString(), "launch day, Lagos time");

      // Twice: nothing changes, even with a different date.
      const before = JSON.stringify((await db.query("select * from founding_members order by user_id")).rows);
      const second = (await svc(db, "select start_founding_perk($1::date) as r", [launch])).rows[0].r;
      assert.equal(second.changed, 0);
      await svc(db, "select start_founding_perk($1::date)", [new Date(Date.now() + 40 * 86400_000).toISOString().slice(0, 10)]);
      assert.equal(JSON.stringify((await db.query("select * from founding_members order by user_id")).rows), before);

      // A late joiner after the date is set: three full months from when they join.
      await db.query("update beta_settings set founding_perk_starts_on = current_date - 10");
      const late = (await claimedMember(db, 3)).id;
      const l = await isFounder(db, late);
      assert.ok(new Date(l.starts_at).getTime() > Date.now() - 60_000, "starts now, not ten days ago");
      const ends = async (ts) => (await db.query("select founding_perk_ends($1::timestamptz) = $1::timestamptz + interval '3 months' as ok", [new Date(ts).toISOString()])).rows[0].ok;
      assert.equal(await ends(l.starts_at), true, "three months, the same as everyone");
      assert.equal(await ends(s1), true);
      const left = (await db.query("select founding_perk_ends($1::timestamptz) - now() > interval '89 days' as ok", [new Date(l.starts_at).toISOString()])).rows[0].ok;
      assert.equal(left, true, "a late joiner has the full three months still ahead");
    });
});

// --- 5. No stacking --------------------------------------------------------------

test("a woman who is a founding member is not also given the 30-day offer; a woman who isn't, still is", async () => {
  await proves("no stacking", [
    ["if exists (select 1 from founding_members where user_id = new.id) then\n    return new;\n  end if;", ""],
    ["if new.source = 'womens_launch_offer' then\n      return null;", "if new.source = 'womens_launch_offer' then\n      return new;"],
  ], async (db) => {
    await apply(db, 1);
    await approveDirect(db, 1, 1);
    const founder = (await claimedMember(db, 1, { gender: "woman", name: "Founder" })).id;
    const other = await makeUser(db, { name: "Other", email: `${crypto.randomUUID()}@example.com`, gender: "woman" });

    await goLive(db, founder);
    await goLive(db, other);
    const grants = async (id) => (await db.query("select tier, source from entitlements where profile_id = $1 and source <> 'default'", [id])).rows;
    assert.deepEqual(await grants(other), [{ tier: "premium_plus", source: "womens_launch_offer" }], "an ordinary woman still gets 30 days of Premium Plus");
    assert.deepEqual(await grants(founder), [], "a founding woman gets no 30-day offer");
    assert.equal((await db.query("select count(*)::int as n from launch_offer_grants where profile_id = $1", [founder])).rows[0].n, 0);
  });
});

test("a member never holds two free grants", async () => {
  await proves("the free-grant guard", [
    ["raise exception 'This member already holds the founding grant; free time does not stack.' using errcode = '23514';", "return new;"],
    ["if new.source = 'womens_launch_offer' then\n      return null;", "if new.source = 'womens_launch_offer' then\n      return new;"],
    ["if exists (select 1 from entitlements\n              where profile_id = p_profile and source in ('womens_launch_offer', 'manual_grant')\n                and (ends_at is null or ends_at > now())) then\n    return 'used_has_grant';\n  end if;", ""],
  ], async (db) => {
    // 1. A founding member can't be given the women's offer or a manual grant on top.
    await apply(db, 1);
    await approveDirect(db, 1, 1);
    const founder = (await claimedMember(db, 1)).id;
    await db.query("insert into entitlements (profile_id, tier, source, ends_at) values ($1, 'premium_plus', 'womens_launch_offer', now() + interval '30 days')", [founder]);
    assert.equal((await db.query("select count(*)::int as n from entitlements where profile_id = $1 and source = 'womens_launch_offer'", [founder])).rows[0].n, 0);
    await assert.rejects(db.query("insert into entitlements (profile_id, tier, source, ends_at) values ($1, 'premium', 'manual_grant', now() + interval '30 days')", [founder]));
    // 2. A member who already holds free time is not made a founding member on top.
    await apply(db, 2);
    await approveDirect(db, 2, 1);
    const holder = await makeUser(db, { name: "Holder", email: `${crypto.randomUUID()}@example.com`, gender: "woman" });
    await db.query("insert into entitlements (profile_id, tier, source, ends_at) values ($1, 'premium_plus', 'womens_launch_offer', now() + interval '30 days')", [holder]);
    const r = (await svc(db, "select beta_claim($1,$2) as r", [holder, hex(2)])).rows[0].r;
    assert.equal(r, "used_has_grant");
    assert.equal(await isFounder(db, holder), undefined);
  });
});

// --- 6. Nobody reads it ----------------------------------------------------------

test("no other member can read a founding membership: not the table, not profile_for(), and no function but the listed ones touches it", async () => {
  const db = await dbWith();
  await apply(db, 1);
  await approveDirect(db, 1, 1);
  const founder = (await claimedMember(db, 1, { gender: "woman", name: "Founder" })).id;
  const viewer = await makeUser(db, { name: "Viewer", email: `${crypto.randomUUID()}@example.com`, gender: "man" });
  await goLive(db, founder);
  await goLive(db, viewer);
  await db.query("insert into prompt_answers (profile_id, prompt_id, answer) values ($1, 1, 'x') on conflict do nothing", [founder]);

  await assert.rejects(as(db, viewer, (tx) => tx.query("select * from founding_members")));
  await assert.rejects(as(db, founder, (tx) => tx.query("select * from founding_members")), "not even the founder");
  for (const who of [viewer, founder]) {
    const seen = await as(db, who, (tx) => tx.query("select profile_for($1) as p", [founder])).then((r) => r.rows[0]?.p, () => null);
    const text = JSON.stringify(seen ?? null).toLowerCase();
    assert.ok(!text.includes("founding") && !text.includes("premium_3_months"), "profile_for carries no mark");
  }

  // Every function that mentions the table, by name. Anything else is a new reader.
  const readers = async () => (await db.query(
    "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosrc ilike '%founding_members%' order by 1",
  )).rows.map((r) => r.proname);
  assert.deepEqual(await readers(), [
    "beta_claim", "founding_blocks_free_grants", "grant_launch_offer", "staff_beta_overview", "start_founding_perk",
  ]);
  // Planted: a feed function that reads it is caught by that list.
  await db.exec("create function public.leaky_feed() returns int language sql as $$ select count(*)::int from founding_members $$");
  assert.notDeepEqual(await readers(), [
    "beta_claim", "founding_blocks_free_grants", "grant_launch_offer", "staff_beta_overview", "start_founding_perk",
  ]);
});

// --- 7. Feedback -----------------------------------------------------------------

test("feedback: any signed-in member, a safe page path, ten a day, staff read it, nobody else does", async () => {
  await proves("the daily limit", [["if (select count(*) from beta_feedback where profile_id = v_me and created_at > now() - interval '1 day') >= 10 then", "if false then"]],
    async (db) => {
      const member = await makeUser(db, { name: "Tola Ade", email: `${crypto.randomUUID()}@example.com`, gender: "man" });
      const other = await makeUser(db, { name: "Other", email: `${crypto.randomUUID()}@example.com`, gender: "woman" });
      const staff = await staffMember(db);
      const send = (who, cat, page, body) => as(db, who, (tx) => tx.query("select submit_beta_feedback($1,$2,$3)", [cat, page, body]));

      await send(member, "bug", "/profile/settings?tab=x&email=a@b.com#top", "The page froze.");
      await send(member, "idea", "https://evil.example/steal?x=1", "A thought.");
      await send(member, "safety", "/feed", "Something worried me.");
      await send(member, "other", "/members/[id]", "Hello.");
      const rows = (await db.query("select category, page from beta_feedback order by created_at, category")).rows;
      assert.ok(rows.some((r) => r.category === "bug" && r.page === "/profile/settings"), "the query string is dropped");
      assert.ok(rows.some((r) => r.category === "idea" && r.page === "/"), "a full URL becomes the home path");
      assert.ok(rows.every((r) => !r.page.includes("?") && !r.page.includes("@")));
      assert.ok(rows.some((r) => r.category === "other" && r.page === "/members/[id]"), "a real route keeps its shape");

      await assert.rejects(send(member, "praise", "/", "x"), "a category from the list");
      await assert.rejects(send(member, "bug", "/", "   "), "words are needed");
      await assert.rejects(send(member, "bug", "/", "x".repeat(2001)), "up to 2,000 characters");
      await assert.rejects(as(db, null, (tx) => tx.query("select submit_beta_feedback('bug','/','hi')")), "signed in only");

      for (let i = 0; i < 6; i++) await send(member, "bug", "/", `more ${i}`);
      await assert.rejects(send(member, "bug", "/", "one too many"), "ten in a day");
      await send(other, "bug", "/", "someone else is unaffected");

      const seen = (await asStaff(db, staff, "select staff_beta_feedback() as r")).rows[0].r;
      assert.equal(seen.total, 11);
      assert.ok(seen.rows[0].from_member, "staff see who it came from");
      const onlySafety = (await asStaff(db, staff, "select staff_beta_feedback('safety') as r")).rows[0].r;
      assert.equal(onlySafety.total, 1);
      await assert.rejects(asStaff(db, member, "select staff_beta_feedback()"), "a member can't read feedback");
      await assert.rejects(as(db, other, (tx) => tx.query("select * from beta_feedback")));
    });
});

test("feedback goes with the account when it is deleted", async () => {
  const db = await dbWith();
  const member = await makeUser(db, { name: "Tola", email: `${crypto.randomUUID()}@example.com`, gender: "man" });
  await as(db, member, (tx) => tx.query("select submit_beta_feedback('idea','/','hello')"));
  await db.query("delete from profiles where id = $1", [member]);
  assert.equal((await db.query("select count(*)::int as n from beta_feedback")).rows[0].n, 0);
});

// --- 8. Retention ----------------------------------------------------------------

test("90 days after the last status change, an application that never became a member is deleted; the rest stays", async () => {
  await proves("the 90-day purge", [["where status_changed_at < now() - interval '90 days'", "where status_changed_at < now() - interval '9000 days'"]],
    async (db) => {
      const staff = await staffMember(db);
      for (let i = 1; i <= 7; i++) await apply(db, i);
      await apply(db, 8, { location_type: "outside_nigeria", lagos_area: null, other_location: "Ghana" }); // waitlisted
      await decide(db, staff, [await idOf(db, 1)], "declined");
      await decide(db, staff, [await idOf(db, 2)], "approved", 1); // approved, never used
      await decide(db, staff, [await idOf(db, 3)], "approved", 1); // approved and used
      await claimedMember(db, 3);
      // 4 stays pending. 5: declined recently. 6, 7: pending.
      await decide(db, staff, [await idOf(db, 5)], "declined");
      const old = (n) => db.query("update beta_applications set status_changed_at = now() - interval '91 days' where phone_key = $1", [hex(n)]);
      for (const n of [1, 2, 3, 4, 8]) await old(n);
      const n = (await svc(db, "select purge_beta_applications() as n")).rows[0].n;
      assert.equal(n, 4);
      const left = (await db.query("select status from beta_applications order by created_at")).rows.length;
      assert.equal(left, 4, "applications 3 (used), 5, 6 and 7 remain");
      assert.ok(await rowOf(db, 3), "the application that became a member is kept, without its number");
      assert.equal(await rowOf(db, 1), undefined, "declined, 91 days");
      assert.equal(await rowOf(db, 2), undefined, "approved but never used");
      assert.equal(await rowOf(db, 4), undefined, "never decided");
      assert.equal(await rowOf(db, 8), undefined, "waitlisted");
      assert.ok(await rowOf(db, 5), "declined yesterday is kept");
    });
});

test("the purge runs daily where pg_cron is enabled", async () => {
  const db = await dbWith();
  const jobs = (await db.query("select jobname, schedule, command from cron.job where jobname = 'toastly-purge-beta-applications'")).rows;
  assert.equal(jobs.length, 1);
  assert.match(jobs[0].command, /purge_beta_applications/);
});

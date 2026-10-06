/**
 * Religion and denomination (PRD §5.2.3; migration 0030) — against a
 * throwaway Postgres (PGlite) with every migration applied. Never production.
 *
 *   node --test scripts/sql-test/faith.test.mjs
 *
 * Members act through the same role and claims a raw API request has.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { freshDb, as, asService, makeUser } from "./harness.mjs";

let db;
before(async () => {
  db = await freshDb();
});

const me = (id, sql, params) => as(db, id, (tx) => tx.query(sql, params));
const faith = async (id) =>
  (await db.query("select religion, religion_other, denomination, denomination_other, religion_visibility from profiles where id = $1", [id])).rows[0];

async function member(name, { consented = true } = {}) {
  const id = await makeUser(db, { name, email: `${crypto.randomUUID()}@example.com` });
  if (consented) await me(id, "insert into consents (profile_id, kind, version) values ($1, 'faith_display', '2026-10-06')", [id]);
  return id;
}

test("adding a religion needs the member's consent on record first", async () => {
  const m = await member("No Consent Yet", { consented: false });
  await assert.rejects(me(m, "update profiles set religion = 'Christian' where id = $1", [m]), /Agree to show your faith/);
  await me(m, "insert into consents (profile_id, kind, version) values ($1, 'faith_display', '2026-10-06')", [m]);
  await me(m, "update profiles set religion = 'Christian' where id = $1", [m]);
  assert.equal((await faith(m)).religion, "Christian");
});

test("removing religion needs no consent, and deletes the value", async () => {
  const m = await member("Removes It");
  await me(m, "update profiles set religion = 'Muslim', denomination = 'sunni' where id = $1", [m]);
  await me(m, "update profiles set religion = null where id = $1", [m]);
  const f = await faith(m);
  assert.equal(f.religion, null);
  assert.equal(f.denomination, null);
});

test("religion comes from the list; 'Other' carries up to 30 characters", async () => {
  const m = await member("Lists");
  await assert.rejects(me(m, "update profiles set religion = 'Christianity' where id = $1", [m]), /from the list/);
  await assert.rejects(me(m, "update profiles set religion = 'Other' where id = $1", [m]), /30 characters/);
  await assert.rejects(me(m, "update profiles set religion = 'Other', religion_other = $2 where id = $1", [m, "x".repeat(31)]));
  await me(m, "update profiles set religion = 'Other', religion_other = 'Eckankar' where id = $1", [m]);
  assert.equal((await faith(m)).religion_other, "Eckankar");
  await me(m, "update profiles set religion = 'Traditional' where id = $1", [m]);
  assert.equal((await faith(m)).religion_other, null, "the Other text goes with Other");
});

test("a religion stored before the list is left exactly as it was", async () => {
  const m = await member("Before The List");
  await db.query("alter table profiles disable trigger faith_rules");
  await db.query("update profiles set religion = 'Christianity (RCCG)' where id = $1", [m]);
  await db.query("alter table profiles enable trigger faith_rules");
  await me(m, "update profiles set bio = 'Hello', religion = 'Christianity (RCCG)' where id = $1", [m]);
  assert.equal((await faith(m)).religion, "Christianity (RCCG)", "saving the profile doesn't change it");
});

test("denomination only with Christian or Muslim, and only from that religion's list", async () => {
  const m = await member("Denominations");
  await assert.rejects(me(m, "update profiles set religion = 'Traditional', denomination = 'catholic' where id = $1", [m]), /doesn't go with/);
  await assert.rejects(me(m, "update profiles set religion = 'Muslim', denomination = 'pentecostal' where id = $1", [m]), /doesn't go with/);
  await me(m, "update profiles set religion = 'Christian', denomination = 'white_garment' where id = $1", [m]);
  await assert.rejects(me(m, "update profiles set denomination = 'other' where id = $1", [m]), /30 characters/);
  await me(m, "update profiles set denomination = 'other', denomination_other = 'Deeper Life' where id = $1", [m]);
  assert.deepEqual([(await faith(m)).denomination, (await faith(m)).denomination_other], ["other", "Deeper Life"]);
});

test("changing religion clears denomination", async () => {
  const m = await member("Changes Faith");
  await me(m, "update profiles set religion = 'Christian', denomination = 'pentecostal' where id = $1", [m]);
  await me(m, "update profiles set religion = 'Muslim' where id = $1", [m]);
  assert.equal((await faith(m)).denomination, null, "Christian → Muslim");

  await me(m, "update profiles set denomination = 'other', denomination_other = 'Tijaniyya' where id = $1", [m]);
  await me(m, "update profiles set religion = 'Spiritual but not religious' where id = $1", [m]);
  const f = await faith(m);
  assert.equal(f.denomination, null, "away from Christian/Muslim");
  assert.equal(f.denomination_other, null);

  await me(m, "update profiles set religion = 'Christian', denomination = 'baptist' where id = $1", [m]);
  await me(m, "update profiles set religion = 'Christian', bio = 'Sunday school teacher' where id = $1", [m]);
  assert.equal((await faith(m)).denomination, "baptist", "saving the same religion keeps it");

  await me(m, "update profiles set religion = 'Muslim', denomination = 'sunni' where id = $1", [m]);
  assert.equal((await faith(m)).denomination, "sunni", "a new religion with a fitting denomination in the same save");
});

test("the Trust Sentinel can't carry religion or denomination", async () => {
  const m = await member("Sentinel");
  const insert = (meta) =>
    asService(db, (tx) => tx.query("insert into trust_events (profile_id, kind, meta) values ($1, 'report_filed', $2)", [m, JSON.stringify(meta)]));
  await insert({ reason: "other" }); // control: a clean event goes in
  for (const key of ["denomination", "denomination_other", "religion", "religion_other", "faith"]) {
    await assert.rejects(insert({ [key]: "x" }), /trust_meta_has_no_(faith|content_or_protected_attributes)/, `trust event meta with ${key}`);
  }
  // Denomination is refused by 0030's own guard specifically.
  for (const key of ["denomination", "denomination_other", "religion_other", "faith"]) {
    await assert.rejects(insert({ [key]: "x" }), /trust_meta_has_no_faith/, `${key} by the faith guard`);
  }
});

test("the AriyaPlanner brief can't carry religion or denomination", async () => {
  const { rows: [r] } = await db.query(
    `select faith_meta_is_clean('{"denomination":"pentecostal"}') as d, faith_meta_is_clean('{"religion":"x"}') as r,
            faith_meta_is_clean('{"palette":"gold"}') as ok`,
  );
  assert.deepEqual(r, { d: false, r: false, ok: true });
  const { rows } = await db.query(
    "select 1 from pg_constraint where conname = 'brief_has_no_faith' and conrelid = 'public.couple_briefs'::regclass",
  );
  assert.equal(rows.length, 1, "enforced on couple_briefs");
});

test("visibility: one setting for both, 'shown' by default", async () => {
  const m = await member("Default Shown");
  assert.equal((await faith(m)).religion_visibility, "public");
});

test("'Remove faith from my profile' deletes both fields and the permission — adding again asks again", async () => {
  const m = await member("Removes Faith");
  await me(m, "update profiles set religion = 'Christian', denomination = 'methodist' where id = $1", [m]);
  await me(m, "select remove_faith()");
  const f = await faith(m);
  assert.deepEqual([f.religion, f.denomination], [null, null]);
  const { rows } = await db.query("select 1 from consents where profile_id = $1 and kind = 'faith_display'", [m]);
  assert.equal(rows.length, 0, "the permission is gone");
  await assert.rejects(me(m, "update profiles set religion = 'Christian' where id = $1", [m]), /Agree to show your faith/);
});

test("a member can only remove their own faith", async () => {
  const a = await member("Owner A");
  const b = await member("Other B");
  await me(a, "update profiles set religion = 'Muslim' where id = $1", [a]);
  await me(b, "select remove_faith()");
  assert.equal((await faith(a)).religion, "Muslim");
});

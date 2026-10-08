/**
 * The women's launch offer forgets a deleted account's phone hash after 12
 * months (migration 0038) — against a throwaway Postgres (PGlite) with every
 * migration applied. Never production.
 *
 *   node --test scripts/sql-test/launch-offer-retention.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb, makeUser, goLive } from "./harness.mjs";

test("a deleted account's offer hash is kept 12 months, then purged; a live account's never is", async () => {
  const db = await freshDb();
  const woman = async (name, hash) => {
    const id = await makeUser(db, { name, email: `${crypto.randomUUID()}@example.com`, gender: "woman" });
    await goLive(db, id, { phoneHash: hash });
    return id;
  };
  const grant = async (hash) => (await db.query("select profile_id, released_at from launch_offer_grants where phone_hash = $1", [hash])).rows[0];

  const gone = await woman("Gone Grace", "hash-gone");
  const old = await woman("Old Olu", "hash-old");
  const stays = await woman("Staying Sade", "hash-stays");
  assert.equal((await grant("hash-gone")).released_at, null, "an open account's grant has no clock");

  // Deleting the account starts the clock (the profile row goes; the hash stays).
  await db.query("delete from profiles where id = $1", [gone]);
  await db.query("delete from profiles where id = $1", [old]);
  const g = await grant("hash-gone");
  assert.equal(g.profile_id, null);
  assert.ok(g.released_at, "released when the account went");

  // 11 months on: kept. 13 months on: purged. An open account: never.
  await db.query("update launch_offer_grants set released_at = now() - interval '11 months' where phone_hash = 'hash-gone'");
  await db.query("update launch_offer_grants set released_at = now() - interval '13 months' where phone_hash = 'hash-old'");
  await db.query("update launch_offer_grants set granted_at = now() - interval '3 years' where phone_hash = 'hash-stays'");
  await db.query("select purge_expired_retention()");
  assert.ok(await grant("hash-gone"), "within 12 months: kept, so the offer can't be claimed again");
  assert.equal(await grant("hash-old"), undefined, "after 12 months: deleted");
  assert.ok(await grant("hash-stays"), "an open account's grant is never purged");
  assert.equal((await db.query("select days from retention_config where name = 'launch_offer_phone'")).rows[0].days, 365);
  void stays;
});

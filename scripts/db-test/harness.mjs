/**
 * Calling the database as a member.
 *
 * Every call runs exactly as Supabase's REST and storage APIs run a request:
 * one transaction, `set local role authenticated`, the member's JWT claims in
 * request.jwt.claims, then the statement. No app code is involved — this is
 * what a modified client or a raw API call gets, which is the point.
 */
import { randomUUID } from "node:crypto";

export function harness(db) {
  const results = [];

  async function as(role, sub, sql, params = []) {
    await db.query("begin");
    try {
      await db.query(`set local role ${role}`);
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify(sub ? { sub, role } : { role }),
      ]);
      const r = await db.query(sql, params);
      await db.query("commit");
      return { rows: r.rows, count: r.rowCount };
    } catch (e) {
      await db.query("rollback");
      return { error: e.code, message: e.message };
    }
  }

  const t = {
    member: (id, sql, params) => as("authenticated", id, sql, params),
    service: (sql, params) => as("service_role", null, sql, params),
    /** Superuser, for seeding only — bypasses every rule under test. */
    root: (sql, params) => db.query(sql, params),

    record(group, name, pass, detail) {
      results.push({ group, name, pass: Boolean(pass), detail });
    },
    refused(group, name, r, code) {
      const ok = Boolean(r.error) && (!code || r.error === code);
      t.record(group, name, ok, r.error ? `${r.error} ${r.message.slice(0, 70)}` : `allowed (${r.count} rows)`);
    },
    empty(group, name, r) {
      t.record(group, name, !r.error && r.count === 0, r.error ? `error ${r.error}` : `${r.count} rows`);
    },
    ok(group, name, r, min = 0) {
      t.record(group, name, !r.error && r.count >= min, r.error ? `${r.error} ${r.message.slice(0, 70)}` : `${r.count} rows`);
    },
    ids: (r) => (r.rows ?? []).map((x) => x.candidate_id ?? x.id),
    value: (r) => (r.rows?.[0] ? Object.values(r.rows[0])[0] : undefined),

    // --- seeding --------------------------------------------------------------
    async makeMember(name) {
      const id = randomUUID();
      await t.root(
        "insert into auth.users (id, raw_user_meta_data, phone_confirmed_at) values ($1, $2, now())",
        [id, { display_name: name }],
      );
      // Top tier for every test member, so no entitlement rule can be what
      // refuses them: a refusal is the rule under test, nothing else.
      await t.root(
        "insert into entitlements (profile_id, tier, source) values ($1, 'premium_plus', 'manual_grant')",
        [id],
      );
      await t.root(
        "update profiles set stage = 'verified_real', phone_verified_at = now(), liveness_verified_at = now(), city = 'Lagos' where id = $1",
        [id],
      );
      const answers = [];
      for (const prompt of [1, 2]) {
        const { rows } = await t.root(
          "insert into prompt_answers (profile_id, prompt_id, answer) values ($1, $2, $3) returning id",
          [id, prompt, `${name} answer ${prompt}`],
        );
        answers.push(rows[0].id);
      }
      return { id, name, answers, photos: [] };
    },

    async addPhoto(m, label) {
      const path = `${m.id}/${label}.jpg`;
      const up = await t.member(
        m.id,
        "insert into storage.objects (bucket_id, name, owner) values ('profile-photos', $1, $2)",
        [path, m.id],
      );
      if (up.error) throw new Error(`upload ${label}: ${up.message}`);
      const row = await t.member(
        m.id,
        "insert into profile_photos (profile_id, storage_path, position) values ($1, $2, $3)",
        [m.id, path, m.photos.length % 6],
      );
      if (row.error) throw new Error(`photo row ${label}: ${row.message}`);
      const { rows } = await t.root("select id from profile_photos where storage_path = $1", [path]);
      m.photos.push({ id: rows[0].id, path, label });
      return rows[0].id;
    },

    async setMainPhoto(m, photoId, outcome = "matched") {
      const n = await t.member(m.id, "select nominate_main_photo($1)", [photoId]);
      if (n.error) throw new Error(`nominate: ${n.message}`);
      const r = await t.service("select record_main_photo_match($1, $2)", [photoId, outcome]);
      if (r.error) throw new Error(`match: ${r.message}`);
    },

    async makeLive(name) {
      const m = await t.makeMember(name);
      for (const l of ["a", "b", "c", "d"]) await t.addPhoto(m, l);
      await t.setMainPhoto(m, m.photos[0].id);
      return m;
    },

    async status(m) {
      return (await t.member(m.id, "select live_profile_status() as s")).rows?.[0]?.s;
    },

    report() {
      let group = "";
      for (const r of results) {
        if (r.group !== group) {
          group = r.group;
          console.log(`\n${group}`);
        }
        console.log(`  ${r.pass ? "PASS" : "FAIL"}  ${r.name.padEnd(60)} ${r.detail ?? ""}`);
      }
      const failed = results.filter((r) => !r.pass).length;
      console.log(`\n${results.length - failed}/${results.length} database checks passed`);
      return failed;
    },
  };
  return t;
}

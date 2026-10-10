/**
 * Toastly Help → a person (migration 0042) — against a throwaway Postgres
 * (PGlite) with every migration applied. Never production.
 *
 *   node --test scripts/sql-test/help-escalation.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb, as, asService, makeUser, goLive } from "./harness.mjs";

async function setup() {
  const db = await freshDb();
  const me = (id, sql, params) => as(db, id, (tx) => tx.query(sql, params));
  const svc = (sql, params) => asService(db, (tx) => tx.query(sql, params));
  async function member(name, gender = "woman") {
    const id = await makeUser(db, { name, email: `${crypto.randomUUID()}@example.com`, gender });
    await goLive(db, id);
    return id;
  }
  async function staff() {
    const id = await member("Staff Person", "man");
    await db.query("insert into staff_members (profile_id) values ($1)", [id]);
    return id;
  }
  // A Help conversation with a few turns, written the way /api/help writes them.
  async function conversation(profile, turns = ["My card was charged but I have no plan", "Charged twice, please"]) {
    const { rows } = await db.query("insert into support_conversations (profile_id) values ($1) returning id", [profile]);
    const id = rows[0].id;
    for (const [i, t] of turns.entries()) {
      await db.query(
        "insert into support_messages (conversation_id, profile_id, role, content, created_at) values ($1, $2, 'member', $3, now() - make_interval(secs => $4))",
        [id, profile, t, 100 - i * 2],
      );
      await db.query(
        "insert into support_messages (conversation_id, profile_id, role, content, created_at) values ($1, $2, 'assistant', 'A person will pick this up.', now() - make_interval(secs => $3))",
        [id, profile, 99 - i * 2],
      );
    }
    return id;
  }
  const file = async (profile, conv, category, urgency, trigger = "rule_topic") =>
    (await svc("select * from file_support_ticket($1, $2, $3, $4, $5)", [profile, conv, category, urgency, trigger])).rows[0];
  return { db, me, svc, member, staff, conversation, file };
}

test("only the server files a ticket, for the member's own conversation", async () => {
  const { me, member, conversation, file } = await setup();
  const amaka = await member("Amaka");
  const conv = await conversation(amaka);
  await assert.rejects(
    me(amaka, "select * from file_support_ticket($1, $2, 'refund', 'urgent', 'safety')", [amaka, conv]),
    /permission denied/,
    "a member can't file (or page the on-call phone) directly",
  );
  await assert.rejects(me(amaka, "insert into support_tickets (reference, profile_id, category) values ('TH-11111', $1, 'refund')", [amaka]), /permission denied/);
  const bayo = await member("Bayo", "man");
  await assert.rejects(file(bayo, conv, "refund", "normal"), /Not your conversation/);
});

test("a filed ticket holds the transcript, category, plan and verification status, and its reply time", async () => {
  const { db, member, conversation, file } = await setup();
  const amaka = await member("Amaka");
  const conv = await conversation(amaka);
  const t = await file(amaka, conv, "charged_no_plan", "normal");
  assert.equal(t.created, true);
  assert.match(t.reference, /^TH-\d{5}$/);
  assert.equal(t.urgency, "normal");
  assert.equal(t.sla_minutes, 1440);
  const row = (await db.query("select * from support_tickets where id = $1", [t.id])).rows[0];
  assert.equal(row.category, "charged_no_plan");
  assert.equal(row.trigger, "rule_topic");
  assert.equal(row.plan_at_open, "premium_plus", "her 30 free days of Premium Plus, as it was when she asked");
  assert.equal(row.verification_at_open, "verified_real");
  assert.equal(row.transcript.length, 4);
  assert.deepEqual(row.transcript.map((m) => m.role), ["member", "assistant", "member", "assistant"]);
  assert.equal(row.transcript[0].content, "My card was charged but I have no plan");
  const minutes = (Date.parse(row.sla_due_at) - Date.parse(row.created_at)) / 60000;
  assert.ok(Math.abs(minutes - 1440) < 1);
});

test("urgent tickets get the urgent reply time, both from config", async () => {
  const { db, member, conversation, file } = await setup();
  const amaka = await member("Amaka");
  let t = await file(amaka, await conversation(amaka), "threat", "urgent", "safety");
  assert.equal(t.sla_minutes, 60);
  await db.query("update support_config set value = 30 where name = 'sla_urgent_minutes'");
  await db.query("update support_config set value = 720 where name = 'sla_normal_minutes'");
  t = await file(amaka, await conversation(amaka), "unsafe", "urgent", "safety");
  assert.equal(t.sla_minutes, 30);
  t = await file(amaka, await conversation(amaka), "refund", "normal");
  assert.equal(t.sla_minutes, 720);
});

test("one ticket per conversation: refiled it's the same; raised to urgent once; never lowered", async () => {
  const { db, member, conversation, file } = await setup();
  const amaka = await member("Amaka");
  const conv = await conversation(amaka);
  const first = await file(amaka, conv, "refund", "normal");
  const again = await file(amaka, conv, "refund", "normal");
  assert.equal(again.id, first.id);
  assert.equal(again.created, false);
  assert.equal(again.raised, false);
  const raised = await file(amaka, conv, "threat", "urgent", "safety");
  assert.equal(raised.id, first.id);
  assert.equal(raised.raised, true, "raised: alert the team again");
  assert.equal(raised.urgency, "urgent");
  const lowered = await file(amaka, conv, "refund", "normal");
  assert.equal(lowered.urgency, "urgent", "never lowered");
  assert.equal(lowered.raised, false);
  const row = (await db.query("select category, urgency, trigger from support_tickets where id = $1", [first.id])).rows[0];
  assert.deepEqual(row, { category: "threat", urgency: "urgent", trigger: "safety" });
  assert.equal((await db.query("select count(*)::int as n from support_tickets where profile_id = $1", [amaka])).rows[0].n, 1);
});

test("members read their own tickets and replies, never who on the team opened or wrote them", async () => {
  const { me, member, staff, conversation, file } = await setup();
  const amaka = await member("Amaka");
  const bayo = await member("Bayo", "man");
  const s = await staff();
  const t = await file(amaka, await conversation(amaka), "refund", "normal");
  await me(s, "select staff_support_ticket($1)", [t.reference]);
  await me(s, "select staff_support_reply($1, 'We have refunded the second charge.')", [t.id]);

  const own = await me(amaka, "select reference, status, transcript from support_tickets");
  assert.equal(own.rows.length, 1);
  assert.equal(own.rows[0].status, "replied");
  await assert.rejects(me(amaka, "select first_opened_by from support_tickets"), /permission denied/);
  const replies = await me(amaka, "select body, read_at from support_ticket_replies");
  assert.equal(replies.rows[0].body, "We have refunded the second charge.");
  await assert.rejects(me(amaka, "select staff_id from support_ticket_replies"), /permission denied/);
  assert.equal((await me(bayo, "select id from support_tickets")).rows.length, 0, "not someone else's");
  assert.equal((await me(bayo, "select id from support_ticket_replies")).rows.length, 0);
  await assert.rejects(me(amaka, "insert into support_ticket_replies (ticket_id, profile_id, staff_id, body) values ($1, $2, $2, 'forged')", [t.id, amaka]), /permission denied/);
});

test("the Support tab: staff only, urgent pinned first, then oldest first", async () => {
  const { db, me, member, staff, conversation, file } = await setup();
  const amaka = await member("Amaka");
  const s = await staff();
  await assert.rejects(me(amaka, "select * from staff_support_queue('open')"), /Not available/);
  await assert.rejects(me(amaka, "select staff_support_ticket('TH-00000')"), /Not available/);

  const old = await file(amaka, await conversation(amaka), "refund", "normal");
  const urgentNew = await file(amaka, await conversation(amaka), "threat", "urgent", "safety");
  const mid = await file(amaka, await conversation(amaka), "appeal", "normal");
  await db.query("update support_tickets set created_at = now() - interval '3 days' where id = $1", [old.id]);
  await db.query("update support_tickets set created_at = now() - interval '2 days' where id = $1", [mid.id]);
  const resolved = await file(amaka, await conversation(amaka), "scam", "urgent", "safety");
  await me(s, "select staff_support_status($1, 'resolved')", [resolved.id]);

  const open = (await me(s, "select reference, urgency from staff_support_queue('open')")).rows.map((r) => r.reference);
  assert.deepEqual(open, [urgentNew.reference, old.reference, mid.reference]);
  const all = (await me(s, "select reference from staff_support_queue('all')")).rows.map((r) => r.reference);
  assert.equal(all[0], urgentNew.reference);
  assert.ok(all.includes(resolved.reference));
  assert.deepEqual((await me(s, "select reference from staff_support_queue('resolved')")).rows.map((r) => r.reference), [resolved.reference]);
});

test("opening a ticket shows the transcript, plan and verification, and is audit-logged once", async () => {
  const { db, me, member, staff, conversation, file } = await setup();
  const amaka = await member("Amaka");
  const s = await staff();
  const t = await file(amaka, await conversation(amaka), "threat", "urgent", "safety");
  const view = (await me(s, "select staff_support_ticket($1) as v", [t.reference])).rows[0].v;
  assert.equal(view.reference, t.reference);
  assert.equal(view.plan, "premium_plus");
  assert.equal(view.verification, "verified_real");
  assert.equal(view.transcript.length, 4);
  assert.ok(view.first_opened_at);
  await me(s, "select staff_support_ticket($1)", [t.reference]);
  const audit = await db.query("select action, note from staff_audit_log where subject_id = $1", [amaka]);
  assert.deepEqual(audit.rows, [{ action: "support_opened", note: null }], "opened once, recorded once");
});

test("a staff reply reaches the member in the app; the audit log records that, not the words", async () => {
  const { db, me, member, staff, conversation, file } = await setup();
  const amaka = await member("Amaka");
  const s = await staff();
  const t = await file(amaka, await conversation(amaka), "refund", "normal");
  const out = (await me(s, "select staff_support_reply($1, $2) as r", [t.id, "Refunded — 3 to 5 working days."])).rows[0].r;
  assert.deepEqual(out, { profile_id: amaka, reference: t.reference });
  await assert.rejects(me(s, "select staff_support_reply($1, '   ')", [t.id]), /1 to 4,000/);
  await assert.rejects(me(amaka, "select staff_support_reply($1, 'forged')", [t.id]), /Not available/);

  const notice = await me(amaka, "select kind, reason_category from member_notices where dismissed_at is null");
  assert.deepEqual(notice.rows, [{ kind: "support_reply", reason_category: t.reference }], "the notice carries the reference only");
  const audit = await db.query("select action, note from staff_audit_log where subject_id = $1 and action = 'support_reply'", [amaka]);
  assert.deepEqual(audit.rows, [{ action: "support_reply", note: null }]);
  // A second reply doesn't stack a second notice.
  await me(s, "select staff_support_reply($1, 'One more thing.')", [t.id]);
  assert.equal((await me(amaka, "select id from member_notices where dismissed_at is null")).rows.length, 1);
  // Reading it in Toastly Help marks it read and clears the notice.
  await me(amaka, "select mark_support_replies_read($1)", [t.id]);
  assert.equal((await me(amaka, "select id from support_ticket_replies where read_at is null")).rows.length, 0);
  assert.equal((await me(amaka, "select id from member_notices where dismissed_at is null")).rows.length, 0);
});

test("an urgent ticket nobody opens within its reply time is re-alerted exactly once", async () => {
  const { db, me, svc, member, staff, conversation, file } = await setup();
  const amaka = await member("Amaka");
  const s = await staff();
  const due = await file(amaka, await conversation(amaka), "threat", "urgent", "safety");
  const opened = await file(amaka, await conversation(amaka), "unsafe", "urgent", "safety");
  const notYet = await file(amaka, await conversation(amaka), "scam", "urgent", "safety");
  const normal = await file(amaka, await conversation(amaka), "refund", "normal");
  await db.query("update support_tickets set sla_due_at = now() - interval '1 minute' where id in ($1, $2, $3)", [due.id, opened.id, normal.id]);
  await me(s, "select staff_support_ticket($1)", [opened.reference]);

  await assert.rejects(me(amaka, "select * from support_tickets_to_realert()"), /permission denied/);
  const first = (await svc("select reference from support_tickets_to_realert()")).rows.map((r) => r.reference);
  assert.deepEqual(first, [due.reference], "not opened, urgent, past its time — and nothing else");
  assert.deepEqual((await svc("select reference from support_tickets_to_realert()")).rows, [], "once");
  void notYet;
});

test("the database's 10-minute job calls the re-alert route only when an urgent ticket is due", async () => {
  const { db, me, member, staff, conversation, file } = await setup();
  // The job is scheduled in the database (Vercel Hobby runs crons daily at most).
  const job = (await db.query("select schedule, command from cron.job where jobname = 'toastly-support-realert'")).rows[0];
  assert.deepEqual(job, { schedule: "*/10 * * * *", command: "select public.support_realert_ping()" });

  // A stand-in for pg_net that records what would be requested.
  await db.exec(`
    create schema if not exists net;
    create table net.calls (url text, headers jsonb);
    create function net.http_get(url text, params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000)
    returns bigint language sql as $f$ insert into net.calls values (url, headers); select 1::bigint; $f$;
  `);
  const ping = async () => (await db.query("select support_realert_ping() as r")).rows[0].r;
  const calls = async () => (await db.query("select url, headers from net.calls")).rows;

  const amaka = await member("Amaka");
  const s = await staff();
  assert.equal(await ping(), "nothing due");
  const normal = await file(amaka, await conversation(amaka), "refund", "normal");
  const urgent = await file(amaka, await conversation(amaka), "threat", "urgent", "safety");
  await db.query("update support_tickets set sla_due_at = now() - interval '1 minute' where id = $1", [normal.id]);
  assert.equal(await ping(), "nothing due", "a normal ticket past its time doesn't page anyone; the urgent one isn't due yet");

  await db.query("update support_tickets set sla_due_at = now() - interval '1 minute' where id = $1", [urgent.id]);
  assert.equal(await ping(), "no secret", "without the Vault secret it warns and sends nothing");
  assert.deepEqual(await calls(), []);

  await db.query("select vault.create_secret('s3cret-value', 'cron_secret')");
  assert.equal(await ping(), "called");
  assert.deepEqual(await calls(), [
    { url: "https://www.trytoastly.com/api/cron/support-alerts", headers: { Authorization: "Bearer s3cret-value" } },
  ]);

  // Once the route has stamped it (or staff opened it), the job goes quiet.
  await me(s, "select staff_support_ticket($1)", [urgent.reference]);
  assert.equal(await ping(), "nothing due");
  await assert.rejects(me(amaka, "select support_realert_ping()"), /permission denied/);
});

test("the morning digest: open tickets, oldest first, numbers and urgency only", async () => {
  const { db, me, svc, member, staff, conversation, file } = await setup();
  const amaka = await member("Amaka");
  const s = await staff();
  const a = await file(amaka, await conversation(amaka), "refund", "normal");
  const b = await file(amaka, await conversation(amaka), "threat", "urgent", "safety");
  const c = await file(amaka, await conversation(amaka), "appeal", "normal");
  await db.query("update support_tickets set created_at = now() - interval '2 days' where id = $1", [b.id]);
  await me(s, "select staff_support_status($1, 'resolved')", [c.id]);
  const rows = (await svc("select * from support_open_digest()")).rows;
  assert.deepEqual(rows.map((r) => r.reference), [b.reference, a.reference]);
  assert.deepEqual(Object.keys(rows[0]).sort(), ["created_at", "opened", "reference", "urgency"]);
  await assert.rejects(me(s, "select * from support_open_digest()"), /permission denied/);
});

test("retention: the words go 30 days after the last message; reference and outcome stay", async () => {
  const { db, me, member, staff, conversation, file } = await setup();
  const amaka = await member("Amaka");
  const s = await staff();
  const oldT = await file(amaka, await conversation(amaka), "refund", "normal");
  const newT = await file(amaka, await conversation(amaka), "appeal", "normal");
  await me(s, "select staff_support_reply($1, 'Old reply')", [oldT.id]);
  await me(s, "select staff_support_reply($1, 'New reply')", [newT.id]);
  await db.query("update support_tickets set last_message_at = now() - interval '31 days' where id = $1", [oldT.id]);
  await db.query("update support_ticket_replies set created_at = now() - interval '31 days' where ticket_id = $1", [oldT.id]);

  await db.query("select purge_expired_retention()");
  const old = (await db.query("select reference, status, transcript from support_tickets where id = $1", [oldT.id])).rows[0];
  assert.equal(old.transcript, null);
  assert.equal(old.reference, oldT.reference);
  assert.equal(old.status, "replied");
  assert.equal((await db.query("select count(*)::int as n from support_ticket_replies where ticket_id = $1", [oldT.id])).rows[0].n, 0);
  const fresh = (await db.query("select transcript from support_tickets where id = $1", [newT.id])).rows[0];
  assert.ok(fresh.transcript);
  assert.equal((await db.query("select count(*)::int as n from support_ticket_replies where ticket_id = $1", [newT.id])).rows[0].n, 1);
});

test("deleting the account deletes its tickets, except safety ones, kept as a safety record without words", async () => {
  const { db, member, conversation, file } = await setup();
  const amaka = await member("Amaka");
  const normal = await file(amaka, await conversation(amaka), "refund", "normal");
  const safety = await file(amaka, await conversation(amaka), "threat", "urgent", "safety");
  await db.query("delete from auth.users where id = $1", [amaka]);

  assert.equal((await db.query("select count(*)::int as n from support_tickets")).rows[0].n, 0);
  const kept = (await db.query("select * from retained_safety_tickets")).rows;
  assert.equal(kept.length, 1);
  assert.equal(kept[0].reference, safety.reference);
  assert.equal(kept[0].former_profile_id, amaka);
  assert.equal(kept[0].category, "threat");
  assert.ok(!("transcript" in kept[0]) && !("summary" in kept[0]), "no words kept");
  const years = (Date.parse(kept[0].retain_until) - Date.now()) / (365.25 * 86_400_000);
  assert.ok(years > 1.99 && years < 2.01, "the safety-record period: 2 years");
  void normal;

  await db.query("update retained_safety_tickets set retain_until = now() - interval '1 day'");
  await db.query("select purge_expired_retention()");
  assert.equal((await db.query("select count(*)::int as n from retained_safety_tickets")).rows[0].n, 0);
});

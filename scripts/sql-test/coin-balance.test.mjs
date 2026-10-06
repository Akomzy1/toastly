/**
 * Coin balance and attendance (Prompt 17, migration 0023) — tested against a
 * throwaway Postgres (PGlite) with every migration applied. Never production.
 *
 *   node --test scripts/sql-test/
 *
 * Members act through their own signed-in role (row-level security on);
 * setup that a member can't do (seeding coins, moving the clock) runs as the
 * database owner.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { freshDb, as, asService, makeUser, goLive } from "./harness.mjs";

let db;
before(async () => {
  db = await freshDb();
});

const LAT = 6.4281; // Lekki, Lagos
const LNG = 3.4219;

async function verified(name) {
  const id = await makeUser(db, { name, email: `${name.toLowerCase().replace(/\W/g, "")}-${crypto.randomUUID()}@example.com` });
  await db.query("update profiles set stage = 'verified_real' where id = $1", [id]);
  await goLive(db, id);
  return id;
}

async function buy(id, coins) {
  await db.query("insert into coin_ledger (profile_id, delta, kind, bucket) values ($1, $2, 'purchase', 'purchased')", [id, coins]);
}

const bal = async (id) => (await db.query("select coin_balance($1) as b", [id])).rows[0].b;
const bought = async (id) => (await db.query("select purchased_balance($1) as b", [id])).rows[0].b;

/** A pair who finished a Gist, both said continue, and accepted a spot. */
async function pairWithSpot() {
  const a = await verified("Ada Test");
  const b = await verified("Bayo Test");
  const { rows: [g] } = await db.query(
    "insert into gist_sessions (proposer_id, invitee_id, status) values ($1, $2, 'completed') returning id",
    [a, b],
  );
  await db.query(
    "insert into gist_outcomes (session_id, profile_id, wants_to_continue) values ($1, $2, true), ($1, $3, true)",
    [g.id, a, b],
  );
  const { rows: [sp] } = await db.query(
    `insert into date_spots (session_id, place_id, name, address, category, lat, lng, status)
     values ($1, 'p1', 'Café Test', '1 Admiralty Way', (select enum_range(null::date_spot_category))[1], $2, $3, 'accepted')
     returning id`,
    [g.id, LAT, LNG],
  );
  return { a, b, spot: sp.id };
}

const inDays = (d) => new Date(Date.now() + d * 86_400_000).toISOString();

/** Propose (as a) and stake (as b): a confirmed date, stake 10 each. */
async function confirmedDate({ a, b, spot }, stake = 10) {
  const { rows: [r] } = await as(db, a, (tx) => tx.query("select date_propose($1, $2, $3) as id", [spot, inDays(2), stake]));
  await as(db, b, (tx) => tx.query("select date_stake($1)", [r.id]));
  return r.id;
}

/** Move a date's clock to "now" so the check-in window is open. */
const openWindow = (id) => db.query("update date_commitments set scheduled_for = now() where id = $1", [id]);
const pastWindow = (id) => db.query("update date_commitments set scheduled_for = now() - interval '3 hours' where id = $1", [id]);
const pastContest = (id) => db.query("update date_commitments set contest_deadline = now() - interval '1 minute' where id = $1", [id]);
const status = async (id) => (await db.query("select status::text from date_commitments where id = $1", [id])).rows[0].status;
const advance = (id) => db.query("select _date_advance($1)", [id]);

// --- The ledger ---------------------------------------------------------------

test("the ledger is append-only: no edits, no deletes, no member inserts", async () => {
  const a = await verified("Ledger Test");
  await buy(a, 20);
  await assert.rejects(db.query("update coin_ledger set delta = 999 where profile_id = $1", [a]), /append-only/);
  await assert.rejects(db.query("delete from coin_ledger where profile_id = $1", [a]), /append-only/);
  await assert.rejects(
    as(db, a, (tx) => tx.query("insert into coin_ledger (profile_id, delta, kind) values ($1, 500, 'purchase')", [a])),
  );
  assert.equal(await bal(a), 20);
});

test("deleting a whole account removes its ledger (the one allowed delete)", async () => {
  const a = await verified("Leaving Test");
  await buy(a, 5);
  await db.query("delete from auth.users where id = $1", [a]);
  assert.equal((await db.query("select count(*)::int as n from coin_ledger where profile_id = $1", [a])).rows[0].n, 0);
});

// --- Stakes and outcomes ---------------------------------------------------------

test("both attend: each stake returns to its owner, in one grouped transaction", async () => {
  const p = await pairWithSpot();
  await buy(p.a, 30);
  await buy(p.b, 30);
  const id = await confirmedDate(p);
  assert.equal(await status(id), "confirmed");
  assert.equal(await bal(p.a), 20);
  await openWindow(id);
  await as(db, p.a, (tx) => tx.query("select date_check_in($1, $2, $3)", [id, LAT, LNG]));
  const { rows: [r] } = await as(db, p.b, (tx) => tx.query("select date_check_in($1, $2, $3) as r", [id, LAT + 0.0005, LNG]));
  assert.equal(r.r, "both");
  assert.equal(await status(id), "completed");
  assert.equal(await bal(p.a), 30);
  assert.equal(await bal(p.b), 30);
  const { rows } = await db.query("select count(distinct txn_id)::int as t from coin_ledger where commitment_id = $1 and kind = 'stake_return'", [id]);
  assert.equal(rows[0].t, 1, "both returns share one transaction id");
});

test("one absent: provisional first, then their stake moves to the attender; Toastly keeps nothing", async () => {
  const p = await pairWithSpot();
  await buy(p.a, 30);
  await buy(p.b, 30);
  const total = (await bal(p.a)) + (await bal(p.b));
  const id = await confirmedDate(p);
  await openWindow(id);
  await as(db, p.a, (tx) => tx.query("select date_check_in($1, $2, $3)", [id, LAT, LNG]));
  await pastWindow(id);
  await advance(id);
  assert.equal(await status(id), "provisional_no_show");
  assert.equal(await bal(p.a), 20, "nothing moves while it's provisional");
  await pastContest(id);
  await advance(id);
  assert.equal(await status(id), "no_show");
  assert.equal(await bal(p.a), 40, "own stake back plus theirs");
  assert.equal(await bal(p.b), 20);
  assert.equal((await bal(p.a)) + (await bal(p.b)), total, "no coins created or kept");
  const ev = await db.query("select kind::text from trust_events where profile_id = $1 and kind = 'stake_forfeited'", [p.b]);
  assert.equal(ev.rows.length, 1, "Sentinel records the absent party");
});

test("a contested no-show waits for a person; nothing moves until it's resolved", async () => {
  const p = await pairWithSpot();
  await buy(p.a, 20);
  await buy(p.b, 20);
  const id = await confirmedDate(p);
  await openWindow(id);
  await as(db, p.a, (tx) => tx.query("select date_check_in($1, $2, $3)", [id, LAT, LNG]));
  await pastWindow(id);
  await advance(id);
  await as(db, p.b, (tx) => tx.query("select date_contest($1)", [id]));
  assert.equal(await status(id), "under_review");
  await pastContest(id);
  await advance(id);
  assert.equal(await status(id), "under_review", "the scheduled job doesn't decide contested cases");
  assert.equal(await bal(p.a), 10);
  assert.equal(await bal(p.b), 10);
  await asService(db, (tx) => tx.query("select resolve_attendance_review($1, true)", [id]));
  assert.equal(await status(id), "completed");
  assert.equal(await bal(p.a), 20);
  assert.equal(await bal(p.b), 20);
});

test("neither attends: both stakes come back", async () => {
  const p = await pairWithSpot();
  await buy(p.a, 10);
  await buy(p.b, 10);
  const id = await confirmedDate(p);
  await pastWindow(id);
  await advance(id);
  assert.equal(await bal(p.a), 10);
  assert.equal(await bal(p.b), 10);
});

test("check-in needs to be near the venue, and keeps no coordinates", async () => {
  const p = await pairWithSpot();
  await buy(p.a, 10);
  await buy(p.b, 10);
  const id = await confirmedDate(p);
  await openWindow(id);
  await assert.rejects(as(db, p.a, (tx) => tx.query("select date_check_in($1, $2, $3)", [id, LAT + 0.05, LNG])), /seem to be at/);
  const cols = (await db.query("select column_name from information_schema.columns where table_name = 'date_commitments'")).rows.map((r) => r.column_name);
  assert.ok(!cols.some((c) => /lat|lng|lon|coord/.test(c)), "no location column on dates");
});

// --- Buckets and cancellations ----------------------------------------------------------

test("only purchased coins can be staked", async () => {
  const p = await pairWithSpot();
  await asService(db, (tx) => tx.query("select grant_promo_coins($1, 50, 'launch')", [p.a]));
  await assert.rejects(
    as(db, p.a, (tx) => tx.query("select date_propose($1, $2, 10)", [p.spot, inDays(2)])),
    /purchased coins/,
  );
});

test("cancelling before the cut-off returns both stakes; after it, only safety cancels", async () => {
  const p = await pairWithSpot();
  await buy(p.a, 20);
  await buy(p.b, 20);
  const early = await confirmedDate(p);
  await as(db, p.b, (tx) => tx.query("select date_cancel($1, false)", [early]));
  assert.equal(await bal(p.a), 20);
  assert.equal(await bal(p.b), 20);

  const late = await confirmedDate(p);
  await db.query("update date_commitments set scheduled_for = now() + interval '2 hours' where id = $1", [late]);
  await assert.rejects(as(db, p.b, (tx) => tx.query("select date_cancel($1, false)", [late])), /reschedule/);
});

test("rescheduling by mutual agreement returns both stakes", async () => {
  const p = await pairWithSpot();
  await buy(p.a, 10);
  await buy(p.b, 10);
  const id = await confirmedDate(p);
  await as(db, p.a, (tx) => tx.query("select date_request_reschedule($1)", [id]));
  assert.equal(await bal(p.a), 0, "one request alone changes nothing");
  await as(db, p.b, (tx) => tx.query("select date_request_reschedule($1)", [id]));
  assert.equal(await bal(p.a), 10);
  assert.equal(await bal(p.b), 10);
});

// --- SAFETY OVERRIDE (Prompt 17's required test) ------------------------------------------
//
// A member who reports or cancels for safety can never lose coins — whatever
// state the date is in, and whichever side of it they were on.

test("SAFETY: reporting or cancelling for safety never costs the reporter a single coin", async () => {
  const scenarios = [
    { name: "report while the proposal is pending", run: async (p) => {
      const { rows: [r] } = await as(db, p.a, (tx) => tx.query("select date_propose($1, $2, 10) as id", [p.spot, inDays(2)]));
      return { id: r.id, reporter: p.a, reported: p.b };
    } },
    { name: "report after both staked", run: async (p) => ({ id: await confirmedDate(p), reporter: p.b, reported: p.a }) },
    { name: "safety cancel inside the cut-off", cancel: true, run: async (p) => {
      const id = await confirmedDate(p);
      await db.query("update date_commitments set scheduled_for = now() + interval '1 hour' where id = $1", [id]);
      return { id, reporter: p.b, reported: p.a };
    } },
    { name: "report while provisionally marked absent", run: async (p) => {
      const id = await confirmedDate(p);
      await openWindow(id);
      await as(db, p.a, (tx) => tx.query("select date_check_in($1, $2, $3)", [id, LAT, LNG]));
      await pastWindow(id);
      await advance(id);
      return { id, reporter: p.b, reported: p.a };
    } },
    { name: "report while the contest is under review", run: async (p) => {
      const id = await confirmedDate(p);
      await openWindow(id);
      await as(db, p.a, (tx) => tx.query("select date_check_in($1, $2, $3)", [id, LAT, LNG]));
      await pastWindow(id);
      await advance(id);
      await as(db, p.b, (tx) => tx.query("select date_contest($1)", [id]));
      return { id, reporter: p.b, reported: p.a };
    } },
    { name: "report after being settled as a no-show", run: async (p) => {
      const id = await confirmedDate(p);
      await openWindow(id);
      await as(db, p.a, (tx) => tx.query("select date_check_in($1, $2, $3)", [id, LAT, LNG]));
      await pastWindow(id);
      await advance(id);
      await pastContest(id);
      await advance(id);
      return { id, reporter: p.b, reported: p.a };
    } },
  ];

  for (const s of scenarios) {
    const p = await pairWithSpot();
    await buy(p.a, 25);
    await buy(p.b, 25);
    const before = { a: await bal(p.a), b: await bal(p.b) };
    const { id, reporter, reported } = await s.run(p);
    if (s.cancel) {
      await as(db, reporter, (tx) => tx.query("select date_cancel($1, true)", [id]));
    } else {
      await as(db, reporter, (tx) =>
        tx.query("insert into reports (reporter_id, reported_id, reason) values ($1, $2, 'harassment')", [reporter, reported]),
      );
    }
    const after = await bal(reporter);
    const was = reporter === p.a ? before.a : before.b;
    assert.ok(after >= was, `${s.name}: reporter had ${was}, now ${after}`);
    assert.equal((await bal(p.a)) + (await bal(p.b)), before.a + before.b, `${s.name}: Toastly kept or minted coins`);
  }
});

// --- Coins and subscriptions ---------------------------------------------------------------

test("coins pay Premium (35) and Premium Plus (70); promotional coins are spent first", async () => {
  const a = await verified("Subscriber Test");
  await buy(a, 30);
  await asService(db, (tx) => tx.query("select grant_promo_coins($1, 10, 'welcome')", [a]));
  const { rows: [r] } = await as(db, a, (tx) => tx.query("select subscribe_with_coins('premium') as r", []));
  assert.equal(r.r.paid, true);
  assert.equal(await bal(a), 5);
  assert.equal(await bought(a), 5, "the 10 promotional coins went first");
  assert.equal((await db.query("select current_tier($1)::text as t", [a])).rows[0].t, "premium");
});

test("coins can never pay a diaspora (dollar) plan — refused on the server", async () => {
  const a = await verified("Diaspora Test");
  await buy(a, 500);
  for (const tier of ["diaspora", "diaspora_plus"]) {
    await assert.rejects(as(db, a, (tx) => tx.query("select subscribe_with_coins($1::tier)", [tier])), /Diaspora plans are paid in dollars/);
  }
  assert.equal(await bal(a), 500, "nothing was spent");
});

test("not enough coins: nothing is spent, and the shortfall is reported in coins and naira", async () => {
  const a = await verified("Short Test");
  await buy(a, 20);
  const { rows: [r] } = await as(db, a, (tx) => tx.query("select subscribe_with_coins('premium') as r", []));
  assert.equal(r.r.paid, false);
  assert.equal(r.r.shortfall_coins, 15);
  assert.equal(r.r.shortfall_naira, 1500);
  assert.equal(await bal(a), 20);
});

// --- Holes stay closed --------------------------------------------------------------------

test("anonymous callers reach no date or coin function, and the old open settlement is gone", async () => {
  const fns = ["date_propose", "date_stake", "date_cancel", "date_check_in", "date_contest", "subscribe_with_coins", "resolve_attendance_review", "grant_promo_coins", "_date_payout", "_date_advance"];
  const { rows } = await db.query(
    `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any($1) and has_function_privilege('anon', p.oid, 'execute')`,
    [fns],
  );
  assert.deepEqual(rows.map((r) => r.proname), []);
  const members = await db.query(
    `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any($1) and has_function_privilege('authenticated', p.oid, 'execute')`,
    [["resolve_attendance_review", "grant_promo_coins", "_date_payout", "_date_advance", "date_advance_all_due"]],
  );
  assert.deepEqual(members.rows.map((r) => r.proname), [], "staff/internal functions are not callable by members");
  const old = await db.query("select count(*)::int as n from pg_proc where proname = 'settle_commitment'");
  assert.equal(old.rows[0].n, 0);
});

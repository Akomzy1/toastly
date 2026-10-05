/**
 * The two minimum-disclosure fixes in 0014: "is this phone already in use?"
 * and "did both say continue?" — each a yes/no, never more.
 */
import { randomUUID } from "node:crypto";

export default async function phoneAndContinue(t) {
  const { member, service, root } = t;

  // --- phone identity ----------------------------------------------------------
  const P = "phone identity (one number, one account)";
  const newUser = async (confirmed = true) => {
    const id = randomUUID();
    await root("insert into auth.users (id, raw_user_meta_data, phone_confirmed_at) values ($1, '{}', $2)", [id, confirmed ? new Date() : null]);
    return id;
  };
  const A = await newUser();
  const B = await newUser();
  const U = await newUser(false);

  t.refused(P, "a member cannot bind a phone hash themselves", await member(A, "select record_phone_verified($1, 'hash-a')", [A]), "42501");
  t.refused(P, "the server refuses a number Auth hasn't confirmed", await service("select record_phone_verified($1, 'hash-u')", [U]), "42501");
  t.ok(P, "the server binds A's confirmed number", await service("select record_phone_verified($1, 'hash-a')", [A]), 1);
  t.record(P, "…and records A as phone-verified", (await root("select stage from profiles where id = $1", [A])).rows[0].stage === "phone_verified");
  t.record(P, "B asking about A's number: in use", t.value(await member(B, "select phone_in_use('hash-a')")) === true);
  t.record(P, "A asking about their own number: not in use", t.value(await member(A, "select phone_in_use('hash-a')")) === false);
  t.record(P, "an unused number: not in use", t.value(await member(B, "select phone_in_use('hash-new')")) === false);
  t.empty(P, "the hashes themselves stay unreadable", await member(B, "select * from phone_identities"));
  t.refused(P, "B cannot be bound to A's number", await service("select record_phone_verified($1, 'hash-a')", [B]), "23505");
  t.refused(P, "A cannot be silently rebound to a new number", await service("select record_phone_verified($1, 'hash-a2')", [A]), "23505");
  t.ok(P, "re-confirming the same number is harmless", await service("select record_phone_verified($1, 'hash-a')", [A]), 1);

  // --- mutual continue -----------------------------------------------------------
  const G = "did both say continue?";
  const X = await t.makeLive("Continue X");
  const Y = await t.makeLive("Continue Y");
  const Z = await t.makeLive("Outsider Z");
  const session = async () =>
    (await root("insert into gist_sessions (proposer_id, invitee_id, status) values ($1, $2, 'completed') returning id", [X.id, Y.id])).rows[0].id;
  const ask = async (who, s) => t.value(await member(who.id, "select gist_mutual_continue($1)", [s]));
  const answer = (who, s, yes) =>
    root("insert into gist_outcomes (session_id, profile_id, wants_to_continue) values ($1, $2, $3)", [s, who.id, yes]);

  const both = await session();
  await answer(X, both, true);
  await answer(Y, both, true);
  t.record(G, "both said yes: X is told yes", (await ask(X, both)) === true);
  t.record(G, "both said yes: Y is told yes", (await ask(Y, both)) === true);
  t.record(G, "an outsider is never told", (await ask(Z, both)) === false);
  t.ok(G, "a date spot can now be suggested", await member(X.id, "insert into date_spots (session_id, place_id, name, address, category) values ($1, 'p1', 'Cafe', 'Yaba', 'cafe')", [both]), 1);

  const pending = await session();
  await answer(X, pending, true);
  const declined = await session();
  await answer(X, declined, true);
  await answer(Y, declined, false);
  const xPending = await ask(X, pending);
  const xDeclined = await ask(X, declined);
  t.record(G, "Y hasn't answered: X is told no", xPending === false);
  t.record(G, "Y said no: X is told exactly the same", xDeclined === xPending, "indistinguishable");
  t.empty(G, "X still cannot read Y's answer", await member(X.id, "select * from gist_outcomes where profile_id = $1", [Y.id]));
  t.refused(G, "no date spot without a mutual yes", await member(X.id, "insert into date_spots (session_id, place_id, name, address, category) values ($1, 'p2', 'Cafe', 'Yaba', 'cafe')", [declined]));

  // A participant whose own profile isn't live is not told either.
  await member(X.id, "delete from profile_photos where id = $1", [X.photos[3].id]);
  t.record(G, "a participant who isn't live is told no", (await ask(X, both)) === false);
  t.record(G, "the server still sees the true answer", t.value(await service("select gist_mutual_continue($1)", [both])) === true);
}

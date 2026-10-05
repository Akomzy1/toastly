-- Toastly — Prompt 17: the coin balance and date attendance (PRD §5.5).
--
-- HELD FROM PRODUCTION until the legal check in PRD §11 is confirmed
-- (a closed-loop coin balance must fall outside CBN e-money licensing).
-- The app refuses these flows in production unless COINS_LEGAL_CLEARED is
-- set; the schema below is inert until something calls it.
--
-- Supersedes 0005's "stake credit, usable only as a future deposit":
--   * every member has a coin balance — an APPEND-ONLY ledger; the balance
--     is derived, never edited;
--   * two buckets: PURCHASED (stakeable) and PROMOTIONAL (spendable, never
--     stakeable — otherwise free coins could be laundered through staged
--     no-shows into paid plans);
--   * stakes are held from purchased coins; outcomes are single atomic
--     transactions: both attend -> each stake returns to its owner; one
--     absent -> that stake moves to the member who attended. TOASTLY KEEPS
--     NOTHING. Coins are never refunded or paid out as cash, never sent
--     between members by choice — they move between members only as a
--     stake outcome;
--   * coins pay Premium and Premium Plus (naira) only — never a Diaspora
--     dollar plan. A member abroad using coins on a naira plan raises a
--     pricing-integrity review signal; it is never blocked;
--   * SAFETY OVERRIDES EVERYTHING: a safety cancellation, or a safety report
--     about the other person, returns the member's stake in full, always.
--
-- Interpretation, flagged: coins that move to the member who showed up are
-- put in their PURCHASED bucket (someone paid for them) — PRD §5.5 doesn't
-- say which bucket. If both members are absent, both stakes come back
-- (§5.5 is silent; Toastly keeping them is ruled out).

-- New enum values are used only inside function bodies below, which run
-- after this migration commits — never in a constraint here.
alter type coin_entry_kind add value if not exists 'promotional_grant';
alter type coin_entry_kind add value if not exists 'stake_from_absent';
alter type coin_entry_kind add value if not exists 'plan_spend';
alter type commitment_status add value if not exists 'provisional';
alter type commitment_status add value if not exists 'disputed';
alter type trust_event_kind add value if not exists 'date_contested';
alter type trust_event_kind add value if not exists 'date_outcome';

-- ---------------------------------------------------------------------------
-- 1. The balance
-- ---------------------------------------------------------------------------

alter table public.coin_ledger
  add column bucket text not null default 'purchased'
    check (bucket in ('purchased', 'promotional'));

-- Promotional coins never enter a stake.
alter table public.coin_ledger add constraint promotional_never_staked
  check (bucket = 'purchased' or kind::text not in ('stake_hold', 'stake_return', 'stake_from_absent'));

-- Append-only. A row is never edited; it is deleted only when the member's
-- account itself is deleted (the cascade).
create or replace function public.coin_ledger_append_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'The coin ledger is append-only.' using errcode = '42501';
  end if;
  if exists (select 1 from profiles where id = old.profile_id) then
    raise exception 'The coin ledger is append-only.' using errcode = '42501';
  end if;
  return old;
end;
$$;

create trigger coin_ledger_no_edits
  before update or delete on public.coin_ledger
  for each row execute function public.coin_ledger_append_only();

-- Nothing is ever withdrawable now; 0005's withdrawable view goes.
drop function if exists public.withdrawable_balance(uuid);

create or replace function public.stakeable_balance(p_profile_id uuid)
returns integer
language sql
stable
as $$
  select coalesce(sum(delta), 0)::int from public.coin_ledger
  where profile_id = p_profile_id and bucket = 'purchased';
$$;

create or replace function public.promotional_balance(p_profile_id uuid)
returns integer
language sql
stable
as $$
  select coalesce(sum(delta), 0)::int from public.coin_ledger
  where profile_id = p_profile_id and bucket = 'promotional';
$$;

-- Settings, as constants like daily_match_count(): one place each.
create or replace function public.coin_naira_value() returns integer language sql immutable as $$ select 100 $$;
create or replace function public.date_cancel_cutoff() returns interval language sql immutable as $$ select interval '12 hours' $$;
create or replace function public.date_contest_window() returns interval language sql immutable as $$ select interval '24 hours' $$;
create or replace function public.checkin_radius_m() returns integer language sql immutable as $$ select 200 $$;
-- Check-in opens 30 minutes before the date and closes two hours after.
create or replace function public.checkin_opens(p timestamptz) returns timestamptz language sql immutable as $$ select p - interval '30 minutes' $$;
create or replace function public.checkin_closes(p timestamptz) returns timestamptz language sql immutable as $$ select p + interval '2 hours' $$;

-- Buying coins and bonus grants. SERVICE ROLE ONLY (payment webhooks,
-- staff). Never a member-to-member path.
create or replace function public.credit_coin_purchase(p_profile_id uuid, p_coins integer, p_payment uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into coin_ledger (profile_id, delta, kind, bucket, note)
  values (p_profile_id, p_coins, 'purchase', 'purchased', 'Bought ' || p_coins || ' coins');
$$;

-- plpgsql, not sql: it names an enum value added in this same migration,
-- which a sql-language body would try to resolve before the value commits.
create or replace function public.grant_promotional_coins(p_profile_id uuid, p_coins integer, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into coin_ledger (profile_id, delta, kind, bucket, note)
  values (p_profile_id, p_coins, 'promotional_grant', 'promotional', coalesce(p_note, 'Bonus coins added'));
end;
$$;

revoke all on function public.credit_coin_purchase(uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.grant_promotional_coins(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.credit_coin_purchase(uuid, integer, uuid) to service_role;
grant execute on function public.grant_promotional_coins(uuid, integer, text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Dates: what's recorded
-- ---------------------------------------------------------------------------

alter table public.date_commitments
  add column a_checked_in_at timestamptz,
  add column b_checked_in_at timestamptz,
  add column absent_member uuid references public.profiles (id) on delete set null,
  add column contest_deadline timestamptz,
  add column contested_at timestamptz,
  add column contest_note text check (char_length(contest_note) <= 1000),
  add column cancelled_by uuid references public.profiles (id) on delete set null,
  add column safety boolean not null default false,
  add column settled_at timestamptz;

-- ---------------------------------------------------------------------------
-- 3. Settling — the only place coins move between members
-- ---------------------------------------------------------------------------
--
-- Replaces 0005. Returns only stakes that were actually put in. No row here
-- ever credits Toastly. SERVICE ROLE / internal only.
create or replace function public.settle_commitment(
  p_commitment_id uuid,
  p_outcome commitment_status,
  p_no_show_member uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.date_commitments;
  v_present uuid;
  v_absent_staked boolean;
begin
  select * into c from date_commitments where id = p_commitment_id for update;
  if not found then raise exception 'No such commitment'; end if;
  if c.settled_at is not null then return; end if;

  if p_outcome in ('completed', 'cancelled') then
    if c.a_staked_at is not null then
      insert into coin_ledger (profile_id, delta, kind, bucket, commitment_id, note)
      values (c.member_a, c.stake_coins, 'stake_return', 'purchased', c.id, 'Your ' || c.stake_coins || ' coins came back');
    end if;
    if c.b_staked_at is not null then
      insert into coin_ledger (profile_id, delta, kind, bucket, commitment_id, note)
      values (c.member_b, c.stake_coins, 'stake_return', 'purchased', c.id, 'Your ' || c.stake_coins || ' coins came back');
    end if;

  elsif p_outcome = 'no_show' then
    if p_no_show_member not in (c.member_a, c.member_b) then
      raise exception 'A no-show must name who did not turn up';
    end if;
    v_present := case when p_no_show_member = c.member_a then c.member_b else c.member_a end;
    v_absent_staked := case when p_no_show_member = c.member_a then c.a_staked_at is not null else c.b_staked_at is not null end;

    -- The member who showed up gets their own stake back...
    if (v_present = c.member_a and c.a_staked_at is not null) or (v_present = c.member_b and c.b_staked_at is not null) then
      insert into coin_ledger (profile_id, delta, kind, bucket, commitment_id, note)
      values (v_present, c.stake_coins, 'stake_return', 'purchased', c.id, 'Your ' || c.stake_coins || ' coins came back');
    end if;
    -- ...and the absent member's stake. Toastly keeps none of it.
    if v_absent_staked then
      insert into coin_ledger (profile_id, delta, kind, bucket, commitment_id, note)
      values (v_present, c.stake_coins, 'stake_from_absent', 'purchased', c.id,
              'They didn''t make it — their ' || c.stake_coins || ' coins are now in your balance');
    end if;
  else
    raise exception 'Not a settlement outcome: %', p_outcome;
  end if;

  update date_commitments
     set status = p_outcome, no_show_member = p_no_show_member, settled_at = now()
   where id = c.id;

  perform emit_trust_event(c.member_a, c.member_b, 'date_outcome', jsonb_build_object('outcome', p_outcome));
end;
$$;

revoke all on function public.settle_commitment(uuid, commitment_status, uuid) from public, anon, authenticated;
grant execute on function public.settle_commitment(uuid, commitment_status, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Member actions on a date
-- ---------------------------------------------------------------------------

-- Arrange a date from an accepted date spot. Both members must be live
-- (0013) — this is "create a date".
create or replace function public.create_date(p_spot uuid, p_when timestamptz, p_stake integer default 10)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_spot date_spots;
  v_other uuid;
  v_id uuid;
begin
  perform assert_live(v_me);
  select * into v_spot from date_spots where id = p_spot and status = 'accepted';
  if v_spot.id is null or not in_gist_session(v_spot.session_id, v_me) then
    raise exception 'Choose a spot you''ve both accepted first.';
  end if;
  select case when proposer_id = v_me then invitee_id else proposer_id end into v_other
    from gist_sessions where id = v_spot.session_id;
  if p_when <= now() then raise exception 'Choose a time in the future.'; end if;
  if p_stake < 1 or p_stake > 50 then raise exception 'A stake is between 1 and 50 coins.'; end if;

  insert into date_commitments (member_a, member_b, created_by, scheduled_for, stake_coins, date_spot_id, venue_name, venue_address)
  values (v_me, v_other, v_me, p_when, p_stake, v_spot.id, v_spot.name, v_spot.address)
  returning id into v_id;
  return v_id;
end;
$$;

-- Put the stake in. Purchased coins only.
create or replace function public.stake_date(p_commitment uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  c date_commitments;
begin
  perform assert_live(v_me);
  select * into c from date_commitments where id = p_commitment for update;
  if c.id is null or v_me not in (c.member_a, c.member_b) then raise exception 'No such date.'; end if;
  if c.status <> 'pending' then raise exception 'This date isn''t waiting for a stake.'; end if;
  if (v_me = c.member_a and c.a_staked_at is not null) or (v_me = c.member_b and c.b_staked_at is not null) then
    return;
  end if;
  if stakeable_balance(v_me) < c.stake_coins then
    raise exception 'not_enough_coins' using errcode = 'P0001';
  end if;

  insert into coin_ledger (profile_id, delta, kind, bucket, commitment_id, note)
  values (v_me, -c.stake_coins, 'stake_hold', 'purchased', c.id, 'Staked ' || c.stake_coins || ' coins for a date');

  if v_me = c.member_a then
    update date_commitments set a_staked_at = now() where id = c.id;
  else
    update date_commitments set b_staked_at = now() where id = c.id;
  end if;
end;
$$;

-- Great-circle distance in metres between two points.
create or replace function public.metres_between(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- "I'm here." The location is used for this one comparison and never
-- stored: only the result (a timestamp) is kept.
create or replace function public.check_in(p_commitment uuid, p_lat double precision, p_lng double precision)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  c date_commitments;
  v_spot date_spots;
begin
  select * into c from date_commitments where id = p_commitment for update;
  if c.id is null or v_me not in (c.member_a, c.member_b) then raise exception 'No such date.'; end if;
  if c.status <> 'confirmed' then return 'not_confirmed'; end if;
  if now() < checkin_opens(c.scheduled_for) or now() > checkin_closes(c.scheduled_for) then return 'outside_window'; end if;
  select * into v_spot from date_spots where id = c.date_spot_id;
  if v_spot.lat is null or v_spot.lng is null then return 'venue_unknown'; end if;
  if metres_between(p_lat, p_lng, v_spot.lat, v_spot.lng) > checkin_radius_m() then return 'too_far'; end if;

  if v_me = c.member_a then
    update date_commitments set a_checked_in_at = coalesce(a_checked_in_at, now()) where id = c.id;
  else
    update date_commitments set b_checked_in_at = coalesce(b_checked_in_at, now()) where id = c.id;
  end if;

  select * into c from date_commitments where id = c.id;
  if c.a_checked_in_at is not null and c.b_checked_in_at is not null then
    perform settle_commitment(c.id, 'completed');
    return 'both_here';
  end if;
  return 'checked_in';
end;
$$;

-- After the window: both here is already settled; one here starts a
-- 24-hour provisional no-show; nobody here returns both stakes. Called
-- lazily when a date is read, and by a scheduled job.
create or replace function public.close_date_window(p_commitment uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c date_commitments;
  v_absent uuid;
begin
  select * into c from date_commitments where id = p_commitment for update;
  if c.id is null then return; end if;

  -- An unconfirmed date whose time has passed: the stake that went in comes back.
  if c.status = 'pending' and now() > c.scheduled_for then
    perform settle_commitment(c.id, 'cancelled');
    return;
  end if;

  if c.status = 'confirmed' and now() > checkin_closes(c.scheduled_for) then
    if (c.a_checked_in_at is null) <> (c.b_checked_in_at is null) then
      v_absent := case when c.a_checked_in_at is null then c.member_a else c.member_b end;
      update date_commitments
         set status = 'provisional', absent_member = v_absent, contest_deadline = now() + date_contest_window()
       where id = c.id;
    elsif c.a_checked_in_at is null and c.b_checked_in_at is null then
      perform settle_commitment(c.id, 'cancelled');
    end if;
    return;
  end if;

  if c.status = 'provisional' and now() > c.contest_deadline then
    perform settle_commitment(c.id, 'no_show', c.absent_member);
  end if;
end;
$$;

create or replace function public.settle_due_dates()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  n integer := 0;
begin
  for c in select id from date_commitments where settled_at is null and status in ('pending', 'confirmed', 'provisional') loop
    perform close_date_window(c.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.settle_due_dates() from public, anon, authenticated;
grant execute on function public.settle_due_dates() to service_role;

-- The absent member's answer, within 24 hours:
--   came_up   "Something came up" — the stake goes, as both agreed
--   unsafe    "I didn't feel safe" — the stake comes back in full, always
--   was_there "What happened?" — a person looks; NOTHING moves until settled
create or replace function public.answer_no_show(p_commitment uuid, p_answer text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  c date_commitments;
  v_other uuid;
begin
  select * into c from date_commitments where id = p_commitment for update;
  if c.id is null or c.status <> 'provisional' or c.absent_member is distinct from v_me then
    raise exception 'There''s nothing to answer on this date.';
  end if;
  v_other := case when c.member_a = v_me then c.member_b else c.member_a end;

  if p_answer = 'unsafe' then
    update date_commitments set safety = true where id = c.id;
    perform settle_commitment(c.id, 'cancelled');
  elsif p_answer = 'came_up' then
    perform settle_commitment(c.id, 'no_show', v_me);
  elsif p_answer = 'was_there' then
    if now() > c.contest_deadline then raise exception 'The 24 hours to respond have passed.'; end if;
    update date_commitments
       set status = 'disputed', contested_at = now(), contest_note = left(p_note, 1000)
     where id = c.id;
    perform emit_trust_event(v_me, v_other, 'date_contested', '{}'::jsonb);
    perform raise_case('date', v_me, v_other, 'dispute', c.id,
      'Member says they were there. The other person checked in; they didn''t.');
  else
    raise exception 'Not an answer: %', p_answer;
  end if;
end;
$$;

-- Cancel. Free before the cut-off (both stakes back) and ALWAYS free for
-- safety. After the cut-off, a cancellation is treated as not turning up:
-- the canceller's stake goes to the other person, as both agreed.
create or replace function public.cancel_date(p_commitment uuid, p_safety boolean default false)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  c date_commitments;
begin
  select * into c from date_commitments where id = p_commitment for update;
  if c.id is null or v_me not in (c.member_a, c.member_b) then raise exception 'No such date.'; end if;
  if c.settled_at is not null or c.status not in ('pending', 'confirmed') then
    raise exception 'This date can''t be cancelled now.';
  end if;

  update date_commitments set cancelled_by = v_me, safety = p_safety where id = c.id;

  if p_safety or c.status = 'pending' or now() < c.scheduled_for - date_cancel_cutoff() then
    perform settle_commitment(c.id, 'cancelled');
    return 'free';
  end if;
  perform settle_commitment(c.id, 'no_show', v_me);
  return 'late';
end;
$$;

-- A member's OWN date, whatever their profile's status. Attendance and the
-- safety exits must never depend on it: a member whose profile was hidden
-- on the day (a photo removed) still needs to check in, cancel safely or
-- answer a no-show, or the stake would pressure them. Creating and staking
-- a date stay behind the live guard. The other person appears by first
-- name only — the name the member already arranged the date with.
create or replace function public.date_for_member(p_commitment uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  c date_commitments;
  v_other uuid;
begin
  perform close_date_window(p_commitment);
  select * into c from date_commitments where id = p_commitment;
  if c.id is null or v_me not in (c.member_a, c.member_b) then return null; end if;
  v_other := case when c.member_a = v_me then c.member_b else c.member_a end;
  return jsonb_build_object(
    'id', c.id,
    'status', c.status,
    'scheduled_for', c.scheduled_for,
    'stake', c.stake_coins,
    'venue', c.venue_name,
    'address', c.venue_address,
    'other_name', split_part((select display_name from profiles where id = v_other), ' ', 1),
    'you_staked', case when v_me = c.member_a then c.a_staked_at is not null else c.b_staked_at is not null end,
    'they_staked', case when v_me = c.member_a then c.b_staked_at is not null else c.a_staked_at is not null end,
    'you_checked_in', case when v_me = c.member_a then c.a_checked_in_at is not null else c.b_checked_in_at is not null end,
    'they_checked_in', case when v_me = c.member_a then c.b_checked_in_at is not null else c.a_checked_in_at is not null end,
    'you_absent', c.absent_member = v_me,
    'they_absent', c.absent_member = v_other,
    'contest_deadline', c.contest_deadline,
    'free_cancel_until', c.scheduled_for - date_cancel_cutoff(),
    'checkin_opens', checkin_opens(c.scheduled_for),
    'checkin_closes', checkin_closes(c.scheduled_for),
    'safety', c.safety,
    'cancelled_by_you', c.cancelled_by = v_me,
    'settled_at', c.settled_at,
    'no_show_member_is_you', c.no_show_member = v_me,
    'stakeable', stakeable_balance(v_me),
    'bonus', promotional_balance(v_me)
  );
end;
$$;

revoke all on function public.date_for_member(uuid) from public, anon;
grant execute on function public.date_for_member(uuid) to authenticated;

revoke all on function public.create_date(uuid, timestamptz, integer) from public, anon;
revoke all on function public.stake_date(uuid) from public, anon;
revoke all on function public.check_in(uuid, double precision, double precision) from public, anon;
revoke all on function public.close_date_window(uuid) from public, anon;
revoke all on function public.answer_no_show(uuid, text, text) from public, anon;
revoke all on function public.cancel_date(uuid, boolean) from public, anon;
grant execute on function public.create_date(uuid, timestamptz, integer) to authenticated;
grant execute on function public.stake_date(uuid) to authenticated;
grant execute on function public.check_in(uuid, double precision, double precision) to authenticated;
grant execute on function public.close_date_window(uuid) to authenticated;
grant execute on function public.answer_no_show(uuid, text, text) to authenticated;
grant execute on function public.cancel_date(uuid, boolean) to authenticated;

-- A safety REPORT about the other person also returns the reporter's stake
-- in full, on any open date between them — and the other's too. Overrides
-- every other rule.
create or replace function public.safety_report_returns_stakes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
begin
  if new.reporter_id is null or new.reported_id is null then return new; end if;
  for c in
    select id from date_commitments
    where settled_at is null and status in ('pending', 'confirmed', 'provisional', 'disputed')
      and ((member_a = new.reporter_id and member_b = new.reported_id)
        or (member_b = new.reporter_id and member_a = new.reported_id))
  loop
    update date_commitments set safety = true, cancelled_by = new.reporter_id where id = c.id;
    perform settle_commitment(c.id, 'cancelled');
  end loop;
  return new;
end;
$$;

create trigger reports_return_stakes
  after insert on public.reports
  for each row execute function public.safety_report_returns_stakes();

-- ---------------------------------------------------------------------------
-- 5. Paying a naira plan with coins
-- ---------------------------------------------------------------------------
--
-- Coins apply first; whatever is left is paid by Paystack. Diaspora dollar
-- plans can never be paid with coins — refused here, not just in the UI.
-- A member abroad paying a naira plan with coins raises a pricing signal
-- for a person to look at, and is NOT blocked (PRD §5.5 rule 4, §7).
create or replace function public.plan_naira_price(p_tier tier)
returns integer
language sql
immutable
as $$
  select case p_tier when 'premium' then 3500 when 'premium_plus' then 7000 end;
$$;

create or replace function public.coin_checkout_quote(p_tier tier)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_price integer := plan_naira_price(p_tier);
  v_have integer;
  v_use integer;
begin
  if v_price is null then
    raise exception 'coins_naira_only' using errcode = 'P0001',
      hint = 'Coins pay Premium and Premium Plus only — never a Diaspora plan.';
  end if;
  v_have := greatest(coin_balance(v_me), 0);
  v_use := least(v_have, ceil(v_price::numeric / coin_naira_value())::int);
  return jsonb_build_object(
    'price', v_price, 'coins_used', v_use,
    'naira_left', greatest(v_price - v_use * coin_naira_value(), 0)
  );
end;
$$;

-- Spend the coins for a plan. The whole price in coins grants a month now;
-- a part-coin checkout spends the coins only once Paystack confirms the
-- rest (p_paid_reference, set by the payment webhook — not wired yet).
create or replace function public.pay_plan_with_coins(p_tier tier, p_paid_reference text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  q jsonb := coin_checkout_quote(p_tier);
  v_use integer := (q ->> 'coins_used')::int;
  v_promo integer;
  v_left integer := (q ->> 'naira_left')::int;
begin
  if v_left > 0 and p_paid_reference is null then
    raise exception 'remainder_unpaid' using errcode = 'P0001';
  end if;

  -- Bonus coins first, so stakeable coins are kept for dates.
  v_promo := least(greatest(promotional_balance(v_me), 0), v_use);
  if v_promo > 0 then
    insert into coin_ledger (profile_id, delta, kind, bucket, note)
    values (v_me, -v_promo, 'plan_spend', 'promotional', 'Used ' || v_promo || ' coins for ' || initcap(replace(p_tier::text, '_', ' ')));
  end if;
  if v_use - v_promo > 0 then
    insert into coin_ledger (profile_id, delta, kind, bucket, note)
    values (v_me, -(v_use - v_promo), 'plan_spend', 'purchased', 'Used ' || (v_use - v_promo) || ' coins for ' || initcap(replace(p_tier::text, '_', ' ')));
  end if;

  insert into entitlements (profile_id, tier, source, ends_at)
  values (v_me, p_tier, 'subscription', now() + interval '1 month');

  if (select country_code from profiles where id = v_me) <> 'NG' then
    insert into integrity_reviews (profile_id, signal, detail)
    values (v_me, 'payment_geography_mismatch', jsonb_build_object('coins_on_naira_plan', true, 'plan', p_tier));
  end if;

  return q;
end;
$$;

revoke all on function public.coin_checkout_quote(tier) from public, anon;
revoke all on function public.pay_plan_with_coins(tier, text) from public, anon;
grant execute on function public.coin_checkout_quote(tier) to authenticated;
grant execute on function public.pay_plan_with_coins(tier, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Date disputes in the review queue
-- ---------------------------------------------------------------------------
--
-- 0018's decide_case, plus two answers for a date dispute — "both attended"
-- (both stakes back) and "the no-show stands" (the stake moves) — in place
-- of the generic set, as for photo checks. Flagged: the prototype shows the
-- generic five for every case.
create or replace function public.decide_case(p_case bigint, p_action text, p_note text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c review_cases;
  v_me staff_members;
  v_reason standing_reason;
  v_replaced text;
begin
  select * into v_me from staff_members where user_id = auth.uid();
  if v_me.user_id is null then
    raise exception 'Staff only.' using errcode = '42501';
  end if;

  select * into c from review_cases where id = p_case for update;
  if c.id is null then raise exception 'No such case.'; end if;
  if c.status = 'decided' then raise exception 'This case is already decided.'; end if;

  if p_action = 'assign' then
    update review_cases set assigned_to = v_me.user_id, status = 'in_review', updated_at = now() where id = c.id;
    insert into review_decisions (case_id, staff_id, staff_name, action, note)
    values (c.id, v_me.user_id, v_me.display_name, 'assign', 'Assigned to self.');
    return null;
  end if;

  if coalesce(char_length(trim(p_note)), 0) < 12 then
    raise exception 'A reason is required: a short sentence is enough.';
  end if;

  if c.kind in ('photo', 'selfie') then
    if p_action not in ('confirm_match', 'not_match', 'restrict', 'remove') then
      raise exception 'Not a decision for a photo check.';
    end if;
  elsif c.kind = 'date' then
    if p_action not in ('both_attended', 'no_show_stands', 'restrict', 'remove') then
      raise exception 'Not a decision for a date dispute.';
    end if;
  elsif p_action not in ('clear', 'switch', 'reverify', 'restrict', 'remove')
     or (p_action = 'switch' and c.kind <> 'pricing') then
    raise exception 'Not a decision for this case.';
  end if;

  insert into review_decisions (case_id, staff_id, staff_name, action, note)
  values (c.id, v_me.user_id, v_me.display_name, p_action, trim(p_note));

  v_reason := case c.kind
    when 'pricing' then 'pricing'::standing_reason
    when 'married' then 'married'::standing_reason
    when 'photo' then 'photos'::standing_reason
    when 'selfie' then 'verification'::standing_reason
    else 'safety'::standing_reason end;

  if p_action = 'confirm_match' then
    if c.kind = 'selfie' then
      v_replaced := record_onboarding_check(c.source_id, 'passed', 'matched');
    else
      v_replaced := record_main_photo_match(c.source_id, 'matched');
    end if;
    update review_cases set status = 'decided', decided_at = now(), updated_at = now() where id = c.id;

  elsif p_action = 'not_match' then
    if c.kind = 'selfie' then
      perform record_onboarding_check(c.source_id, 'retake', 'mismatch', 'not_matching');
    else
      perform record_main_photo_match(c.source_id, 'mismatch', 'not_matching');
    end if;
    update review_cases set status = 'decided', decided_at = now(), updated_at = now() where id = c.id;

  elsif p_action = 'both_attended' then
    perform settle_commitment(c.source_id, 'completed');
    update review_cases set status = 'decided', decided_at = now(), updated_at = now() where id = c.id;

  elsif p_action = 'no_show_stands' then
    perform settle_commitment(c.source_id, 'no_show', (select absent_member from date_commitments where id = c.source_id));
    update review_cases set status = 'decided', decided_at = now(), updated_at = now() where id = c.id;

  elsif p_action = 'clear' then
    update profiles set standing = 'good', standing_reason = null, standing_changed_at = now()
     where id = c.subject_id and standing = 'restricted';
    delete from blocked_identifiers where case_id = c.id and retain_until is null;
    update review_cases set status = 'decided', decided_at = now(), updated_at = now() where id = c.id;

  elsif p_action in ('switch', 'reverify') then
    if p_action = 'reverify' then
      update profiles set reverification_requested_at = now() where id = c.subject_id;
    end if;
    update review_cases set status = 'waiting_on_member', updated_at = now() where id = c.id;

  elsif p_action = 'restrict' then
    update profiles set standing = 'restricted', standing_reason = v_reason, standing_changed_at = now()
     where id = c.subject_id and standing = 'good';
    perform end_couple_of(c.subject_id);
    update review_cases set status = 'in_review', assigned_to = v_me.user_id, updated_at = now() where id = c.id;

  elsif p_action = 'remove' then
    update profiles set standing = 'removed', standing_reason = v_reason, standing_changed_at = now()
     where id = c.subject_id;
    perform end_couple_of(c.subject_id);
    if c.subject_id is not null then
      perform block_identifiers_of(c.subject_id, v_reason, c.id, now() + interval '2 years');
    end if;
    update blocked_identifiers set retain_until = now() + interval '2 years', reason = v_reason
     where case_id = c.id and retain_until is null;
    update review_cases set status = 'decided', decided_at = now(), updated_at = now() where id = c.id;
  end if;

  return v_replaced;
end;
$$;

alter table public.review_decisions drop constraint review_decisions_action_check;
alter table public.review_decisions add constraint review_decisions_action_check check (action in (
  'raised', 'assign', 'clear', 'switch', 'reverify', 'restrict', 'remove',
  'confirm_match', 'not_match', 'both_attended', 'no_show_stands'
));

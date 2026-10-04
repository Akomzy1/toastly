-- Toastly — the coin balance and date attendance (build prompt 17; PRD §5.5).
--
-- Legal check in PRD §11 confirmed by the owner on 4 October 2026 (a closed-loop, non-withdrawable coin balance moved only by stake
-- outcomes must fall outside CBN e-money and payment-service licensing; the
-- no-refund terms must hold for UK diaspora buyers).
--
-- Replaces the "stake credit usable only as a future deposit" mechanic:
--   * Both attend -> each stake returns to its owner.
--   * One absent  -> their stake moves to the member who attended.
--   * Toastly keeps nothing, ever.
--   * Coins pay Premium / Premium Plus (naira) only — never a diaspora plan.
--   * Only PURCHASED coins can be staked; promotional coins sit apart.
--   * Never withdrawn, refunded as cash, or sent between members by choice.
--     The only cross-member movement is a stake outcome, written as one
--     atomic, grouped ledger transaction.
--   * A safety cancellation or a safety report returns the reporter's stake
--     in full and overrides every other rule.
--
-- Also closes a hole from 0005: settle_commitment() was SECURITY DEFINER and
-- executable by anyone (including anonymous callers) — it could settle any
-- date, twice, minting coins. It is dropped; settlement is internal now.

set search_path = public;

-- ---------------------------------------------------------------------------
-- Configuration (decisions of 3 October 2026; PRD §11 lists what's not final)
-- ---------------------------------------------------------------------------

create table if not exists public.coin_config (
  id boolean primary key default true check (id),
  coin_naira integer not null default 100,           -- one coin = ₦100 towards a subscription
  premium_coins integer not null default 35,          -- ₦3,500
  premium_plus_coins integer not null default 70,     -- ₦7,000
  subscription_days integer not null default 30,
  stake_min integer not null default 5,
  stake_max integer not null default 50,
  cancel_cutoff_hours integer not null default 12,
  contest_hours integer not null default 24,
  checkin_radius_m integer not null default 250,
  window_before_min integer not null default 30,
  window_after_min integer not null default 90
);
insert into public.coin_config (id) values (true) on conflict (id) do nothing;

alter table public.coin_config enable row level security;
create policy "coin config readable" on public.coin_config for select using (true);
revoke insert, update, delete on public.coin_config from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The ledger: append-only, two buckets, grouped transactions
-- ---------------------------------------------------------------------------

alter type coin_entry_kind add value if not exists 'stake_award';         -- absent member's stake, to the attender
alter type coin_entry_kind add value if not exists 'subscription_spend';  -- paid Premium / Premium Plus with coins
alter type coin_entry_kind add value if not exists 'promo_grant';         -- promotional coins (not stakeable)
alter type coin_entry_kind add value if not exists 'safety_restore';      -- a safety report restored a lost stake
alter type coin_entry_kind add value if not exists 'award_reversal';      -- ...funded by the reported member's award

alter table public.coin_ledger
  add column if not exists bucket text not null default 'purchased'
    check (bucket in ('purchased', 'promotional')),
  -- Rows written together by one outcome share a txn_id: the audit trail.
  add column if not exists txn_id uuid,
  add column if not exists counterparty_id uuid references public.profiles (id) on delete set null;

create index if not exists coin_ledger_txn_idx on public.coin_ledger (txn_id);

-- Append-only. No row is ever edited; none is deleted except when the
-- member's whole account goes (the profile row is already gone by then).
create or replace function public.coin_ledger_append_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'The coin ledger is append-only.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' and exists (select 1 from public.profiles where id = old.profile_id) then
    raise exception 'The coin ledger is append-only.' using errcode = '42501';
  end if;
  return coalesce(old, new);
end;
$$;

drop trigger if exists coin_ledger_append_only on public.coin_ledger;
create trigger coin_ledger_append_only
  before update or delete on public.coin_ledger
  for each row execute function public.coin_ledger_append_only();

-- Members write nothing to the ledger directly; only the functions below do.
revoke insert, update, delete on public.coin_ledger from anon, authenticated;

create or replace function public.purchased_balance(p_profile_id uuid)
returns integer language sql stable as $$
  select coalesce(sum(delta), 0)::int from public.coin_ledger
  where profile_id = p_profile_id and bucket = 'purchased';
$$;

create or replace function public.promo_balance(p_profile_id uuid)
returns integer language sql stable as $$
  select coalesce(sum(delta), 0)::int from public.coin_ledger
  where profile_id = p_profile_id and bucket = 'promotional';
$$;

-- Promotional coins: server only, never stakeable.
create or replace function public.grant_promo_coins(p_profile_id uuid, p_coins integer, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_coins <= 0 then raise exception 'Grant a positive number of coins.'; end if;
  insert into coin_ledger (profile_id, delta, kind, bucket, note, txn_id)
  values (p_profile_id, p_coins, 'promo_grant', 'promotional', left(p_note, 200), gen_random_uuid());
end;
$$;
revoke all on function public.grant_promo_coins(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.grant_promo_coins(uuid, integer, text) to service_role;

-- ---------------------------------------------------------------------------
-- Dates: proposal, stakes, check-in, contest
-- ---------------------------------------------------------------------------

alter type commitment_status add value if not exists 'provisional_no_show';
alter type commitment_status add value if not exists 'under_review';

alter table public.date_commitments
  add column if not exists session_id uuid references public.gist_sessions (id) on delete set null,
  add column if not exists proposed_by uuid references public.profiles (id) on delete set null,
  add column if not exists a_checked_in_at timestamptz,
  add column if not exists b_checked_in_at timestamptz,
  add column if not exists contest_deadline timestamptz,
  add column if not exists contested_at timestamptz,
  add column if not exists cancel_reason text
    check (cancel_reason in ('notice', 'declined', 'reschedule', 'safety', 'neither_attended')),
  add column if not exists cancelled_by uuid references public.profiles (id) on delete set null,
  add column if not exists a_reschedule_at timestamptz,
  add column if not exists b_reschedule_at timestamptz,
  add column if not exists settled_at timestamptz;

-- Contested no-shows wait here for a person. Nothing moves until resolved.
create table if not exists public.attendance_reviews (
  commitment_id uuid primary key references public.date_commitments (id) on delete cascade,
  contested_by uuid not null references public.profiles (id) on delete cascade,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  outcome text check (outcome in ('attended', 'no_show'))
);
alter table public.attendance_reviews enable row level security;
revoke all on public.attendance_reviews from anon, authenticated;

alter type trust_event_kind add value if not exists 'attendance_contested';
alter type trust_event_kind add value if not exists 'attendance_outcome';

-- Internal: pay out one outcome as a single grouped ledger transaction.
-- p_kind: 'return_both' | 'award' (p_absent's stake to the other) | 'return_one' (only p_member's stake back)
create or replace function public._date_payout(c public.date_commitments, p_kind text, p_absent uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txn uuid := gen_random_uuid();
  v_attender uuid;
begin
  if p_kind = 'return_both' then
    if c.a_staked_at is not null then
      insert into coin_ledger (profile_id, delta, kind, bucket, commitment_id, txn_id)
      values (c.member_a, c.stake_coins, 'stake_return', 'purchased', c.id, v_txn);
    end if;
    if c.b_staked_at is not null then
      insert into coin_ledger (profile_id, delta, kind, bucket, commitment_id, txn_id)
      values (c.member_b, c.stake_coins, 'stake_return', 'purchased', c.id, v_txn);
    end if;
  elsif p_kind = 'award' then
    v_attender := case when p_absent = c.member_a then c.member_b else c.member_a end;
    -- The attender's own stake comes back...
    insert into coin_ledger (profile_id, delta, kind, bucket, commitment_id, txn_id)
    values (v_attender, c.stake_coins, 'stake_return', 'purchased', c.id, v_txn);
    -- ...and the absent member's stake moves to them. Toastly keeps nothing.
    insert into coin_ledger (profile_id, delta, kind, bucket, commitment_id, txn_id, counterparty_id)
    values (v_attender, c.stake_coins, 'stake_award', 'purchased', c.id, v_txn, p_absent);
  end if;
end;
$$;
revoke all on function public._date_payout(public.date_commitments, text, uuid) from public, anon, authenticated;

create or replace function public._date_hold(c public.date_commitments, p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if purchased_balance(p_member) < c.stake_coins then
    raise exception 'You need % purchased coins to stake this date.', c.stake_coins using errcode = '42501';
  end if;
  insert into coin_ledger (profile_id, delta, kind, bucket, commitment_id, txn_id)
  values (p_member, -c.stake_coins, 'stake_hold', 'purchased', c.id, gen_random_uuid());
end;
$$;
revoke all on function public._date_hold(public.date_commitments, uuid) from public, anon, authenticated;

create or replace function public._date_outcome_event(c public.date_commitments, p_outcome text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform emit_trust_event(c.member_a, c.member_b, 'attendance_outcome', jsonb_build_object('outcome', p_outcome));
  perform emit_trust_event(c.member_b, c.member_a, 'attendance_outcome', jsonb_build_object('outcome', p_outcome));
end;
$$;
revoke all on function public._date_outcome_event(public.date_commitments, text) from public, anon, authenticated;

-- Propose a date at an accepted spot, staking your own purchased coins.
create or replace function public.date_propose(p_spot_id uuid, p_at timestamptz, p_stake integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  cfg coin_config;
  sp date_spots;
  g gist_sessions;
  v_other uuid;
  c date_commitments;
begin
  select * into cfg from coin_config;
  select * into sp from date_spots where id = p_spot_id;
  if not found or sp.status <> 'accepted' then
    raise exception 'Accept a spot first.' using errcode = '42501';
  end if;
  select * into g from gist_sessions where id = sp.session_id;
  if v_me is null or v_me not in (g.proposer_id, g.invitee_id) then
    raise exception 'That spot isn''t yours to book.' using errcode = '42501';
  end if;
  if sp.lat is null or sp.lng is null then
    raise exception 'This spot has no map location, so check-in can''t work there. Pick another.' using errcode = '22023';
  end if;
  if p_stake < cfg.stake_min or p_stake > cfg.stake_max then
    raise exception 'Stake between % and % coins.', cfg.stake_min, cfg.stake_max using errcode = '22023';
  end if;
  if p_at < now() + make_interval(hours => cfg.cancel_cutoff_hours) or p_at > now() + interval '14 days' then
    raise exception 'Pick a time at least % hours away, within two weeks.', cfg.cancel_cutoff_hours using errcode = '22023';
  end if;
  v_other := case when v_me = g.proposer_id then g.invitee_id else g.proposer_id end;
  if exists (
    select 1 from date_commitments d
    where ((d.member_a = v_me and d.member_b = v_other) or (d.member_a = v_other and d.member_b = v_me))
      and d.status in ('pending', 'confirmed', 'provisional_no_show', 'under_review')
  ) then
    raise exception 'You already have a date planned with them.' using errcode = '23505';
  end if;

  insert into date_commitments (member_a, member_b, stake_coins, scheduled_for, date_spot_id,
                                venue_name, venue_address, session_id, proposed_by)
  values (v_me, v_other, p_stake, p_at, sp.id, sp.name, sp.address, sp.session_id, v_me)
  returning * into c;

  perform _date_hold(c, v_me);
  update date_commitments set a_staked_at = now() where id = c.id;
  return c.id;
end;
$$;

-- The other member agrees and stakes; the trigger confirms the date.
create or replace function public.date_stake(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  c date_commitments;
begin
  select * into c from date_commitments where id = p_id for update;
  if not found or auth.uid() is distinct from c.member_b then
    raise exception 'That date isn''t waiting on you.' using errcode = '42501';
  end if;
  if c.status <> 'pending' or c.b_staked_at is not null then
    raise exception 'This date has already been answered.' using errcode = '42501';
  end if;
  perform _date_hold(c, c.member_b);
  update date_commitments set b_staked_at = now() where id = p_id;
end;
$$;

-- The other member says no: the proposer's stake comes straight back.
create or replace function public.date_decline(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  c date_commitments;
begin
  select * into c from date_commitments where id = p_id for update;
  if not found or auth.uid() is distinct from c.member_b or c.status <> 'pending' then
    raise exception 'That date isn''t waiting on you.' using errcode = '42501';
  end if;
  perform _date_payout(c, 'return_both');
  update date_commitments
     set status = 'cancelled', cancel_reason = 'declined', cancelled_by = auth.uid(), settled_at = now()
   where id = p_id;
  perform _date_outcome_event(c, 'declined');
end;
$$;

-- Cancel. Safety cancellations are always free and return every stake,
-- at any time. Otherwise free before the cut-off; after it, ask to
-- reschedule (both must agree) or cancel for safety.
create or replace function public.date_cancel(p_id uuid, p_safety boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  c date_commitments;
  cfg coin_config;
begin
  select * into cfg from coin_config;
  select * into c from date_commitments where id = p_id for update;
  if not found or auth.uid() not in (c.member_a, c.member_b) then
    raise exception 'That date doesn''t exist.' using errcode = 'P0002';
  end if;
  if c.settled_at is not null then
    raise exception 'This date is already settled.' using errcode = '42501';
  end if;
  if not p_safety and c.status in ('provisional_no_show', 'under_review') then
    raise exception 'This date has already happened.' using errcode = '42501';
  end if;
  if not p_safety and now() > c.scheduled_for - make_interval(hours => cfg.cancel_cutoff_hours) then
    raise exception 'It''s within % hours. Ask to reschedule, or cancel for safety — that''s always free.', cfg.cancel_cutoff_hours
      using errcode = '42501';
  end if;
  perform _date_payout(c, 'return_both');
  update date_commitments
     set status = 'cancelled',
         cancel_reason = case when p_safety then 'safety' else 'notice' end,
         cancelled_by = auth.uid(),
         settled_at = now()
   where id = p_id;
  perform _date_outcome_event(c, case when p_safety then 'safety_cancelled' else 'cancelled_with_notice' end);
end;
$$;

-- Reschedule by mutual agreement: both ask, both stakes come back, and the
-- pair proposes a new time.
create or replace function public.date_request_reschedule(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  c date_commitments;
begin
  select * into c from date_commitments where id = p_id for update;
  if not found or auth.uid() not in (c.member_a, c.member_b) then
    raise exception 'That date doesn''t exist.' using errcode = 'P0002';
  end if;
  if c.status not in ('pending', 'confirmed') or c.settled_at is not null then
    raise exception 'This date can''t be rescheduled now.' using errcode = '42501';
  end if;
  if auth.uid() = c.member_a then
    update date_commitments set a_reschedule_at = coalesce(a_reschedule_at, now()) where id = p_id returning * into c;
  else
    update date_commitments set b_reschedule_at = coalesce(b_reschedule_at, now()) where id = p_id returning * into c;
  end if;
  if c.a_reschedule_at is not null and c.b_reschedule_at is not null then
    perform _date_payout(c, 'return_both');
    update date_commitments set status = 'cancelled', cancel_reason = 'reschedule', settled_at = now() where id = p_id;
    perform _date_outcome_event(c, 'rescheduled');
    return true;
  end if;
  return false;
end;
$$;

-- Haversine distance in metres. The coordinates passed in are never stored.
create or replace function public.distance_m(lat1 double precision, lng1 double precision,
                                             lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- "I'm here": confirmed by location near the venue, during the date window.
-- Keeps only the check-in time, never the coordinates.
create or replace function public.date_check_in(p_id uuid, p_lat double precision, p_lng double precision)
returns text language plpgsql security definer set search_path = public as $$
declare
  c date_commitments;
  cfg coin_config;
  sp date_spots;
begin
  select * into cfg from coin_config;
  select * into c from date_commitments where id = p_id for update;
  if not found or auth.uid() not in (c.member_a, c.member_b) then
    raise exception 'That date doesn''t exist.' using errcode = 'P0002';
  end if;
  if c.status <> 'confirmed' then
    raise exception 'Check-in opens once you''ve both staked.' using errcode = '42501';
  end if;
  if now() < c.scheduled_for - make_interval(mins => cfg.window_before_min)
     or now() > c.scheduled_for + make_interval(mins => cfg.window_after_min) then
    raise exception 'Check-in is open from % minutes before to % minutes after the time you agreed.',
      cfg.window_before_min, cfg.window_after_min using errcode = '42501';
  end if;
  select * into sp from date_spots where id = c.date_spot_id;
  if sp.lat is null or distance_m(p_lat, p_lng, sp.lat, sp.lng) > cfg.checkin_radius_m then
    raise exception 'You don''t seem to be at % yet. Check in once you''re there.', coalesce(c.venue_name, 'the venue')
      using errcode = '42501';
  end if;

  if auth.uid() = c.member_a then
    update date_commitments set a_checked_in_at = coalesce(a_checked_in_at, now()) where id = p_id returning * into c;
  else
    update date_commitments set b_checked_in_at = coalesce(b_checked_in_at, now()) where id = p_id returning * into c;
  end if;

  if c.a_checked_in_at is not null and c.b_checked_in_at is not null then
    perform _date_payout(c, 'return_both');
    update date_commitments set status = 'completed', settled_at = now() where id = p_id;
    perform _date_outcome_event(c, 'both_attended');
    return 'both';
  end if;
  return 'you';
end;
$$;

-- Move a date on once its window or contest period has passed. Safe to call
-- any number of times (participants on page load; the scheduled job).
create or replace function public._date_advance(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  c date_commitments;
  cfg coin_config;
  v_absent uuid;
begin
  select * into cfg from coin_config;
  select * into c from date_commitments where id = p_id for update;
  if not found or c.settled_at is not null then return; end if;

  if c.status = 'pending' and now() > c.scheduled_for then
    -- Never confirmed: the proposer's stake comes back.
    perform _date_payout(c, 'return_both');
    update date_commitments set status = 'cancelled', cancel_reason = 'declined', settled_at = now() where id = p_id;
    perform _date_outcome_event(c, 'expired_unanswered');

  elsif c.status = 'confirmed' and now() > c.scheduled_for + make_interval(mins => cfg.window_after_min) then
    if c.a_checked_in_at is not null and c.b_checked_in_at is not null then
      perform _date_payout(c, 'return_both');
      update date_commitments set status = 'completed', settled_at = now() where id = p_id;
      perform _date_outcome_event(c, 'both_attended');
    elsif c.a_checked_in_at is null and c.b_checked_in_at is null then
      perform _date_payout(c, 'return_both');
      update date_commitments set status = 'cancelled', cancel_reason = 'neither_attended', settled_at = now() where id = p_id;
      perform _date_outcome_event(c, 'neither_attended');
    else
      v_absent := case when c.a_checked_in_at is null then c.member_a else c.member_b end;
      -- Provisional only: the absent member has 24 hours to contest.
      update date_commitments
         set status = 'provisional_no_show', no_show_member = v_absent,
             contest_deadline = now() + make_interval(hours => cfg.contest_hours)
       where id = p_id;
    end if;

  elsif c.status = 'provisional_no_show' and now() > c.contest_deadline then
    perform _date_payout(c, 'award', c.no_show_member);
    -- status 'no_show' fires 0009's Sentinel trigger (the absent party).
    update date_commitments set status = 'no_show', settled_at = now() where id = p_id;
    perform _date_outcome_event(c, 'no_show');
  end if;
end;
$$;
revoke all on function public._date_advance(uuid) from public, anon, authenticated;

create or replace function public.date_refresh(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from date_commitments where id = p_id and auth.uid() in (member_a, member_b)) then
    raise exception 'That date doesn''t exist.' using errcode = 'P0002';
  end if;
  perform _date_advance(p_id);
end;
$$;

create or replace function public.date_advance_all_due()
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record;
  n integer := 0;
begin
  for r in select id from date_commitments
           where settled_at is null and status in ('pending', 'confirmed', 'provisional_no_show') loop
    perform _date_advance(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.date_advance_all_due() from public, anon, authenticated;

-- The absent member contests within the window: a person decides.
create or replace function public.date_contest(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  c date_commitments;
begin
  perform _date_advance(p_id);
  select * into c from date_commitments where id = p_id for update;
  if not found or auth.uid() is distinct from c.no_show_member or c.status <> 'provisional_no_show' then
    raise exception 'There''s nothing to contest on this date.' using errcode = '42501';
  end if;
  if now() > c.contest_deadline then
    raise exception 'The 24 hours to contest have passed.' using errcode = '42501';
  end if;
  update date_commitments set status = 'under_review', contested_at = now() where id = p_id;
  insert into attendance_reviews (commitment_id, contested_by) values (p_id, auth.uid())
  on conflict (commitment_id) do nothing;
  perform emit_trust_event(auth.uid(), null, 'attendance_contested', jsonb_build_object('outcome', 'contested'));
end;
$$;

-- Staff decide a contested case (service role only).
create or replace function public.resolve_attendance_review(p_id uuid, p_attended boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  c date_commitments;
begin
  select * into c from date_commitments where id = p_id for update;
  if not found or c.status <> 'under_review' or c.settled_at is not null then
    raise exception 'No open review for that date.';
  end if;
  if p_attended then
    perform _date_payout(c, 'return_both');
    update date_commitments set status = 'completed', no_show_member = null, settled_at = now() where id = p_id;
    perform _date_outcome_event(c, 'review_attended');
  else
    perform _date_payout(c, 'award', c.no_show_member);
    update date_commitments set status = 'no_show', settled_at = now() where id = p_id;
    perform _date_outcome_event(c, 'review_no_show');
  end if;
  update attendance_reviews set resolved_at = now(), outcome = case when p_attended then 'attended' else 'no_show' end
   where commitment_id = p_id;
end;
$$;
revoke all on function public.resolve_attendance_review(uuid, boolean) from public, anon, authenticated;
grant execute on function public.resolve_attendance_review(uuid, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Safety overrides everything
-- ---------------------------------------------------------------------------
--
-- When a member reports the other person on a date — before it, during it,
-- or within 7 days of it settling — their stake is returned in full.
--   * Open date (pending / confirmed / provisional / under review): cancelled
--     as a safety cancellation; every stake returns.
--   * Already settled against them as a no-show: their stake is restored,
--     funded by reversing the award the reported member received. Toastly
--     neither keeps nor mints coins to do it.

create or replace function public.date_safety_on_report()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  c date_commitments;
  v_txn uuid;
begin
  for c in
    select * from date_commitments d
    where ((d.member_a = new.reporter_id and d.member_b = new.reported_id)
        or (d.member_b = new.reporter_id and d.member_a = new.reported_id))
      and (d.settled_at is null or d.settled_at > now() - interval '7 days')
    for update
  loop
    if c.settled_at is null then
      perform _date_payout(c, 'return_both');
      update date_commitments
         set status = 'cancelled', cancel_reason = 'safety', cancelled_by = new.reporter_id, settled_at = now()
       where id = c.id;
      perform _date_outcome_event(c, 'safety_cancelled');
    elsif c.status = 'no_show' and c.no_show_member = new.reporter_id then
      v_txn := gen_random_uuid();
      insert into coin_ledger (profile_id, delta, kind, bucket, commitment_id, txn_id, counterparty_id, note)
      values (new.reporter_id, c.stake_coins, 'safety_restore', 'purchased', c.id, v_txn, new.reported_id,
              'Stake returned after a safety report'),
             (new.reported_id, -c.stake_coins, 'award_reversal', 'purchased', c.id, v_txn, new.reporter_id,
              'Award reversed after a safety report');
      update date_commitments set cancel_reason = 'safety' where id = c.id;
      perform _date_outcome_event(c, 'safety_restored');
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists date_safety_on_report on public.reports;
create trigger date_safety_on_report
  after insert on public.reports
  for each row execute function public.date_safety_on_report();

-- ---------------------------------------------------------------------------
-- Coins pay Premium and Premium Plus (naira) only
-- ---------------------------------------------------------------------------

alter type entitlement_source add value if not exists 'coins';

-- Pays the whole subscription from coins when the balance covers it
-- (promotional coins first, then purchased). Otherwise spends nothing and
-- reports the shortfall, for the card payment to cover once Paystack is
-- connected. Diaspora (dollar) plans are refused here, on the server.
create or replace function public.subscribe_with_coins(p_tier tier)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  cfg coin_config;
  v_price integer;
  v_promo integer;
  v_bought integer;
  v_from_promo integer;
  v_txn uuid := gen_random_uuid();
  v_start timestamptz;
begin
  if v_me is null then raise exception 'Please sign in again.' using errcode = '42501'; end if;
  if p_tier not in ('premium', 'premium_plus') then
    raise exception 'Coins can pay for Premium and Premium Plus only. Diaspora plans are paid in dollars.'
      using errcode = '42501';
  end if;
  select * into cfg from coin_config;
  v_price := case when p_tier = 'premium' then cfg.premium_coins else cfg.premium_plus_coins end;
  v_promo := greatest(promo_balance(v_me), 0);
  v_bought := greatest(purchased_balance(v_me), 0);

  if v_promo + v_bought < v_price then
    return jsonb_build_object('paid', false, 'price_coins', v_price, 'shortfall_coins', v_price - v_promo - v_bought,
                              'shortfall_naira', (v_price - v_promo - v_bought) * cfg.coin_naira);
  end if;

  v_from_promo := least(v_promo, v_price);
  if v_from_promo > 0 then
    insert into coin_ledger (profile_id, delta, kind, bucket, txn_id, note)
    values (v_me, -v_from_promo, 'subscription_spend', 'promotional', v_txn, p_tier::text);
  end if;
  if v_price - v_from_promo > 0 then
    insert into coin_ledger (profile_id, delta, kind, bucket, txn_id, note)
    values (v_me, -(v_price - v_from_promo), 'subscription_spend', 'purchased', v_txn, p_tier::text);
  end if;

  -- Extends an active coin-paid grant of the same tier rather than overlapping.
  select coalesce(max(ends_at), now()) into v_start from entitlements
   where profile_id = v_me and tier = p_tier and source = 'coins' and ends_at > now();
  insert into entitlements (profile_id, tier, source, starts_at, ends_at)
  values (v_me, p_tier, 'coins', v_start, v_start + make_interval(days => cfg.subscription_days));

  return jsonb_build_object('paid', true, 'price_coins', v_price, 'until', v_start + make_interval(days => cfg.subscription_days));
end;
$$;

-- ---------------------------------------------------------------------------
-- The old, open settlement path goes; keep things moving on a schedule
-- ---------------------------------------------------------------------------

drop function if exists public.settle_commitment(uuid, commitment_status, uuid);

revoke all on function public.date_propose(uuid, timestamptz, integer) from public, anon;
revoke all on function public.date_stake(uuid) from public, anon;
revoke all on function public.date_decline(uuid) from public, anon;
revoke all on function public.date_cancel(uuid, boolean) from public, anon;
revoke all on function public.date_request_reschedule(uuid) from public, anon;
revoke all on function public.date_check_in(uuid, double precision, double precision) from public, anon;
revoke all on function public.date_refresh(uuid) from public, anon;
revoke all on function public.date_contest(uuid) from public, anon;
revoke all on function public.subscribe_with_coins(tier) from public, anon;
grant execute on function public.date_propose(uuid, timestamptz, integer) to authenticated;
grant execute on function public.date_stake(uuid) to authenticated;
grant execute on function public.date_decline(uuid) to authenticated;
grant execute on function public.date_cancel(uuid, boolean) to authenticated;
grant execute on function public.date_request_reschedule(uuid) to authenticated;
grant execute on function public.date_check_in(uuid, double precision, double precision) to authenticated;
grant execute on function public.date_refresh(uuid) to authenticated;
grant execute on function public.date_contest(uuid) to authenticated;
grant execute on function public.subscribe_with_coins(tier) to authenticated;

do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule('toastly-advance-dates') where exists (select 1 from cron.job where jobname = 'toastly-advance-dates');
    perform cron.schedule('toastly-advance-dates', '*/10 * * * *', 'select public.date_advance_all_due()');
  end if;
end $$;

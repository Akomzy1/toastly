-- Toastly — launch blockers 5, 6, 7 and 8 (decided 8 October 2026). Follows 0036.
--
--   5. An extra Gist with coins, from the "You've used this month's Gist"
--      screen: 10 coins in Nigeria, 15 abroad (plan_config), taken only when
--      the call connects, once.
--   6. Refunds from Stripe and Paystack, processed automatically:
--        - a refunded plan ends;
--        - unspent coins from a refunded purchase are removed;
--        - if some were already spent, staff get a case;
--        - coins are never refunded as cash.
--   7. Stripe's card issuing country reaches payment_settle (lib/payments) —
--      no schema change; 0024 and 0027 already read it.
--   8. A reviewer can correct a member's gender on a "Not who they say they
--      are" report, which ends the women's launch offer. Never automatic;
--      audit-logged like every staff decision.

set search_path = public;

-- ---------------------------------------------------------------------------
-- 5. An extra Gist, paid with coins when it connects
-- ---------------------------------------------------------------------------
--
-- Decided 8 October 2026:
--   * The price is ₦1,000 for members in Nigeria and $3 for members abroad,
--     in coins at the built pack rate, rounded to whole coins: ₦1,000 at
--     coin_config.coin_naira (₦100 a coin) = 10; $3 at the dollar packs'
--     rate (us-5 … us-50, $0.20 a coin) = 15. Both live here, in config.
--   * Offered at the Gist cap. Choosing it sends the invite marked "paid with
--     coins"; the coins come off only when the call CONNECTS — once, however
--     many times either person rejoins. If it never connects, nothing is spent.
--   * Gift (promotional) and bought coins can both pay, gift coins first.
--     Stakes still need bought coins (0023, unchanged).
--   * Accepting an invitation stays free.

alter table public.plan_config
  add column if not exists extra_gist_coins_ngn smallint not null default 10
    check (extra_gist_coins_ngn between 1 and 1000),
  add column if not exists extra_gist_coins_usd smallint not null default 15
    check (extra_gist_coins_usd between 1 and 1000);

alter table public.gist_sessions
  -- The proposer chose to pay with coins (at the cap, when inviting).
  add column if not exists paid_with_coins boolean not null default false,
  -- What was charged, and when — set once, when the call first connects.
  add column if not exists coins_charged integer check (coins_charged is null or coins_charged > 0),
  add column if not exists coins_charged_at timestamptz;

-- Members can update their own sessions (0003), so these three are guarded:
-- only gist_invite and gist_join set them. Otherwise a member could mark a
-- free Gist as charged and win back the month's free one.
create or replace function public.guard_gist_coins()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.paid_with_coins is distinct from old.paid_with_coins
          or new.coins_charged is distinct from old.coins_charged
          or new.coins_charged_at is distinct from old.coins_charged_at) then
    raise exception 'Coins for a Gist are kept by Toastly.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_gist_coins() from public, anon, authenticated;
drop trigger if exists guard_gist_coins on public.gist_sessions;
create trigger guard_gist_coins before update on public.gist_sessions
  for each row execute function public.guard_gist_coins();

-- The extra Gist's price for this member: naira track if their profile is in
-- Nigeria, dollar track if not — like coin packs (0026).
create or replace function public.extra_gist_price(p_profile_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select case when coalesce((select country_code from profiles where id = p_profile_id), 'NG') = 'NG'
              then c.extra_gist_coins_ngn else c.extra_gist_coins_usd end::integer
    from plan_config c;
$$;
revoke all on function public.extra_gist_price(uuid) from public, anon;
grant execute on function public.extra_gist_price(uuid) to authenticated, service_role;

-- 0035's count, without the Gists paid with coins: those never use the
-- month's free one.
create or replace function public.voice_gists_this_month(p_profile_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
    from gist_sessions g
   where g.medium = 'voice'
     and g.proposer_id = p_profile_id
     and g.started_at >= date_trunc('month', now())
     and g.coins_charged_at is null;
$$;

-- Take an extra Gist's coins: gift coins first, then bought ones, as one
-- grouped ledger transaction, recorded on the session. Internal — called
-- only by gist_join, once, when the call first connects.
create or replace function public._charge_extra_gist(p_session_id uuid, p_member uuid, p_price integer)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_promo integer := greatest(promo_balance(p_member), 0);
  v_from_promo integer := least(v_promo, p_price);
  v_txn uuid := gen_random_uuid();
begin
  -- Never twice for one session.
  update gist_sessions set coins_charged = p_price, coins_charged_at = now()
   where id = p_session_id and coins_charged_at is null;
  if not found then return; end if;
  if v_from_promo > 0 then
    insert into coin_ledger (profile_id, delta, kind, bucket, txn_id, note)
    values (p_member, -v_from_promo, 'gist_top_up', 'promotional', v_txn, 'extra_gist');
  end if;
  if p_price - v_from_promo > 0 then
    insert into coin_ledger (profile_id, delta, kind, bucket, txn_id, note)
    values (p_member, -(p_price - v_from_promo), 'gist_top_up', 'purchased', v_txn, 'extra_gist');
  end if;
end;
$$;
revoke all on function public._charge_extra_gist(uuid, uuid, integer) from public, anon, authenticated;

-- gist_invite: 0036's definition, plus p_use_coins. At the cap, an invite is
-- refused unless the member chooses to pay with coins and has enough of them
-- — nothing is taken now; gist_join charges when the call connects.
drop function if exists public.gist_invite(uuid);
create or replace function public.gist_invite(p_prompt_answer_id uuid, p_use_coins boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_to uuid;
  v_id uuid;
  v_price integer;
  v_coins boolean := false;
begin
  -- No live profile, no access (PRD §5.1.2): sending a Gist invite.
  perform assert_live(auth.uid());
  if v_me is null then
    raise exception 'Please sign in again.' using errcode = '42501';
  end if;
  select profile_id into v_to from prompt_answers where id = p_prompt_answer_id;
  if v_to is null or v_to = v_me then
    raise exception 'That answer isn''t available.' using errcode = 'P0002';
  end if;
  -- Only someone in your six today, exactly like a reply.
  if not exists (
    select 1 from daily_feed f
    where f.profile_id = v_me and f.feed_date = current_date and f.candidate_id = v_to
  ) then
    raise exception 'You can invite people from today''s six.' using errcode = '42501';
  end if;
  if exists (
    select 1 from blocks b
    where (b.blocker_id = v_me and b.blocked_id = v_to) or (b.blocker_id = v_to and b.blocked_id = v_me)
  ) or not wants_each_other(v_me, v_to) then
    raise exception 'That answer isn''t available.' using errcode = 'P0002';
  end if;
  -- One open invite or Gist per pair at a time.
  if exists (
    select 1 from gist_sessions g
    where ((g.proposer_id = v_me and g.invitee_id = v_to) or (g.proposer_id = v_to and g.invitee_id = v_me))
      and g.status in ('proposed', 'accepted', 'live')
      and not (g.status = 'proposed' and g.created_at < now() - interval '3 days')
      -- A Gist whose time has run out is over, even before anyone answers
      -- "continue?" (status stays 'live' until then).
      and not (g.status = 'live' and g.ends_at is not null and g.ends_at < now())
  ) then
    raise exception 'You already have a Gist open with them.' using errcode = '23505';
  end if;
  if not gist_has_room(v_me) then
    if not p_use_coins then
      raise exception 'Monthly voice Gist allowance reached' using errcode = '42501';
    end if;
    v_price := extra_gist_price(v_me);
    if greatest(promo_balance(v_me), 0) + greatest(purchased_balance(v_me), 0) < v_price then
      raise exception 'You need % coins for an extra Gist.', v_price using errcode = '22023';
    end if;
    v_coins := true;
  end if;

  insert into gist_sessions (proposer_id, invitee_id, medium, prompt_answer_id, paid_with_coins)
  values (v_me, v_to, 'voice', p_prompt_answer_id, v_coins)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.gist_invite(uuid, boolean) from public, anon;
grant execute on function public.gist_invite(uuid, boolean) to authenticated;

-- 0003's insert check, letting through a voice Gist paid with coins. Only
-- gist_invite can insert one (members can't insert Gist rows, 0020), and it
-- has already checked the coins. Video stays gated to its tiers.
create or replace function public.enforce_gist_entitlement()
returns trigger
language plpgsql
as $$
begin
  if new.medium = 'voice' and new.paid_with_coins then
    return new;
  end if;
  if not can_start_gist(new.proposer_id, new.medium) then
    if new.medium = 'video' then
      raise exception 'Live video Gist requires Premium Plus or Diaspora Plus';
    else
      raise exception 'Monthly voice Gist allowance reached';
    end if;
  end if;
  return new;
end;
$$;

-- gist_join: 0035's definition. When the call first connects and the
-- proposer is past the month's free Gist, a Gist paid with coins is charged
-- now — once; a rejoin finds started_at set and charges nothing.
create or replace function public.gist_join(p_session_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  s gist_sessions%rowtype;
  v_charge integer := 0;
begin
  -- No live profile, no access (PRD §5.1.2): joining a Gist call.
  perform assert_live(auth.uid());
  select * into s from gist_sessions where id = p_session_id for update;
  if not found or auth.uid() not in (s.proposer_id, s.invitee_id) then
    raise exception 'That session doesn''t exist.' using errcode = 'P0002';
  end if;
  if s.status not in ('accepted', 'live')
     or s.proposer_ready_at is null or s.invitee_ready_at is null then
    raise exception 'You can join once you''ve both said you''re ready.' using errcode = '42501';
  end if;
  if s.ends_at is not null and now() >= s.ends_at then
    raise exception 'This Gist has finished.' using errcode = '42501';
  end if;

  if s.started_at is null then
    if not gist_has_room(s.proposer_id) then
      if s.paid_with_coins then
        v_charge := extra_gist_price(s.proposer_id);
        if greatest(promo_balance(s.proposer_id), 0) + greatest(purchased_balance(s.proposer_id), 0) < v_charge then
          if auth.uid() = s.proposer_id then
            raise exception 'You need % coins to start this Gist.', v_charge using errcode = '42501';
          end if;
          raise exception 'This Gist can''t start right now.' using errcode = '42501';
        end if;
      elsif auth.uid() = s.proposer_id then
        raise exception 'Monthly voice Gist allowance reached' using errcode = '42501';
      else
        -- Never reveal the other person's plan or usage.
        raise exception 'This Gist can''t start right now.' using errcode = '42501';
      end if;
    end if;
    update gist_sessions
       set started_at = now(),
           ends_at = now() + interval '18 minutes',
           status = 'live'
     where id = p_session_id
    returning * into s;
    -- Charged once, as the call first connects (decided 8 October 2026).
    if v_charge > 0 then
      perform _charge_extra_gist(s.id, s.proposer_id, v_charge);
    end if;
  end if;
  return s.ends_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Refunds
-- ---------------------------------------------------------------------------

alter table public.payments add column if not exists refunded_at timestamptz;

-- What a refund did. One row per payment; staff read it, members don't.
create table if not exists public.payment_refunds (
  payment_id uuid primary key references public.payments (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  amount_refunded integer not null check (amount_refunded > 0),
  full_refund boolean not null,
  coins_due integer not null default 0,
  coins_removed integer not null default 0,
  coins_short integer not null default 0,
  plans_ended integer not null default 0,
  still_renewing boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.payment_refunds enable row level security;
revoke all on public.payment_refunds from anon, authenticated;

alter table public.review_items drop constraint if exists review_items_kind_check;
alter table public.review_items add constraint review_items_kind_check
  check (kind in ('pricing', 'report', 'married_report', 'blind_report', 'attendance',
                  'selfie_review', 'id_review', 'photo_match', 'sentinel', 'refund'));

create or replace function public._reason_category(p_kind text)
returns text language sql immutable as $$
  select case p_kind
    when 'pricing' then 'plan_track'
    when 'married_report' then 'community_standards'
    when 'report' then 'report'
    when 'blind_report' then 'report'
    when 'attendance' then 'date_attendance'
    when 'selfie_review' then 'verification'
    when 'id_review' then 'verification'
    when 'photo_match' then 'verification'
    when 'refund' then 'payment'
    else 'safety' end;
$$;

-- The provider says a payment was refunded (Stripe charge.refunded,
-- Paystack refund.processed). p_amount_minor is the total refunded so far.
-- Returns 'refunded', 'partial', 'duplicate', 'ignored' or 'unknown'.
--
--   Full refund of a coin pack: its coins come off the bought balance, as
--     many as are still there; any already spent (or staked) go to staff.
--   Full refund of a plan: every grant from that payment ends now. Coins
--     held towards it (coins + card) go back to the member's balance — the
--     plan they paid for has ended. A remainder payment that was credited as
--     coins (0024) has those coins removed instead. A subscription that still
--     renews goes to staff, who decide whether to stop it.
--   Partial refund: nothing changes automatically; staff get a case.
--   Never cash: nothing here pays anything out.
create or replace function public.payment_refund(p_provider payment_provider, p_ref text, p_amount_minor integer)
returns text language plpgsql security definer set search_path = public as $$
declare
  p payments;
  cfg coin_config;
  v_due integer := 0;
  v_have integer;
  v_removed integer := 0;
  v_short integer := 0;
  v_ended integer := 0;
  v_renewing boolean := false;
begin
  if p_amount_minor is null or p_amount_minor <= 0 then return 'ignored'; end if;
  select * into p from payments where provider = p_provider and provider_ref = p_ref for update;
  if not found then return 'unknown'; end if;
  if p.status = 'refunded' then return 'duplicate'; end if;
  if p.status <> 'succeeded' then return 'ignored'; end if;
  select * into cfg from coin_config;

  if p_amount_minor < p.amount_minor then
    insert into payment_refunds (payment_id, profile_id, amount_refunded, full_refund)
    values (p.id, p.profile_id, p_amount_minor, false)
    on conflict (payment_id) do update
      set amount_refunded = greatest(payment_refunds.amount_refunded, excluded.amount_refunded), updated_at = now();
    perform _queue('refund', p.profile_id, 'payment_refunds', p.id, null);
    return 'partial';
  end if;

  update payments set status = 'refunded', refunded_at = now() where id = p.id;

  if p.kind = 'coin_pack' then
    v_due := coalesce(p.coins, 0);
  else
    update entitlements set ends_at = now()
     where payment_id = p.id and (ends_at is null or ends_at > now());
    get diagnostics v_ended = row_count;
    if p.kind = 'plan_remainder' and v_ended = 0
       and not exists (select 1 from entitlements where payment_id = p.id) then
      -- 0024 credited this payment as coins rather than a plan.
      v_due := p.amount_minor / 100 / cfg.coin_naira;
    elsif p.kind = 'plan_remainder' then
      perform _release_hold(p);
    end if;
    v_renewing := p.provider_subscription is not null and exists (
      select 1 from subscriptions s where s.provider = p.provider and s.provider_subscription_id = p.provider_subscription
         and s.status in ('active', 'past_due'));
  end if;

  if v_due > 0 then
    v_have := greatest(purchased_balance(p.profile_id), 0);
    v_removed := least(v_due, v_have);
    v_short := v_due - v_removed;
    if v_removed > 0 then
      insert into coin_ledger (profile_id, delta, kind, bucket, txn_id, note)
      values (p.profile_id, -v_removed, 'refund', 'purchased', gen_random_uuid(), coalesce(p.sku, p.kind));
    end if;
  end if;

  insert into payment_refunds (payment_id, profile_id, amount_refunded, full_refund, coins_due, coins_removed,
                               coins_short, plans_ended, still_renewing)
  values (p.id, p.profile_id, p_amount_minor, true, v_due, v_removed, v_short, v_ended, v_renewing)
  on conflict (payment_id) do update
    set amount_refunded = excluded.amount_refunded, full_refund = true, coins_due = excluded.coins_due,
        coins_removed = excluded.coins_removed, coins_short = excluded.coins_short,
        plans_ended = excluded.plans_ended, still_renewing = excluded.still_renewing, updated_at = now();

  if v_short > 0 or v_renewing then
    perform _queue('refund', p.profile_id, 'payment_refunds', p.id, null);
  end if;
  return 'refunded';
end;
$$;
revoke all on function public.payment_refund(payment_provider, text, integer) from public, anon, authenticated;
grant execute on function public.payment_refund(payment_provider, text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Correcting gender on a "Not who they say they are" report
-- ---------------------------------------------------------------------------

-- Sets the gender and, unless it is now 'woman', ends the women's launch
-- offer. The phone's grant record stays, so the offer never comes back.
-- Called only from staff_decide.
create or replace function public._correct_gender(p_profile uuid, p_gender text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_ended integer := 0;
begin
  if not is_gender_option(p_gender) then
    raise exception 'Choose from the list.' using errcode = '22023';
  end if;
  update profiles set gender = p_gender where id = p_profile;
  if p_gender <> 'woman' then
    update entitlements set ends_at = now()
     where profile_id = p_profile and source = 'womens_launch_offer' and (ends_at is null or ends_at > now());
    get diagnostics v_ended = row_count;
  end if;
  return v_ended;
end;
$$;
revoke all on function public._correct_gender(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The console: the latest definitions (staff_item and staff_decide 0026,
-- _case_reason 0027), plus refund cases (6) and the gender
-- correction (8).
-- ---------------------------------------------------------------------------

create or replace function public._case_reason(i review_items)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  ir integrity_reviews;
  r reports;
  d date_commitments;
  vs verification_sessions;
  v_n integer;
  v_route text;
begin
  if i.kind = 'pricing' then
    select * into ir from integrity_reviews where id = i.source_id;
    v_route := ir.detail ->> 'route';
    return case ir.signal
      when 'profile_country_mismatch' then
        case when v_route = 'coin_pack' then 'Bought a naira coin pack while their profile says they live in ' || _country_name(ir.detail ->> 'country') || '.'
             when v_route = 'coins' then 'Paid for a naira plan with coins while their profile says they live in ' || _country_name(ir.detail ->> 'country') || '.'
             else 'Bought a naira plan while their profile says they live in ' || _country_name(ir.detail ->> 'country') || '.' end
      when 'payment_geography_mismatch' then
        case when ir.detail ->> 'track' = 'usd'
             then 'Paid in dollars with a card issued in ' || _country_name(ir.detail ->> 'country') || ' while their profile says they live in ' || _country_name(ir.detail ->> 'profile_country') || '.'
             else 'Paid in naira with a card issued in ' || _country_name(ir.detail ->> 'country') || '.' end
      when 'ip_country_mismatch' then
        case when ir.detail ->> 'track' = 'usd'
             then 'Opened a dollar checkout from ' || _country_name(ir.detail ->> 'country') || ' while their profile says they live in ' || _country_name(ir.detail ->> 'profile_country') || '.'
             else 'Opened a naira checkout from ' || _country_name(ir.detail ->> 'country') || '.' end
      when 'phone_country_mismatch' then
        'Says they live in ' || _country_name(ir.detail ->> 'country') || ', but their phone number has a +' || coalesce(ir.detail ->> 'phone_code', '?') || ' code.'
      else 'Pricing signal: ' || replace(ir.signal::text, '_', ' ') || '.' end;
  elsif i.kind in ('report', 'married_report', 'blind_report') then
    select * into r from reports where id = i.source_id;
    select count(*) into v_n from reports where reported_id = r.reported_id and created_at <= r.created_at and reason = r.reason;
    if i.kind = 'married_report' then
      return 'A match says this member is married. ' || case when v_n <= 1 then 'First report on the account.' else 'Report ' || v_n || ' of this kind on the account.' end;
    elsif i.kind = 'blind_report' then
      return 'Reported from a locked inbox as “' || _report_label(r.reason) || '”. The reporter hasn''t read the messages.';
    end if;
    return 'Reported as “' || _report_label(r.reason) || '”.' || case when v_n > 1 then ' Report ' || v_n || ' of this kind on the account.' else '' end;
  elsif i.kind = 'attendance' then
    select * into d from date_commitments where id = i.source_id;
    return 'Says they were at ' || coalesce(d.venue_name, 'the venue') || '. '
        || case when d.a_checked_in_at is not null and d.b_checked_in_at is not null then 'Both check-ins were recorded.'
                when d.a_checked_in_at is null and d.b_checked_in_at is null then 'No check-in was recorded.'
                else 'Only one check-in was recorded.' end;
  elsif i.kind in ('selfie_review', 'id_review') then
    select * into vs from verification_sessions where id = i.source_id;
    select count(*) into v_n from verification_sessions where profile_id = vs.profile_id and product = vs.product;
    return case when i.kind = 'selfie_review' then 'Selfie liveness came back for review' else 'ID check came back for review' end
        || case when v_n > 1 then ' after ' || (v_n - 1) || ' earlier attempt' || case when v_n > 2 then 's' else '' end || '.' else '.' end;
  elsif i.kind = 'refund' then
    return (select case
      when not f.full_refund then 'A payment was partly refunded. Nothing changed automatically.'
      when f.coins_short > 0 then 'A refunded coin purchase: ' || f.coins_short || ' of its coins were already spent.'
      when f.still_renewing then 'A refunded plan whose subscription still renews with the provider.'
      else 'A refunded payment.' end
      from payment_refunds f where f.payment_id = i.source_id);
  elsif i.kind = 'photo_match' then
    return 'Main photo may not match the verified selfie.';
  end if;
  return 'Safety flag.';
end;
$$;
revoke all on function public._case_reason(review_items) from public, anon, authenticated;

create or replace function public.staff_item(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  i review_items;
  ir integrity_reviews;
  r reports;
  d date_commitments;
  vs verification_sessions;
  v_evidence jsonb := '{}'::jsonb;
  v_actions jsonb;
  v_members jsonb := '[]'::jsonb;
begin
  perform _require_staff();
  select * into i from review_items where id = p_id;
  if not found then raise exception 'No such case.' using errcode = 'P0002'; end if;

  if i.kind = 'pricing' then
    select * into ir from integrity_reviews where id = i.source_id;
    v_evidence := jsonb_build_object(
      'signal', ir.signal, 'detail', ir.detail, 'raised_at', ir.created_at,
      'profile_country', (select country_code from profiles where id = i.subject_id),
      'profile_time_zone', (select time_zone from profiles where id = i.subject_id),
      'payments_90_days', (select coalesce(jsonb_agg(jsonb_build_object(
          'currency', x.currency, 'kind', x.kind, 'status', x.status, 'card_country', x.card_country,
          'request_country', x.ip_country, 'at', x.created_at) order by x.created_at desc), '[]'::jsonb)
        from payments x where x.profile_id = i.subject_id and x.created_at > now() - interval '90 days'));
  elsif i.kind in ('report', 'married_report', 'blind_report') then
    select * into r from reports where id = i.source_id;
    v_evidence := jsonb_build_object(
      'reason', _report_label(r.reason), 'reporter_note', r.detail, 'reported_at', r.created_at, 'blind', r.blind,
      'messages_from_member_to_reporter', (select count(*) from messages m join threads t on t.id = m.thread_id
          where m.sender_id = r.reported_id and (t.member_a = r.reporter_id or t.member_b = r.reporter_id)),
      'conversations_opened_9_days', (select count(*) from threads t
          where (t.member_a = r.reported_id or t.member_b = r.reported_id) and t.created_at > now() - interval '9 days'),
      'had_gist_together', exists (select 1 from gist_sessions g where (g.proposer_id = r.reporter_id and g.invitee_id = r.reported_id)
                                                           or (g.proposer_id = r.reported_id and g.invitee_id = r.reporter_id)));
  elsif i.kind = 'attendance' then
    select * into d from date_commitments where id = i.source_id;
    v_evidence := jsonb_build_object(
      'venue', d.venue_name, 'agreed_time', d.scheduled_for, 'stake_coins', d.stake_coins,
      'proposer_member_no', (select member_no from profiles where id = d.member_a),
      'other_member_no', (select member_no from profiles where id = d.member_b),
      'proposer_checked_in_at', d.a_checked_in_at, 'other_checked_in_at', d.b_checked_in_at,
      'contested_at', d.contested_at, 'status', d.status);
  elsif i.kind in ('selfie_review', 'id_review') then
    select * into vs from verification_sessions where id = i.source_id;
    v_evidence := jsonb_build_object(
      'product', vs.product, 'environment', vs.environment, 'result_code', vs.result_code, 'at', vs.created_at,
      'attempts', (select coalesce(jsonb_agg(jsonb_build_object('status', s.status, 'code', s.result_code, 'at', s.created_at)
                    order by s.created_at desc), '[]'::jsonb)
                   from verification_sessions s where s.profile_id = i.subject_id and s.product = vs.product));
  elsif i.kind = 'refund' then
    -- Amounts and coin counts only — never a card number or a bank detail.
    select jsonb_build_object(
      'currency', x.currency, 'kind', x.kind, 'amount_minor', x.amount_minor, 'paid_at', x.paid_at,
      'refunded_minor', f.amount_refunded, 'full_refund', f.full_refund, 'refunded_at', f.created_at,
      'coins_in_purchase', f.coins_due, 'coins_removed', f.coins_removed, 'coins_already_spent', f.coins_short,
      'plans_ended', f.plans_ended, 'still_renewing', f.still_renewing)
      into v_evidence
      from payments x join payment_refunds f on f.payment_id = x.id where x.id = i.source_id;
  end if;

  -- The people in the case, by number, with what a reviewer needs to place
  -- them — plan, tenure, city, verification outcomes, report and date record.
  select coalesce(jsonb_agg(m order by m ->> 'order'), '[]'::jsonb) into v_members from (
    select jsonb_build_object(
      'order', x.ord, 'role', x.role, 'member_no', coalesce(p.member_no, x.no),
      'removed', p.id is null,
      'tier', case when p.id is null then null else current_tier(p.id) end,
      'joined', p.created_at, 'city', p.city, 'country', p.country_code,
      'phone_verified_at', p.phone_verified_at, 'liveness_verified_at', p.liveness_verified_at,
      'id_confirmed_at', p.id_confirmed_at,
      'id_type', (select id_type from verified_id_hashes h where h.profile_id = p.id),
      'reports_about', (select coalesce(jsonb_agg(jsonb_build_object('reason', _report_label(rr.reason), 'at', rr.created_at, 'status', rr.status)
                         order by rr.created_at desc), '[]'::jsonb) from reports rr where rr.reported_id = p.id),
      'earlier_cases', (select coalesce(jsonb_agg(jsonb_build_object('case_no', o.case_no, 'kind', o.kind, 'decision', o.decision)
                         order by o.created_at desc), '[]'::jsonb)
                        from review_items o where o.subject_id = p.id and o.id <> i.id),
      'dates', (select jsonb_build_object(
                  'attended', count(*) filter (where dc.status = 'completed'),
                  'missed', count(*) filter (where dc.status = 'no_show' and dc.no_show_member = p.id),
                  'cancelled', count(*) filter (where dc.status = 'cancelled'))
                from date_commitments dc where p.id in (dc.member_a, dc.member_b)),
      'restricted', p.id is not null and is_restricted(p.id)) as m
    from (values
      (1, case when i.kind in ('report', 'married_report', 'blind_report') then 'Reported member'
               when i.kind = 'attendance' then 'Member who contested' else 'Member' end, i.subject_id, i.subject_member_no),
      (2, case when i.kind = 'attendance' then 'Other member' else 'Reporter' end, i.other_id, i.other_member_no)
    ) as x(ord, role, pid, no)
    left join profiles p on p.id = x.pid
    where x.pid is not null or x.no is not null
  ) s;

  v_actions := case
    when i.stage = 'decided' then '[]'::jsonb
    when i.kind = 'attendance' then '["attended", "no_show", "restrict", "remove"]'::jsonb
    when i.kind = 'pricing' then '["clear", "ask_switch_plan", "request_reverification", "restrict", "remove"]'::jsonb
    when i.kind = 'refund' then '["clear", "restrict"]'::jsonb
    else '["clear", "request_reverification", "restrict", "remove"]'::jsonb end;
  if i.subject_id is null then
    v_actions := '[]'::jsonb;
  elsif is_restricted(i.subject_id) then
    v_actions := (v_actions - 'restrict') || '["lift_restriction"]'::jsonb;
  end if;

  -- "Not who they say they are": a reviewer may correct the member's gender
  -- (decided 8 October 2026). One action per option, never automatic.
  if i.stage <> 'decided' and i.subject_id is not null and i.kind = 'report'
     and exists (select 1 from reports r2 where r2.id = i.source_id and r2.reason = 'fake_profile') then
    v_actions := v_actions || coalesce((
      select jsonb_agg('correct_gender:' || o.code order by o.sort)
        from gender_options o
       where o.active and o.code is distinct from (select gender from profiles where id = i.subject_id)), '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'id', i.id, 'case_no', i.case_no, 'kind', i.kind, 'stage', i.stage, 'status', i.status, 'decision', i.decision,
    'created_at', i.created_at, 'decided_at', i.decided_at, 'reason', _case_reason(i),
    'reason_category', _reason_category(i.kind),
    'assigned_name', case when i.assigned_to is null then null else _staff_label(i.assigned_to) end,
    'assigned_to_me', i.assigned_to = auth.uid(),
    'subject', jsonb_build_object('id', i.subject_id, 'member_no', i.subject_member_no),
    'members', v_members,
    'evidence', v_evidence,
    'events', (select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'who', e.actor_label, 'role', e.actor_role,
                 'what', e.what, 'why', e.why, 'decision', e.is_decision) order by e.at), '[]'::jsonb)
               from case_events e where e.review_item_id = i.id),
    'actions', v_actions);
end;
$$;

create or replace function public.staff_decide(p_id uuid, p_action text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  i review_items;
  v_cat text;
  v_allowed jsonb;
  v_label text;
begin
  perform _require_staff();
  if char_length(trim(coalesce(p_note, ''))) < 12 then
    raise exception 'Write the reason for this decision — a short sentence is enough.' using errcode = '22023';
  end if;
  select * into i from review_items where id = p_id for update;
  if not found then raise exception 'No such case.' using errcode = 'P0002'; end if;
  v_allowed := staff_item(p_id) -> 'actions';
  if not (v_allowed ? p_action) then
    raise exception 'That action isn''t available for this case.' using errcode = '22023';
  end if;
  v_cat := _reason_category(i.kind);
  v_label := case p_action
    when 'clear' then 'Clear' when 'ask_switch_plan' then 'Ask to switch plan'
    when 'request_reverification' then 'Request re-verification' when 'restrict' then 'Restrict'
    when 'lift_restriction' then 'Lift restriction' when 'remove' then 'Remove'
    when 'attended' then 'Attended — both stakes back' when 'no_show' then 'Didn''t attend — stake to the attender'
    else p_action end;
  if p_action like 'correct_gender:%' then
    v_label := 'Correct gender to ' || coalesce((select label from gender_options where code = split_part(p_action, ':', 2)),
                                                split_part(p_action, ':', 2));
  end if;

  -- Written first, so even a removal leaves its record.
  insert into staff_audit_log (staff_id, review_item_id, item_kind, subject_id, action, reason_category, note)
  values (auth.uid(), i.id, i.kind, i.subject_id, p_action, v_cat, left(p_note, 1000));
  perform _case_event(i.id, v_label, p_note, true);

  if p_action = 'lift_restriction' then
    update account_restrictions set lifted_at = now(), lifted_by = auth.uid()
     where profile_id = i.subject_id and lifted_at is null;
    return jsonb_build_object('action', p_action, 'subject_id', i.subject_id, 'reason_category', v_cat);
  end if;

  if p_action in ('ask_switch_plan', 'request_reverification') then
    update review_items set stage = 'waiting_member', assigned_to = coalesce(assigned_to, auth.uid()),
                            decision = p_action, decided_by = auth.uid(), decided_at = now()
     where id = i.id;
  else
    update review_items set stage = 'decided', status = 'closed', decision = p_action, decided_by = auth.uid(),
                            decided_at = now(), assigned_to = coalesce(assigned_to, auth.uid())
     where id = i.id;
  end if;

  if p_action = 'clear' then
    perform _close_source(i, true);
  elsif p_action = 'ask_switch_plan' then
    insert into member_notices (profile_id, kind, reason_category) values (i.subject_id, 'switch_plan', v_cat);
    perform _close_source(i, false);
  elsif p_action = 'request_reverification' then
    insert into reverification_requests (profile_id, reason_category, requested_by)
    values (i.subject_id, v_cat, auth.uid())
    on conflict (profile_id) do update set reason_category = excluded.reason_category, requested_at = now(), requested_by = excluded.requested_by;
    perform _close_source(i, false);
  elsif p_action = 'restrict' then
    insert into account_restrictions (profile_id, reason_category, review_item_id, created_by)
    values (i.subject_id, v_cat, i.id, auth.uid());
    perform _close_source(i, false);
  elsif p_action in ('attended', 'no_show') then
    perform resolve_attendance_review(i.source_id, p_action = 'attended');
  elsif p_action like 'correct_gender:%' then
    perform _correct_gender(i.subject_id, split_part(p_action, ':', 2));
    perform _close_source(i, false);
  elsif p_action = 'remove' then
    perform _close_source(i, false);
    perform _remove_account(i.subject_id, v_cat);
  end if;

  return jsonb_build_object('action', p_action, 'subject_id', i.subject_id, 'reason_category', v_cat);
end;
$$;

revoke all on function public.staff_item(uuid) from public, anon;
revoke all on function public.staff_decide(uuid, text, text) from public, anon;
grant execute on function public.staff_item(uuid) to authenticated;
grant execute on function public.staff_decide(uuid, text, text) to authenticated;

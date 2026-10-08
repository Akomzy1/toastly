-- Toastly — launch rules decided 8 October 2026 (PRD §5.4, §5.5, §7.1, §7.3).
-- Follows 0034.
--
--   A. Starter's monthly Gist cap is ONE (was two), held in one config value.
--      It counts only a Gist the member STARTED, and only when it connects.
--      Accepting an invitation is free and never counts.
--   B. Diaspora is $10 a month, Diaspora Plus $20 (was $15 / $30).
--   C. Nobody pays before going live, and the women's offer starts at go-live:
--      - no checkout or coin-paid plan for a member whose profile isn't live;
--      - the women's launch offer is granted when the profile first goes
--        live, not at sign-up — at most once per phone number;
--      - a member can't change their gender once live (support only);
--      - a notice three days before the offer ends.

-- ---------------------------------------------------------------------------
-- A. The Starter Gist cap
-- ---------------------------------------------------------------------------

-- One value. lib/gist.ts STARTER_MONTHLY_GISTS mirrors it for the words on
-- screens (a constraint check keeps the two equal).
create table if not exists public.plan_config (
  id boolean primary key default true check (id),
  starter_monthly_gists smallint not null check (starter_monthly_gists between 0 and 31)
);
insert into public.plan_config (id, starter_monthly_gists) values (true, 1)
  on conflict (id) do update set starter_monthly_gists = excluded.starter_monthly_gists;
alter table public.plan_config enable row level security;
drop policy if exists "anyone reads plan config" on public.plan_config;
create policy "anyone reads plan config" on public.plan_config for select using (true);
revoke insert, update, delete on public.plan_config from anon, authenticated;

create or replace function public.voice_gist_allowance(p_profile_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  -- Starter: the configured number a month. Everyone else: unlimited (null).
  select case current_tier(p_profile_id)
           when 'starter' then (select starter_monthly_gists from plan_config)::integer
           else null end;
$$;

-- What counts: Gists this member STARTED (proposed) that CONNECTED this
-- month. An invitation they accepted never counts; one they sent that never
-- connected doesn't either.
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
     and g.started_at >= date_trunc('month', now());
$$;

-- gist_respond: 0029's definition without the allowance check — accepting
-- an invitation is free and never counts (decided 8 October 2026).
create or replace function public.gist_respond(p_session_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  s gist_sessions%rowtype;
begin
  -- No live profile, no access (PRD §5.1.2): accepting or declining a Gist invite.
  perform assert_live(auth.uid());
  select * into s from gist_sessions where id = p_session_id for update;
  if not found or s.invitee_id is distinct from auth.uid() then
    raise exception 'That invite doesn''t exist.' using errcode = 'P0002';
  end if;
  if s.status <> 'proposed' then
    raise exception 'This invite has already been answered.' using errcode = '42501';
  end if;
  if s.created_at < now() - interval '3 days' then
    update gist_sessions set status = 'expired' where id = p_session_id;
    raise exception 'This invite has closed.' using errcode = '42501';
  end if;
  update gist_sessions set status = case when p_accept then 'accepted' else 'declined' end::gist_status
   where id = p_session_id;
  return case when p_accept then 'accepted' else 'declined' end;
end;
$$;

-- gist_join: 0029's definition, checking only the PROPOSER's allowance when
-- the call connects — the moment it counts. The invitee never spends one.
create or replace function public.gist_join(p_session_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  s gist_sessions%rowtype;
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
      if auth.uid() = s.proposer_id then
        raise exception 'Monthly voice Gist allowance reached' using errcode = '42501';
      end if;
      -- Never reveal the other person's plan or usage.
      raise exception 'This Gist can''t start right now.' using errcode = '42501';
    end if;
    update gist_sessions
       set started_at = now(),
           ends_at = now() + interval '18 minutes',
           status = 'live'
     where id = p_session_id
    returning * into s;
  end if;
  return s.ends_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- B. Diaspora prices
-- ---------------------------------------------------------------------------

-- Checkout charges from price_list (0024). A checkout already opened at the
-- old price settles at that price; new ones use these. Stripe Prices for the
-- new amounts are found by lookup key, or created on first use (lib/payments/stripe.ts).
update public.price_list set amount_minor = 1000 where sku = 'diaspora' and amount_minor <> 1000;
update public.price_list set amount_minor = 2000 where sku = 'diaspora_plus' and amount_minor <> 2000;

-- ---------------------------------------------------------------------------
-- C. Nobody pays before going live
-- ---------------------------------------------------------------------------

-- Every new checkout (coin pack, plan pass, card plan, coins-plus-remainder)
-- needs a live profile. Renewals of an existing plan are recorded whatever
-- happens to the profile later.
create or replace function public.payments_need_live()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind in ('coin_pack', 'plan_pass', 'plan_recurring', 'plan_remainder') and not profile_is_live(new.profile_id) then
    raise exception 'Your profile isn''t live yet.' using errcode = 'PT403',
      hint = 'Plans and coins open once your profile is live.';
  end if;
  return new;
end;
$$;
revoke all on function public.payments_need_live() from public, anon, authenticated;
drop trigger if exists payments_need_live on public.payments;
create trigger payments_need_live before insert on public.payments
  for each row execute function public.payments_need_live();

-- subscribe_with_coins: 0023's definition, plus the live guard.
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
  -- Nobody pays before going live (PRD §7.3).
  perform assert_live(v_me);
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
-- C. The women's launch offer starts at go-live
-- ---------------------------------------------------------------------------

-- handle_new_user: 0026's definition WITHOUT the offer — sign-up grants
-- Starter only. The offer comes at go-live (below).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gender text := new.raw_user_meta_data ->> 'gender';
  v_country text := upper(coalesce(new.raw_user_meta_data ->> 'country_code', 'NG'));
begin
  if v_country !~ '^[A-Z]{2}$' then v_country := 'NG'; end if;

  insert into public.profiles (id, display_name, gender, country_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', 'New member'),
    v_gender,
    v_country
  );

  -- Everyone starts on Starter. The women's launch offer begins at go-live
  -- (grant_launch_offer, 0035), not here.
  insert into public.entitlements (profile_id, tier, source)
  values (new.id, 'starter', 'default');

  return new;
end;
$$;

-- Once per phone number, ever: the number's hash is kept when an account is
-- deleted, so deleting and signing up again doesn't bring the offer back.
-- Only the hash (phone_identities, 0001) — never the number.
create table if not exists public.launch_offer_grants (
  phone_hash text primary key,
  profile_id uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now()
);
alter table public.launch_offer_grants enable row level security;
revoke all on public.launch_offer_grants from anon, authenticated;

-- At go-live: women in Nigeria get 30 days of Premium Plus, women abroad 30
-- days of Diaspora Plus. No card; nothing renews; on day 30 the member is on
-- the free plan. Skipped (silently) if this phone number has had it before.
create or replace function public.grant_launch_offer()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_hash text;
begin
  if old.first_live_at is not null or new.first_live_at is null or new.gender is distinct from 'woman' then
    return new;
  end if;
  select phone_hash into v_hash from phone_identities where profile_id = new.id;
  if v_hash is null then
    return new;
  end if;
  insert into launch_offer_grants (phone_hash, profile_id) values (v_hash, new.id)
    on conflict (phone_hash) do nothing;
  if not found then
    return new;
  end if;
  insert into entitlements (profile_id, tier, source, starts_at, ends_at)
  values (new.id,
          case when new.country_code = 'NG' then 'premium_plus'::tier else 'diaspora_plus'::tier end,
          'womens_launch_offer', new.first_live_at, new.first_live_at + interval '30 days');
  return new;
end;
$$;
revoke all on function public.grant_launch_offer() from public, anon, authenticated;
drop trigger if exists grant_launch_offer on public.profiles;
create trigger grant_launch_offer after update of first_live_at on public.profiles
  for each row execute function public.grant_launch_offer();

-- Gender can't be changed by the member once live — through support only.
create or replace function public.guard_gender()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon')
     and new.gender is distinct from old.gender
     and old.first_live_at is not null then
    raise exception 'Your gender can be changed through Toastly Help.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_gender on public.profiles;
create trigger guard_gender before update of gender on public.profiles
  for each row execute function public.guard_gender();

-- ---------------------------------------------------------------------------
-- C. Three days before the offer ends: a notice in the app (and an email,
--    sent by the daily reminder job from what this returns)
-- ---------------------------------------------------------------------------

alter table public.member_notices drop constraint if exists member_notices_kind_check;
alter table public.member_notices add constraint member_notices_kind_check check (kind in ('switch_plan', 'offer_ending'));
alter table public.member_notices add column if not exists ref_id uuid;
create unique index if not exists member_notices_once on public.member_notices (profile_id, kind, ref_id) where ref_id is not null;

-- Called once a day (app/api/cron/plan-reminders). Inserts one notice per
-- offer that ends within three days and hasn't had one, and returns those
-- members so the job can email them. Running it twice sends nothing twice.
create or replace function public.offer_ending_notices()
returns table (profile_id uuid, ends_at timestamptz, tier tier)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  return query
  with due as (
    select e.id, e.profile_id, e.ends_at, e.tier
      from entitlements e
     where e.source = 'womens_launch_offer'
       and e.ends_at > now()
       and e.ends_at <= now() + interval '3 days'
  ), made as (
    insert into member_notices (profile_id, kind, reason_category, ref_id)
    select d.profile_id, 'offer_ending', 'offer_ending', d.id from due d
    on conflict (profile_id, kind, ref_id) where ref_id is not null do nothing
    returning member_notices.profile_id, member_notices.ref_id
  )
  select d.profile_id, d.ends_at, d.tier from due d join made m on m.ref_id = d.id;
end;
$$;
revoke all on function public.offer_ending_notices() from public, anon, authenticated;
grant execute on function public.offer_ending_notices() to service_role;

-- Toastly — live payments: Paystack (NGN) and Stripe (USD).
--
-- Decided 4 October 2026:
--   * Naira plans are hybrid. Card payers get a monthly auto-renewing
--     Paystack subscription they cancel in the app; bank and USSD payers get
--     a 30-day pass (Paystack can't renew those channels).
--   * Diaspora plans are monthly Stripe subscriptions (card, Apple Pay).
--   * Coins can part-pay Premium or Premium Plus: the coins are HELD when
--     checkout starts and Paystack charges the rest as a 30-day pass. If the
--     payment fails or is abandoned, the hold is released after an hour.
--   * Checkout is hosted by Paystack and Stripe. Nothing here sees a card.
--
-- Rules that hold everywhere below:
--   * The server sets every amount, from price_list. A client never sends one.
--   * A grant happens once per payment (webhook and return-page verification
--     can both arrive; the second is a no-op).
--   * Pricing-integrity signals (card country, request country) go to the
--     manual review queue and the Sentinel's event stream. Nothing here
--     blocks, bans or restricts anyone (CLAUDE.md).
--   * Coins never become cash. A payment that can't be honoured as a plan is
--     credited as coins, never paid out.
--
-- Every function is service-role only: they run from the webhooks and the
-- checkout actions on the server, never from a member's browser.

-- ---------------------------------------------------------------------------
-- Prices — one place, readable by anyone, written by no client
-- ---------------------------------------------------------------------------

create table if not exists public.price_list (
  sku text primary key,
  kind text not null check (kind in ('coin_pack', 'plan')),
  provider payment_provider not null,
  currency text not null check (currency in ('NGN', 'USD')),
  amount_minor integer not null check (amount_minor > 0),
  coins integer check (coins is null or coins > 0),
  tier tier,
  label text not null,
  active boolean not null default true,
  check ((provider = 'paystack' and currency = 'NGN') or (provider = 'stripe' and currency = 'USD')),
  check ((kind = 'coin_pack' and coins is not null and tier is null)
      or (kind = 'plan' and tier is not null and coins is null)),
  -- Naira plans are the domestic tiers; dollar plans the diaspora tiers.
  check (kind <> 'plan'
      or (currency = 'NGN' and tier in ('premium', 'premium_plus'))
      or (currency = 'USD' and tier in ('diaspora', 'diaspora_plus')))
);

insert into public.price_list (sku, kind, provider, currency, amount_minor, coins, tier, label) values
  ('ng-10',         'coin_pack', 'paystack', 'NGN', 100000, 10,   null,            '10 coins'),
  ('ng-30',         'coin_pack', 'paystack', 'NGN', 270000, 30,   null,            '30 coins'),
  ('us-30',         'coin_pack', 'stripe',   'USD',    600, 30,   null,            '30 coins'),
  ('premium',       'plan',      'paystack', 'NGN', 350000, null, 'premium',       'Premium'),
  ('premium_plus',  'plan',      'paystack', 'NGN', 700000, null, 'premium_plus',  'Premium Plus'),
  ('diaspora',      'plan',      'stripe',   'USD',   1500, null, 'diaspora',      'Diaspora'),
  ('diaspora_plus', 'plan',      'stripe',   'USD',   3000, null, 'diaspora_plus', 'Diaspora Plus')
on conflict (sku) do nothing;

alter table public.price_list enable row level security;
drop policy if exists "prices are public" on public.price_list;
create policy "prices are public" on public.price_list for select using (true);
revoke insert, update, delete on public.price_list from anon, authenticated;

alter table public.coin_config add column if not exists hold_minutes integer not null default 60;

-- ---------------------------------------------------------------------------
-- Payments: what each one is for, and what the provider told us
-- ---------------------------------------------------------------------------

alter table public.payments
  add column if not exists kind text
    check (kind in ('coin_pack', 'plan_pass', 'plan_recurring', 'plan_remainder', 'plan_renewal')),
  add column if not exists sku text references public.price_list (sku),
  add column if not exists tier tier,
  add column if not exists coins integer,
  add column if not exists hold_coins integer not null default 0 check (hold_coins >= 0),
  add column if not exists hold_txn uuid,
  add column if not exists hold_released_at timestamptz,
  add column if not exists provider_customer text,
  add column if not exists provider_subscription text,
  -- Two-letter country codes only — never an IP address, never a card number.
  add column if not exists card_country text check (card_country is null or card_country ~ '^[A-Z]{2}$'),
  add column if not exists ip_country text check (ip_country is null or ip_country ~ '^[A-Z]{2}$'),
  add column if not exists channel text,
  add column if not exists paid_at timestamptz,
  add column if not exists period_end timestamptz;

create index if not exists payments_customer_idx on public.payments (provider, provider_customer);
create index if not exists payments_open_holds_idx on public.payments (created_at)
  where status = 'pending' and hold_coins > 0 and hold_released_at is null;

-- Payments are written only by the functions below.
revoke insert, update, delete on public.payments from anon, authenticated;

alter table public.entitlements add column if not exists payment_id uuid references public.payments (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Subscriptions (auto-renewing card plans)
-- ---------------------------------------------------------------------------

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  provider payment_provider not null,
  tier tier not null,
  provider_subscription_id text not null,
  provider_customer_id text,
  -- Paystack's email_token, needed to stop a renewal. Server only: members
  -- can read their own subscription, but not this column (grants below).
  provider_token text,
  status text not null default 'active' check (status in ('active', 'non_renewing', 'past_due', 'ended')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);

create index if not exists subscriptions_profile_idx on public.subscriptions (profile_id, created_at desc);

alter table public.subscriptions enable row level security;
drop policy if exists "own subscriptions readable" on public.subscriptions;
create policy "own subscriptions readable" on public.subscriptions for select using (auth.uid() = profile_id);
revoke all on public.subscriptions from anon, authenticated;
grant select (id, profile_id, provider, tier, status, current_period_end, created_at, updated_at)
  on public.subscriptions to authenticated;

-- Reminder emails before a 30-day pass ends, sent once per grant.
create table if not exists public.plan_reminders (
  entitlement_id uuid primary key references public.entitlements (id) on delete cascade,
  sent_at timestamptz not null default now()
);
alter table public.plan_reminders enable row level security;
revoke all on public.plan_reminders from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ledger kinds for coins held towards a plan
-- ---------------------------------------------------------------------------

alter type coin_entry_kind add value if not exists 'plan_hold';
alter type coin_entry_kind add value if not exists 'plan_hold_release';

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

-- A pricing-integrity signal: one open review per member and signal (a
-- second mismatch doesn't flood the queue), and exactly one Sentinel event
-- per mismatch — 0009's trigger emits it when a review is queued, so it is
-- emitted here only when the review already exists.
create or replace function public._integrity_signal(p_profile uuid, p_signal integrity_signal, p_detail jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from integrity_reviews where profile_id = p_profile and signal = p_signal and status in ('open', 'reviewing')) then
    insert into integrity_reviews (profile_id, signal, detail) values (p_profile, p_signal, p_detail);
  else
    perform emit_trust_event(p_profile, null, p_signal::text::trust_event_kind, p_detail);
  end if;
end;
$$;
revoke all on function public._integrity_signal(uuid, integrity_signal, jsonb) from public, anon, authenticated;

-- Return held coins to the buckets they came from.
create or replace function public._release_hold(p payments)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_txn uuid := gen_random_uuid();
begin
  if p.hold_coins = 0 or p.hold_released_at is not null then return; end if;
  insert into coin_ledger (profile_id, delta, kind, bucket, txn_id, note)
  select p.profile_id, -sum(l.delta), 'plan_hold_release', l.bucket, v_txn, p.tier::text
    from coin_ledger l
   where l.txn_id = p.hold_txn and l.kind = 'plan_hold'
   group by l.bucket;
  update payments set hold_released_at = now() where id = p.id;
end;
$$;
revoke all on function public._release_hold(payments) from public, anon, authenticated;

-- Hold coins towards a plan, gift coins first. Returns the txn id.
create or replace function public._take_hold(p_profile uuid, p_coins integer, p_tier tier)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_txn uuid := gen_random_uuid();
  v_promo integer := greatest(promo_balance(p_profile), 0);
  v_from_promo integer := least(v_promo, p_coins);
begin
  if v_from_promo > 0 then
    insert into coin_ledger (profile_id, delta, kind, bucket, txn_id, note)
    values (p_profile, -v_from_promo, 'plan_hold', 'promotional', v_txn, p_tier::text);
  end if;
  if p_coins - v_from_promo > 0 then
    insert into coin_ledger (profile_id, delta, kind, bucket, txn_id, note)
    values (p_profile, -(p_coins - v_from_promo), 'plan_hold', 'purchased', v_txn, p_tier::text);
  end if;
  return v_txn;
end;
$$;
revoke all on function public._take_hold(uuid, integer, tier) from public, anon, authenticated;

-- Grant a paid plan. A pass extends from the end of an active paid grant of
-- the same tier; a renewing plan runs to the provider's period end plus a
-- day's grace, so a renewal that lands a few hours late never drops anyone.
create or replace function public._grant_plan(p payments, p_period_end timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare
  cfg coin_config;
  v_start timestamptz;
  v_end timestamptz;
begin
  select * into cfg from coin_config;
  select coalesce(max(ends_at), now()) into v_start from entitlements
   where profile_id = p.profile_id and tier = p.tier and source = 'subscription' and ends_at > now();
  if p.kind in ('plan_recurring', 'plan_renewal') and p_period_end is not null then
    v_start := now();
    v_end := p_period_end + interval '1 day';
  else
    v_end := v_start + make_interval(days => cfg.subscription_days);
  end if;
  insert into entitlements (profile_id, tier, source, starts_at, ends_at, payment_id)
  values (p.profile_id, p.tier, 'subscription', v_start, v_end, p.id);
end;
$$;
revoke all on function public._grant_plan(payments, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Opening a checkout
-- ---------------------------------------------------------------------------
--
-- p_mode: 'pack' (a coin pack), 'pass' (30 days, Paystack), 'recurring'
-- (monthly card plan), 'remainder' (coins held, Paystack charges the rest).

create or replace function public.payment_open(
  p_profile uuid, p_sku text, p_mode text, p_ref text,
  p_ip_country text default null, p_customer text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  pr price_list;
  cfg coin_config;
  v_kind text;
  v_amount integer;
  v_hold integer := 0;
  v_txn uuid;
  v_price_coins integer;
  v_have integer;
  v_ip text := nullif(upper(p_ip_country), '');
  v_id uuid;
begin
  select * into pr from price_list where sku = p_sku and active;
  if not found then raise exception 'That isn''t something you can buy.' using errcode = '22023'; end if;
  if p_ref is null or length(p_ref) < 8 then raise exception 'A payment reference is required.' using errcode = '22023'; end if;
  select * into cfg from coin_config;

  if pr.kind = 'coin_pack' and p_mode = 'pack' then
    v_kind := 'coin_pack';
  elsif pr.kind = 'plan' and p_mode = 'recurring' then
    v_kind := 'plan_recurring';
  elsif pr.kind = 'plan' and p_mode = 'pass' and pr.provider = 'paystack' then
    v_kind := 'plan_pass';
  elsif pr.kind = 'plan' and p_mode = 'remainder' and pr.provider = 'paystack' then
    v_kind := 'plan_remainder';
  else
    raise exception 'That way of paying isn''t available for %.', pr.label using errcode = '22023';
  end if;

  v_amount := pr.amount_minor;
  if v_kind = 'plan_remainder' then
    v_price_coins := case when pr.tier = 'premium' then cfg.premium_coins else cfg.premium_plus_coins end;
    v_have := greatest(promo_balance(p_profile), 0) + greatest(purchased_balance(p_profile), 0);
    if v_have >= v_price_coins then
      raise exception 'Your coins cover it — pay with coins instead.' using errcode = '22023';
    end if;
    if v_have <= 0 then
      raise exception 'You have no coins to put towards it.' using errcode = '22023';
    end if;
    v_hold := v_have;
    v_amount := (v_price_coins - v_hold) * cfg.coin_naira * 100;
    v_txn := _take_hold(p_profile, v_hold, pr.tier);
  end if;

  insert into payments (profile_id, provider, provider_ref, amount_minor, currency, status, purpose,
                        kind, sku, tier, coins, hold_coins, hold_txn, ip_country, provider_customer)
  values (p_profile, pr.provider, p_ref, v_amount, pr.currency, 'pending',
          case v_kind
            when 'coin_pack' then pr.label
            when 'plan_recurring' then pr.label || ' · monthly'
            when 'plan_remainder' then pr.label || ' · 30 days (' || v_hold || ' coins + card)'
            else pr.label || ' · 30 days' end,
          v_kind, pr.sku, pr.tier, pr.coins, v_hold, v_txn,
          case when v_ip ~ '^[A-Z]{2}$' then v_ip end, p_customer)
  returning id into v_id;

  -- Light request-country check, at payment only (PRD §7): a Naira checkout
  -- opened from outside Nigeria goes to review. Never a block.
  if pr.currency = 'NGN' and v_ip ~ '^[A-Z]{2}$' and v_ip <> 'NG' then
    perform _integrity_signal(p_profile, 'ip_country_mismatch',
      jsonb_build_object('track', 'ngn', 'at', 'payment', 'country', v_ip));
  end if;

  return jsonb_build_object('payment_id', v_id, 'amount_minor', v_amount, 'currency', pr.currency,
                            'hold_coins', v_hold, 'label', pr.label, 'provider', pr.provider);
end;
$$;

-- ---------------------------------------------------------------------------
-- Settling: the provider says it succeeded
-- ---------------------------------------------------------------------------
--
-- Returns 'granted', 'duplicate', 'credited_as_coins', 'mismatch',
-- 'refunded' or 'unknown'. Only 'granted' and 'credited_as_coins' changed
-- anything.

create or replace function public.payment_settle(
  p_provider payment_provider, p_ref text, p_amount_minor integer, p_currency text,
  p_card_country text default null, p_channel text default null, p_customer text default null,
  p_subscription text default null, p_period_end timestamptz default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  p payments;
  cfg coin_config;
  v_country text := nullif(upper(p_card_country), '');
  v_have integer;
  v_coins integer;
begin
  select * into p from payments where provider = p_provider and provider_ref = p_ref for update;
  if not found then return 'unknown'; end if;
  if p.status = 'succeeded' then return 'duplicate'; end if;
  if p.status = 'refunded' then return 'refunded'; end if;
  if p.amount_minor <> p_amount_minor or p.currency <> upper(p_currency) then return 'mismatch'; end if;
  select * into cfg from coin_config;

  update payments
     set status = 'succeeded', paid_at = now(),
         card_country = case when v_country ~ '^[A-Z]{2}$' then v_country end,
         channel = left(p_channel, 40),
         provider_customer = coalesce(p_customer, provider_customer),
         provider_subscription = coalesce(p_subscription, provider_subscription),
         period_end = p_period_end
   where id = p.id
   returning * into p;

  -- Payment-method geography, the strongest pricing-integrity signal: a
  -- Naira purchase on a card issued outside Nigeria goes to review.
  if p.currency = 'NGN' and p.card_country is not null and p.card_country <> 'NG' then
    perform _integrity_signal(p.profile_id, 'payment_geography_mismatch',
      jsonb_build_object('track', 'ngn', 'country', p.card_country, 'kind', p.kind));
  end if;

  if p.kind = 'coin_pack' then
    insert into coin_ledger (profile_id, delta, kind, bucket, txn_id, note)
    values (p.profile_id, p.coins, 'purchase', 'purchased', gen_random_uuid(), p.sku);
    return 'granted';
  end if;

  if p.kind = 'plan_remainder' and p.hold_released_at is not null then
    -- The payment arrived after its hold was released. Take the coins again
    -- if they're still there; if not, the money paid becomes coins (₦100
    -- each) rather than a plan Toastly hasn't been paid for. Never cash.
    v_have := greatest(promo_balance(p.profile_id), 0) + greatest(purchased_balance(p.profile_id), 0);
    if v_have >= p.hold_coins then
      update payments set hold_txn = _take_hold(p.profile_id, p.hold_coins, p.tier), hold_released_at = null
       where id = p.id returning * into p;
    else
      v_coins := p.amount_minor / 100 / cfg.coin_naira;
      insert into coin_ledger (profile_id, delta, kind, bucket, txn_id, note)
      values (p.profile_id, v_coins, 'purchase', 'purchased', gen_random_uuid(), 'plan_remainder_credited');
      return 'credited_as_coins';
    end if;
  end if;

  perform _grant_plan(p, p_period_end);
  return 'granted';
end;
$$;

-- The provider says it failed (or it was abandoned): release any held coins.
create or replace function public.payment_fail(p_provider payment_provider, p_ref text)
returns text language plpgsql security definer set search_path = public as $$
declare
  p payments;
begin
  select * into p from payments where provider = p_provider and provider_ref = p_ref for update;
  if not found then return 'unknown'; end if;
  if p.status <> 'pending' then return 'ignored'; end if;
  update payments set status = 'failed' where id = p.id returning * into p;
  perform _release_hold(p);
  return 'failed';
end;
$$;

-- Abandoned checkouts: release holds older than coin_config.hold_minutes.
create or replace function public.payment_release_stale()
returns integer language plpgsql security definer set search_path = public as $$
declare
  p payments;
  n integer := 0;
  cfg coin_config;
begin
  select * into cfg from coin_config;
  for p in select * from payments
            where status = 'pending' and hold_coins > 0 and hold_released_at is null
              and created_at < now() - make_interval(mins => cfg.hold_minutes)
            for update skip locked loop
    update payments set status = 'failed' where id = p.id returning * into p;
    perform _release_hold(p);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Renewals and subscription state
-- ---------------------------------------------------------------------------

-- Who a provider customer is: from their subscription, or the checkout that
-- created it.
create or replace function public._profile_for_customer(p_provider payment_provider, p_customer text, p_subscription text)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select profile_id from subscriptions where provider = p_provider and provider_subscription_id = p_subscription),
    (select profile_id from subscriptions where provider = p_provider and provider_customer_id = p_customer
      order by created_at desc limit 1),
    (select profile_id from payments where provider = p_provider and provider_customer = p_customer
      order by created_at desc limit 1));
$$;
revoke all on function public._profile_for_customer(payment_provider, text, text) from public, anon, authenticated;

-- A renewal charge we didn't start (the provider bills it): record it, then
-- settle it like any other payment.
create or replace function public.payment_record_renewal(
  p_provider payment_provider, p_ref text, p_customer text, p_subscription text, p_tier tier,
  p_amount_minor integer, p_currency text, p_card_country text default null,
  p_channel text default null, p_period_end timestamptz default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid;
  pr price_list;
begin
  if exists (select 1 from payments where provider = p_provider and provider_ref = p_ref) then
    return payment_settle(p_provider, p_ref, p_amount_minor, p_currency, p_card_country, p_channel,
                          p_customer, p_subscription, p_period_end);
  end if;
  v_profile := _profile_for_customer(p_provider, p_customer, p_subscription);
  if v_profile is null then return 'unknown'; end if;
  select * into pr from price_list where kind = 'plan' and tier = p_tier and provider = p_provider;
  if not found then return 'unknown'; end if;
  insert into payments (profile_id, provider, provider_ref, amount_minor, currency, status, purpose,
                        kind, sku, tier, provider_customer, provider_subscription)
  values (v_profile, p_provider, p_ref, p_amount_minor, upper(p_currency), 'pending', pr.label || ' · renewal',
          'plan_renewal', pr.sku, p_tier, p_customer, p_subscription);
  return payment_settle(p_provider, p_ref, p_amount_minor, p_currency, p_card_country, p_channel,
                        p_customer, p_subscription, p_period_end);
end;
$$;

-- Create or update a subscription from a provider event.
create or replace function public.subscription_sync(
  p_provider payment_provider, p_subscription text, p_customer text, p_tier tier, p_status text,
  p_period_end timestamptz default null, p_token text default null, p_profile uuid default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid := coalesce(p_profile, _profile_for_customer(p_provider, p_customer, p_subscription));
begin
  if p_status not in ('active', 'non_renewing', 'past_due', 'ended') then
    raise exception 'Unknown subscription status %', p_status;
  end if;
  if v_profile is null then return 'unknown'; end if;
  insert into subscriptions (profile_id, provider, tier, provider_subscription_id, provider_customer_id,
                             provider_token, status, current_period_end)
  values (v_profile, p_provider, p_tier, p_subscription, p_customer, p_token, p_status, p_period_end)
  on conflict (provider, provider_subscription_id) do update
     set status = excluded.status,
         tier = excluded.tier,
         provider_customer_id = coalesce(excluded.provider_customer_id, subscriptions.provider_customer_id),
         provider_token = coalesce(excluded.provider_token, subscriptions.provider_token),
         current_period_end = coalesce(excluded.current_period_end, subscriptions.current_period_end),
         updated_at = now();
  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants and schedule
-- ---------------------------------------------------------------------------

revoke all on function public.payment_open(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.payment_settle(payment_provider, text, integer, text, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.payment_fail(payment_provider, text) from public, anon, authenticated;
revoke all on function public.payment_release_stale() from public, anon, authenticated;
revoke all on function public.payment_record_renewal(payment_provider, text, text, text, tier, integer, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.subscription_sync(payment_provider, text, text, tier, text, timestamptz, text, uuid) from public, anon, authenticated;
grant execute on function public.payment_open(uuid, text, text, text, text, text) to service_role;
grant execute on function public.payment_settle(payment_provider, text, integer, text, text, text, text, text, timestamptz) to service_role;
grant execute on function public.payment_fail(payment_provider, text) to service_role;
grant execute on function public.payment_release_stale() to service_role;
grant execute on function public.payment_record_renewal(payment_provider, text, text, text, tier, integer, text, text, text, timestamptz) to service_role;
grant execute on function public.subscription_sync(payment_provider, text, text, tier, text, timestamptz, text, uuid) to service_role;

do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule('toastly-release-holds') where exists (select 1 from cron.job where jobname = 'toastly-release-holds');
    perform cron.schedule('toastly-release-holds', '*/15 * * * *', 'select public.payment_release_stale()');
  end if;
end $$;

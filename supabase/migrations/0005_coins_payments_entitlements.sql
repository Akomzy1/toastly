-- Toastly — coins, date commitments, payments and pricing integrity.
--
-- Two rules dominate this file:
--
--   1. A forfeited stake becomes a NON-WITHDRAWABLE stake credit for the
--      person who showed up, usable only as a deposit on a future date
--      (PRD §5.5, ratified). Toastly neither keeps it as revenue nor pays it
--      out. It must never appear in a withdrawal, payout or cash-balance
--      flow — which is why withdrawable balance is a separate function that
--      excludes it by construction, rather than a flag someone must remember
--      to check.
--
--   2. Pricing-integrity signals feed a MANUAL REVIEW QUEUE. There is no
--      auto-suspension, auto-ban or auto-lockout anywhere in this file, and
--      none may be added (CLAUDE.md).

-- ---------------------------------------------------------------------------
-- Coins
-- ---------------------------------------------------------------------------

create type coin_entry_kind as enum (
  'purchase',        -- bought a pack
  'stake_hold',      -- staked on a confirmed date (negative)
  'stake_return',    -- both showed up, or cancelled with notice (positive)
  'stake_credit',    -- the other person did not show up (positive, locked)
  'refund',          -- pack refunded to original payment method
  'gist_top_up'      -- bought an extra Gist session beyond the allowance
);

-- An append-only ledger. Balances are derived, never stored, so there is no
-- second place for them to disagree.
create table public.coin_ledger (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  delta integer not null check (delta <> 0),
  kind coin_entry_kind not null,
  -- False for stake credits, and for nothing else. See withdrawable_balance().
  withdrawable boolean not null default true,
  commitment_id uuid,
  note text,
  created_at timestamptz not null default now(),

  -- A stake credit is never withdrawable. Enforced here so it cannot be
  -- inserted any other way, by any code path.
  constraint stake_credit_is_locked
    check (kind <> 'stake_credit' or withdrawable = false)
);

create index coin_ledger_profile_idx on public.coin_ledger (profile_id, created_at desc);

-- Total coins, spendable on date stakes.
create or replace function public.coin_balance(p_profile_id uuid)
returns integer
language sql
stable
as $$
  select coalesce(sum(delta), 0)::int
  from public.coin_ledger where profile_id = p_profile_id;
$$;

-- What could ever be refunded to a payment method.
--
-- Stake credits are excluded by the WHERE clause, not by a caller
-- remembering to filter. "Unused coins never expire. Refundable to your
-- original payment method on request" is shipped copy on the Pricing page —
-- it is true of purchased coins, and must never become true of credits
-- earned because somebody was stood up.
create or replace function public.withdrawable_balance(p_profile_id uuid)
returns integer
language sql
stable
as $$
  select coalesce(sum(delta), 0)::int
  from public.coin_ledger
  where profile_id = p_profile_id
    and withdrawable = true;
$$;

-- ---------------------------------------------------------------------------
-- Date commitments
-- ---------------------------------------------------------------------------

create type commitment_status as enum (
  'pending',        -- one side has staked
  'confirmed',      -- both staked; the date is on
  'completed',      -- both showed up
  'cancelled',      -- called off with notice; everything returns
  'no_show'         -- one side did not turn up
);

create table public.date_commitments (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references public.threads (id) on delete set null,
  member_a uuid not null references public.profiles (id) on delete cascade,
  member_b uuid not null references public.profiles (id) on delete cascade,
  stake_coins integer not null default 10 check (stake_coins > 0),
  scheduled_for timestamptz not null,
  status commitment_status not null default 'pending',
  a_staked_at timestamptz,
  b_staked_at timestamptz,
  -- Set only when a no-show is confirmed. Nullable, and never inferred.
  no_show_member uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (member_a <> member_b)
);

-- The date is only on once BOTH stakes are down: the commitment is
-- symmetrical, so one person is never the only one with something at risk.
create or replace function public.confirm_when_both_staked()
returns trigger
language plpgsql
as $$
begin
  if new.a_staked_at is not null and new.b_staked_at is not null
     and new.status = 'pending' then
    new.status := 'confirmed';
  end if;
  return new;
end;
$$;

create trigger date_commitment_confirm
  before update on public.date_commitments
  for each row execute function public.confirm_when_both_staked();

-- Settle a commitment.
--
-- Cancelled with notice, or both showed up: everything returns, withdrawable
-- exactly as it was. A genuine no-show: the person who turned up receives the
-- other's stake as a locked credit. Toastly's own take is zero in every
-- branch — there is no entry in this function that credits the platform.
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
  v_shower uuid;
begin
  select * into c from date_commitments where id = p_commitment_id;
  if not found then raise exception 'No such commitment'; end if;

  if p_outcome in ('completed', 'cancelled') then
    -- Both stakes back, still withdrawable.
    insert into coin_ledger (profile_id, delta, kind, commitment_id)
    values (c.member_a, c.stake_coins, 'stake_return', c.id),
           (c.member_b, c.stake_coins, 'stake_return', c.id);

  elsif p_outcome = 'no_show' then
    if p_no_show_member is null then
      raise exception 'A no-show must name who did not turn up';
    end if;
    v_shower := case when p_no_show_member = c.member_a then c.member_b else c.member_a end;

    -- The person who showed up gets their own stake back, withdrawable...
    insert into coin_ledger (profile_id, delta, kind, commitment_id)
    values (v_shower, c.stake_coins, 'stake_return', c.id);

    -- ...plus the other stake as a LOCKED credit: usable only as a future
    -- date deposit, never cash, never withdrawable.
    insert into coin_ledger (profile_id, delta, kind, withdrawable, commitment_id, note)
    values (v_shower, c.stake_coins, 'stake_credit', false, c.id,
            'Stake credit — usable on a future date');
  end if;

  update date_commitments
     set status = p_outcome, no_show_member = p_no_show_member
   where id = p_commitment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
--
-- Two providers, kept separate because the tracks are separate products:
-- Paystack for NGN, Stripe for USD. Nothing converts one into the other.

create type payment_provider as enum ('paystack', 'stripe');
create type payment_status as enum ('pending', 'succeeded', 'failed', 'refunded');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  provider payment_provider not null,
  provider_ref text not null,
  amount_minor integer not null check (amount_minor > 0),
  currency text not null check (currency in ('NGN', 'USD')),
  status payment_status not null default 'pending',
  purpose text not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_ref)
);

-- NGN is always Paystack, USD always Stripe. A mismatch means a bug or an
-- arbitrage attempt, so the database refuses it outright.
alter table public.payments add constraint provider_matches_currency
  check ((provider = 'paystack' and currency = 'NGN')
      or (provider = 'stripe' and currency = 'USD'));

-- ---------------------------------------------------------------------------
-- Pricing integrity
-- ---------------------------------------------------------------------------
--
-- Signals go to a queue a human works. Nothing here suspends, bans or locks
-- anyone out, and nothing may be added that does.

create type integrity_signal as enum (
  'payment_geography_mismatch',
  'phone_origin_mismatch',
  'ip_country_mismatch'
);

create table public.integrity_reviews (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  signal integrity_signal not null,
  detail jsonb not null default '{}'::jsonb,
  -- 'open' until a person looks at it. There is deliberately no 'auto_actioned'
  -- state: a signal never results in an automatic consequence.
  status text not null default 'open' check (status in ('open', 'reviewing', 'cleared', 'actioned')),
  created_at timestamptz not null default now()
);

create index integrity_reviews_queue_idx on public.integrity_reviews (status, created_at);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.coin_ledger enable row level security;
alter table public.date_commitments enable row level security;
alter table public.payments enable row level security;
alter table public.integrity_reviews enable row level security;

create policy "own ledger readable" on public.coin_ledger for select
  using (auth.uid() = profile_id);

create policy "own commitments" on public.date_commitments for select
  using (auth.uid() = member_a or auth.uid() = member_b);

create policy "own payments readable" on public.payments for select
  using (auth.uid() = profile_id);

-- The integrity queue is staff-only: no client policy at all. A member must
-- never be able to see that they were flagged, nor probe what triggers it.

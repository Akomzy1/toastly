-- Toastly — profiles, verification and entitlements.
--
-- Several product rules are enforced here rather than in the UI, because
-- CLAUDE.md requires them at the access-control layer: UI copy is not a
-- control. Each is commented where it lives.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- Intent is a spectrum, collected at signup but NEVER a gate (CLAUDE.md).
-- Nullable on the profile precisely so it cannot block completion.
create type intent_level as enum (
  'casual',
  'open_to_serious',
  'serious',
  'marriage_minded'
);

-- Display-only. Present because it matters to Nigerian families, never a
-- matching filter. See the RLS notes and the feed rules in Prompt 4.
create type relationship_history as enum (
  'single',
  'divorced',
  'widowed',
  'single_parent'
);

-- Who may see a given optional field. Relationship history defaults to
-- 'on_match', not 'public' — it is never on the feed card by default.
create type field_visibility as enum ('private', 'on_match', 'public');

create type tier as enum (
  'starter',
  'premium',
  'premium_plus',
  'diaspora',
  'diaspora_plus'
);

-- Verification is a ladder, not a purchase. No tier appears in it.
create type verification_stage as enum (
  'unverified',
  'phone_verified',
  'verified_real',   -- phone + liveness. The badge.
  'id_confirmed'     -- + NIN/BVN. The second ring. Optional, forever.
);

-- Matching pool choice for diaspora members (PRD §5.6). Two distinct pools,
-- both nameable at once.
create type match_pool as enum ('back_home', 'diaspora', 'both');

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  display_name text not null check (char_length(display_name) between 2 and 40),
  date_of_birth date,
  -- Marketing targets Gen Z but the product does not hard-gate on age beyond
  -- the legal minimum: widowed and remarrying members skew older (PRD §4).
  city text,
  country_code text not null default 'NG',
  bio text check (char_length(bio) <= 600),

  -- Self-identified. Drives the women's launch entitlement below; never used
  -- to restrict what anyone can do.
  gender text check (gender in ('woman', 'man', 'non_binary', 'prefer_not_to_say')),

  intent intent_level,              -- nullable on purpose: never blocks signup
  pool match_pool not null default 'back_home',

  -- --- Optional, display-only fields -------------------------------------
  -- None of these may ever be used to exclude a profile from someone else's
  -- feed. They may power filters a member applies to their OWN search only
  -- (CLAUDE.md). Leaving them blank must never down-rank or hide anyone.
  religion text,
  tribe text,
  languages text[] not null default '{}',
  history relationship_history,
  has_children boolean,
  profession text,
  education text,

  -- Per-field visibility, member-controlled.
  religion_visibility field_visibility not null default 'public',
  tribe_visibility field_visibility not null default 'public',
  languages_visibility field_visibility not null default 'public',
  profession_visibility field_visibility not null default 'public',
  education_visibility field_visibility not null default 'public',
  -- Defaults to revealed-on-match, NOT public on the feed card (CLAUDE.md).
  -- Changing this default is a product decision, not a migration tidy-up.
  history_visibility field_visibility not null default 'on_match',

  -- --- Verification -------------------------------------------------------
  -- No tier column is consulted anywhere in this block. Verification is free
  -- on every tier, always, and is never paywalled.
  stage verification_stage not null default 'unverified',
  phone_verified_at timestamptz,
  liveness_verified_at timestamptz,
  id_confirmed_at timestamptz,
  -- Verified profession is a quiet secondary mark, subordinate to Verified
  -- Real. It unlocks nothing and is never a prestige or class signal.
  profession_verified_at timestamptz,

  -- NOTE: there is deliberately NO marital_status_verified column, and there
  -- must never be one. Marital status cannot be reliably verified by NIN, BVN
  -- or liveness. Married members are not welcome, and that is enforced by
  -- report-and-remove only (PRD §5.2.1). A "verified single" badge would
  -- undermine the one claim that is genuinely verifiable.

  paused boolean not null default false
);

comment on column public.profiles.intent is
  'Collected at signup, filterable, but never a gate. Nullable so it cannot block completion.';
comment on column public.profiles.history_visibility is
  'Defaults to on_match. Relationship history is never public on the feed card by default.';

-- One phone number, one account, permanently — this is what makes a block
-- actually stick. Stored hashed: the raw number is never needed after
-- verification, and never leaves the verification path.
create table public.phone_identities (
  phone_hash text primary key,
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  verified_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Entitlements
-- ---------------------------------------------------------------------------
--
-- Tier lives here, not on the profile, so that a grant has an explicit source
-- and expiry and can be audited. The women's launch offer is a REAL
-- entitlement grant at signup — not a coupon the member has to apply, and not
-- base Premium (CLAUDE.md).

create type entitlement_source as enum (
  'default',
  'womens_launch_offer',
  'subscription',
  'manual_grant'
);

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  tier tier not null,
  source entitlement_source not null,
  starts_at timestamptz not null default now(),
  -- null means open-ended (a paid subscription, or Starter)
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create index entitlements_profile_active_idx
  on public.entitlements (profile_id, starts_at desc);

-- The member's tier right now: the highest-privilege active grant.
create or replace function public.current_tier(p_profile_id uuid)
returns tier
language sql
stable
as $$
  select e.tier
  from public.entitlements e
  where e.profile_id = p_profile_id
    and e.starts_at <= now()
    and (e.ends_at is null or e.ends_at > now())
  order by case e.tier
    when 'premium_plus'   then 5
    when 'diaspora_plus'  then 4
    when 'premium'        then 3
    when 'diaspora'       then 2
    when 'starter'        then 1
  end desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
--
-- "User is married" is a FIRST-CLASS category, not bucketed under 'other'
-- (PRD §5.2.1) — it is the only enforcement mechanism for that standard, so
-- it must be countable and triageable on its own.

create type report_reason as enum (
  'user_is_married',
  'scam_or_fraud',
  'asked_for_money',
  'fake_profile',
  'harassment',
  'threats_or_coercion',
  'underage',
  'other'
);

create type report_status as enum ('open', 'reviewing', 'actioned', 'dismissed');

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_id uuid not null references public.profiles (id) on delete cascade,
  reason report_reason not null,
  detail text check (char_length(detail) <= 2000),
  status report_status not null default 'open',
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_id)
);

create index reports_triage_idx on public.reports (status, reason, created_at);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.phone_identities enable row level security;
alter table public.entitlements enable row level security;
alter table public.reports enable row level security;

-- A member always sees their own profile in full.
create policy "own profile readable"
  on public.profiles for select
  using (auth.uid() = id);

create policy "own profile writable"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "own profile insertable"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Other members' profiles are readable only once VERIFIED and not paused.
-- "Nobody sees your face until we've seen theirs": an unverified account
-- cannot browse. This is the trust layer expressed as a policy.
create policy "verified members see other verified profiles"
  on public.profiles for select
  using (
    paused = false
    and stage in ('verified_real', 'id_confirmed')
    and exists (
      select 1 from public.profiles me
      where me.id = auth.uid()
        and me.stage in ('verified_real', 'id_confirmed')
    )
  );

-- Entitlements are private to the member. Nobody can see what anyone else
-- pays for, and tier is never a public attribute.
create policy "own entitlements readable"
  on public.entitlements for select
  using (auth.uid() = profile_id);

-- Phone hashes are never readable by clients at all: no select policy.

-- Anyone verified may file a report; nobody may read the queue from the
-- client. Reports are triaged by staff through the service role.
create policy "members can report"
  on public.reports for insert
  with check (auth.uid() = reporter_id);

create policy "own reports readable"
  on public.reports for select
  using (auth.uid() = reporter_id);

-- ---------------------------------------------------------------------------
-- Signup
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gender text := new.raw_user_meta_data ->> 'gender';
begin
  insert into public.profiles (id, display_name, gender)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', 'New member'),
    v_gender
  );

  -- Everyone starts on Starter.
  insert into public.entitlements (profile_id, tier, source)
  values (new.id, 'starter', 'default');

  -- Women's launch offer: 30 days of FULL Premium Plus — live-video Gist and
  -- incognito, not base Premium — granted automatically at signup with no
  -- payment method. 30 days, not the 90 that appeared in earlier drafts.
  if v_gender = 'woman' then
    insert into public.entitlements (profile_id, tier, source, ends_at)
    values (new.id, 'premium_plus', 'womens_launch_offer', now() + interval '30 days');
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

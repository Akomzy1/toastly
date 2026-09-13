-- Toastly — Couple Mode and the AriyaPlanner handoff contract.
--
-- Couple Mode is FREE ON EVERY TIER, including Starter. It is the platform's
-- core LTV mechanic (PRD §6), not an upsell. Nothing in this file reads
-- current_tier(), and nothing may be added that does — three separate
-- prototype pages sold this as a Premium Plus feature and each was wrong.
--
-- Three further rules shape it:
--   * Mutual consent. A couple exists only once BOTH members accept, and the
--     brief is only assembled once both have consented to sharing it.
--   * Couple data never gates matching. None of these tables may appear in
--     build_daily_feed(), directly or through a view.
--   * The live AriyaPlanner integration is explicitly out of MVP scope. This
--     file defines the CONTRACT — what is captured and in what shape — and
--     nothing here transmits anything anywhere.

create type couple_status as enum (
  'proposed',     -- one member has asked
  'active',       -- both accepted; profiles paused
  'ended'
);

create table public.couples (
  id uuid primary key default gen_random_uuid(),
  member_a uuid not null references public.profiles (id) on delete cascade,
  member_b uuid not null references public.profiles (id) on delete cascade,
  status couple_status not null default 'proposed',
  proposed_by uuid not null references public.profiles (id),
  a_accepted_at timestamptz,
  b_accepted_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  check (member_a < member_b),
  check (member_a <> member_b)
);

-- One active couple per member: Couple Mode is exclusive by definition.
create unique index couples_one_active_per_member_a
  on public.couples (member_a) where status = 'active';
create unique index couples_one_active_per_member_b
  on public.couples (member_b) where status = 'active';

-- Entering Couple Mode pauses BOTH profiles together — "no quiet browsing",
-- as the prototype puts it. Symmetry is the point: one person cannot keep
-- looking while the other is paused. Leaving un-pauses both.
create or replace function public.sync_couple_pause()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.a_accepted_at is not null and new.b_accepted_at is not null
     and new.status = 'proposed' then
    new.status := 'active';
    new.started_at := now();
    update profiles set paused = true
      where id in (new.member_a, new.member_b);
  elsif new.status = 'ended' and old.status = 'active' then
    new.ended_at := coalesce(new.ended_at, now());
    update profiles set paused = false
      where id in (new.member_a, new.member_b);
  end if;
  return new;
end;
$$;

create trigger couples_pause_sync
  before update on public.couples
  for each row execute function public.sync_couple_pause();

-- ---------------------------------------------------------------------------
-- Milestones and the shared story
-- ---------------------------------------------------------------------------

-- 'engagement' is the primary handoff trigger into AriyaPlanner.
create type milestone_kind as enum (
  'first_date_logged',
  'official',
  'met_family',
  'introduction_ceremony',
  'anniversary',
  'engagement'
);

create table public.couple_milestones (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  kind milestone_kind not null,
  occurred_on date not null,
  note text check (char_length(note) <= 500),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index couple_milestones_idx on public.couple_milestones (couple_id, occurred_on);

create table public.couple_story_entries (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  occurred_on date,
  created_at timestamptz not null default now()
);

create table public.couple_saved_dates (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  title text not null check (char_length(title) <= 140),
  scheduled_for timestamptz not null,
  place text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- The AriyaPlanner handoff contract
-- ---------------------------------------------------------------------------
--
-- What a wedding plan actually needs to start warm: who the families are,
-- where everyone is, what the couple likes, and roughly what they can spend.
--
-- Captured in a structured, exportable shape so that when the integration is
-- built later it has something real to read. NOTHING SENDS THIS ANYWHERE.
-- There is no outbound call, no queue, no webhook and no foreign key to an
-- AriyaPlanner table in this migration — that integration is out of MVP
-- scope and needs an explicit decision before any of it is written.

create table public.couple_briefs (
  couple_id uuid primary key references public.couples (id) on delete cascade,

  -- Consent is per member and explicit. The brief is only assembled when
  -- BOTH have said yes; either withdrawing collapses it again.
  a_consented_at timestamptz,
  b_consented_at timestamptz,

  -- Cultural context. Copied from profiles at consent time rather than
  -- joined live, so a later profile edit cannot silently change a brief the
  -- couple already agreed to share.
  tribes text[] not null default '{}',
  languages text[] not null default '{}',
  home_states text[] not null default '{}',

  -- Where the wedding would happen. 'NG' or a diaspora city.
  base_country text,
  diaspora_city text,

  -- Aesthetic signals and budget cues: deliberately loose, because the shape
  -- AriyaPlanner wants is not settled and inventing rigid columns now would
  -- be guessing.
  aesthetic jsonb not null default '{}'::jsonb,
  budget_cues jsonb not null default '{}'::jsonb,

  updated_at timestamptz not null default now()
);

-- A brief is shareable only with both consents present. Used by the export,
-- never bypassed.
create or replace function public.brief_is_shareable(p_couple_id uuid)
returns boolean
language sql
stable
as $$
  select coalesce(
    (select a_consented_at is not null and b_consented_at is not null
     from public.couple_briefs where couple_id = p_couple_id),
    false);
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.couples enable row level security;
alter table public.couple_milestones enable row level security;
alter table public.couple_story_entries enable row level security;
alter table public.couple_saved_dates enable row level security;
alter table public.couple_briefs enable row level security;

create or replace function public.is_couple_member(p_couple_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.couples c
    where c.id = p_couple_id
      and (c.member_a = auth.uid() or c.member_b = auth.uid())
  );
$$;

create policy "members see their couple" on public.couples for select
  using (auth.uid() = member_a or auth.uid() = member_b);

create policy "members update their couple" on public.couples for update
  using (auth.uid() = member_a or auth.uid() = member_b);

create policy "members propose a couple" on public.couples for insert
  with check (auth.uid() = proposed_by);

create policy "couple milestones" on public.couple_milestones for all
  using (is_couple_member(couple_id)) with check (is_couple_member(couple_id));

create policy "couple story" on public.couple_story_entries for all
  using (is_couple_member(couple_id)) with check (is_couple_member(couple_id));

create policy "couple dates" on public.couple_saved_dates for all
  using (is_couple_member(couple_id)) with check (is_couple_member(couple_id));

-- The brief is visible only to the two people it describes. Nothing outside
-- the couple can read it, including any future integration, until a decision
-- is made about how that integration authenticates.
create policy "couple brief" on public.couple_briefs for all
  using (is_couple_member(couple_id)) with check (is_couple_member(couple_id));

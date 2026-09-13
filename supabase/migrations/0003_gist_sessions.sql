-- Toastly — Gist sessions.
--
-- A Gist is a scheduled, structured voice session. Three rules shape this:
--
--   1. Voice is the default and the free-tier path. Live VIDEO is entitled to
--      Premium Plus and Diaspora Plus only, enforced here rather than in UI
--      copy (CLAUDE.md).
--   2. Starter gets 2 voice sessions a month. That is not an arbitrary cap:
--      with free text disabled, it is Starter's ONLY outbound conversation
--      channel (PRD §7.1). Earlier drafts said 5, 8 or 10 — all superseded.
--   3. VoIP only. No carrier number, no real phone number, ever — there is
--      deliberately no column anywhere here that could hold one.

create type gist_medium as enum ('voice', 'video');

create type gist_status as enum (
  'proposed',    -- invited, awaiting the other person
  'accepted',    -- both agreed; still nothing live
  'live',
  'completed',
  'declined',
  'cancelled',
  'expired'
);

create table public.gist_sessions (
  id uuid primary key default gen_random_uuid(),
  proposer_id uuid not null references public.profiles (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  medium gist_medium not null default 'voice',
  status gist_status not null default 'proposed',

  scheduled_for timestamptz,
  started_at timestamptz,
  ended_at timestamptz,

  -- Mutual opt-in. NOTHING may activate a microphone or camera until both
  -- of these are set: a session is joinable only from 'accepted' onward.
  proposer_ready_at timestamptz,
  invitee_ready_at timestamptz,

  -- Set when a weak connection forces video down to audio, so the product
  -- can tell "chose voice" apart from "video failed". Degrading beats
  -- freezing (Prompt 5).
  degraded_to_voice_at timestamptz,

  created_at timestamptz not null default now(),
  check (proposer_id <> invitee_id)
);

create index gist_sessions_participant_idx
  on public.gist_sessions (proposer_id, created_at desc);
create index gist_sessions_invitee_idx
  on public.gist_sessions (invitee_id, created_at desc);

-- ---------------------------------------------------------------------------
-- The question deck
-- ---------------------------------------------------------------------------
--
-- Shared and structured, escalating playful -> real. Both people see the same
-- question at the same time; the session "has something to talk about" rather
-- than leaving two strangers staring at each other.

create table public.gist_questions (
  id smallint primary key generated always as identity,
  text text not null unique,
  -- 1 = playful, 3 = real. The deck walks up.
  depth smallint not null check (depth between 1 and 3),
  sort_order smallint not null default 0
);

insert into public.gist_questions (text, depth, sort_order) values
  ('What did you eat today, and was it a good decision?', 1, 10),
  ('Jollof: who does it best, and are you willing to defend that?', 1, 20),
  ('What is the most Nigerian thing about you?', 1, 30),
  ('What does a good Saturday look like when nobody is watching?', 2, 40),
  ('Who in your family would you introduce someone to first?', 2, 50),
  ('What is something you have changed your mind about recently?', 2, 60),
  ('What does being taken care of look like to you?', 3, 70),
  ('What would you want to be true about your life in five years?', 3, 80),
  ('What is the thing you are not willing to compromise on?', 3, 90);

-- ---------------------------------------------------------------------------
-- Outcomes
-- ---------------------------------------------------------------------------
--
-- Private double opt-in at the end: each person answers "continue?" without
-- seeing the other's answer. A match only progresses if both said yes, and
-- neither learns that the other said no.

create table public.gist_outcomes (
  session_id uuid not null references public.gist_sessions (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  wants_to_continue boolean not null,
  -- Structured signals, deliberately shaped for reuse in the AriyaPlanner
  -- brief later (Prompt 8): cities, family context and budget cues are what
  -- a wedding plan needs. Captured here as a jsonb bag rather than columns,
  -- because nothing consumes it yet and the shape is not settled.
  -- NOTE: the AriyaPlanner integration itself is explicitly out of scope.
  signals jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (session_id, profile_id)
);

-- True only when both sides said yes. Used to advance a match; never exposed
-- in a way that reveals an individual answer.
create or replace function public.gist_mutual_continue(p_session_id uuid)
returns boolean
language sql
stable
as $$
  select count(*) = 2 and bool_and(wants_to_continue)
  from public.gist_outcomes
  where session_id = p_session_id;
$$;

-- ---------------------------------------------------------------------------
-- Entitlement caps
-- ---------------------------------------------------------------------------

-- Voice sessions used this calendar month.
create or replace function public.voice_gists_this_month(p_profile_id uuid)
returns integer
language sql
stable
as $$
  select count(*)::int
  from public.gist_sessions g
  where g.medium = 'voice'
    and g.status in ('accepted', 'live', 'completed')
    and (g.proposer_id = p_profile_id or g.invitee_id = p_profile_id)
    and g.created_at >= date_trunc('month', now());
$$;

-- Starter: 2 a month. Everyone else: unlimited (null).
create or replace function public.voice_gist_allowance(p_profile_id uuid)
returns integer
language sql
stable
as $$
  select case current_tier(p_profile_id)
    when 'starter' then 2
    else null          -- unlimited
  end;
$$;

-- Live video is Premium Plus and Diaspora Plus only. This is the access
-- control; UI copy is not a control.
create or replace function public.can_use_video_gist(p_profile_id uuid)
returns boolean
language sql
stable
as $$
  select current_tier(p_profile_id) in ('premium_plus', 'diaspora_plus');
$$;

create or replace function public.can_start_gist(
  p_profile_id uuid,
  p_medium gist_medium
)
returns boolean
language sql
stable
as $$
  select case
    when p_medium = 'video' then can_use_video_gist(p_profile_id)
    else coalesce(
      voice_gists_this_month(p_profile_id) < voice_gist_allowance(p_profile_id),
      true  -- null allowance means unlimited
    )
  end;
$$;

-- Enforced on write, not merely checked by the caller: a client that skips
-- the check still cannot exceed the cap or start video without the tier.
create or replace function public.enforce_gist_entitlement()
returns trigger
language plpgsql
as $$
begin
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

create trigger gist_entitlement_check
  before insert on public.gist_sessions
  for each row execute function public.enforce_gist_entitlement();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.gist_sessions enable row level security;
alter table public.gist_questions enable row level security;
alter table public.gist_outcomes enable row level security;

create policy "questions are readable" on public.gist_questions for select using (true);

create policy "participants see their sessions" on public.gist_sessions for select
  using (auth.uid() = proposer_id or auth.uid() = invitee_id);

create policy "members propose their own sessions" on public.gist_sessions for insert
  with check (auth.uid() = proposer_id);

create policy "participants update their sessions" on public.gist_sessions for update
  using (auth.uid() = proposer_id or auth.uid() = invitee_id);

-- A member may write their own outcome and read ONLY their own. The other
-- person's answer is never readable, so "continue?" stays a genuine private
-- double opt-in — nobody finds out they were turned down.
create policy "own outcome writable" on public.gist_outcomes for insert
  with check (auth.uid() = profile_id);

create policy "own outcome readable" on public.gist_outcomes for select
  using (auth.uid() = profile_id);

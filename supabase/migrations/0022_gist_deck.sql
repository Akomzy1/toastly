-- Toastly — the Gist question deck, one card at a time, the same on both
-- screens (decision of 3 October 2026).
--
-- Either person taps Next or Skip, after agreeing out loud; the card moves
-- for both. The position is the server's, so a reload or a rejoin lands on
-- the same card, and two taps at once can only move the deck one step
-- (gist_deck_advance takes the position the tapper was looking at).
--
-- What is stored per question: answered or skipped, and when. Never what
-- was said — PRD §5.1.1 allows "which questions were answered" as session
-- outcome data; audio and transcripts are never retained.

set search_path = public;

alter table public.gist_sessions
  add column if not exists deck_index smallint not null default 0;

create table if not exists public.gist_deck_steps (
  session_id uuid not null references public.gist_sessions (id) on delete cascade,
  position smallint not null,
  question_id smallint not null references public.gist_questions (id),
  outcome text not null check (outcome in ('answered', 'skipped')),
  decided_at timestamptz not null default now(),
  primary key (session_id, position)
);

alter table public.gist_deck_steps enable row level security;

create policy "participants read their deck steps" on public.gist_deck_steps
  for select using (
    exists (
      select 1 from public.gist_sessions g
      where g.id = gist_deck_steps.session_id
        and auth.uid() in (g.proposer_id, g.invitee_id)
    )
  );

-- The deck position joins the columns members can't write directly.
create or replace function public.guard_gist_timing()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- Members create Gists through gist_invite(), not by inserting rows.
    raise exception 'Send a Gist invite from a prompt answer.' using errcode = '42501';
  end if;
  if new.started_at is distinct from old.started_at
     or new.ends_at is distinct from old.ends_at
     or new.proposer_extend_at is distinct from old.proposer_extend_at
     or new.invitee_extend_at is distinct from old.invitee_extend_at
     or new.extended_at is distinct from old.extended_at
     or new.scheduled_for is distinct from old.scheduled_for
     or new.time_proposed_by is distinct from old.time_proposed_by
     or new.time_confirmed_at is distinct from old.time_confirmed_at
     or new.prompt_answer_id is distinct from old.prompt_answer_id
     or new.deck_index is distinct from old.deck_index then
    raise exception 'The Gist clock is kept by Toastly.' using errcode = '42501';
  end if;
  -- Accepting, declining and going live happen through the functions below.
  if new.status is distinct from old.status
     and new.status in ('accepted', 'declined', 'live', 'expired') then
    raise exception 'Use the invite buttons to answer a Gist.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.gist_deck_advance(p_session_id uuid, p_expected smallint, p_skip boolean)
returns smallint
language plpgsql
security definer
set search_path = public
as $$
declare
  s gist_sessions%rowtype;
  v_question smallint;
begin
  select * into s from gist_sessions where id = p_session_id for update;
  if not found or auth.uid() not in (s.proposer_id, s.invitee_id) then
    raise exception 'That session doesn''t exist.' using errcode = 'P0002';
  end if;
  if s.status <> 'live' or s.ends_at is null or now() >= s.ends_at then
    raise exception 'This Gist isn''t running.' using errcode = '42501';
  end if;
  -- The other person already moved it: no double step.
  if s.deck_index <> p_expected then
    return s.deck_index;
  end if;

  select q.id into v_question
  from gist_questions q
  order by q.sort_order, q.id
  offset s.deck_index limit 1;
  if v_question is null then
    return s.deck_index;  -- past the last card
  end if;

  insert into gist_deck_steps (session_id, position, question_id, outcome)
  values (p_session_id, s.deck_index, v_question, case when p_skip then 'skipped' else 'answered' end)
  on conflict (session_id, position) do nothing;

  update gist_sessions set deck_index = s.deck_index + 1 where id = p_session_id;
  return s.deck_index + 1;
end;
$$;

revoke all on function public.gist_deck_advance(uuid, smallint, boolean) from public, anon;
grant execute on function public.gist_deck_advance(uuid, smallint, boolean) to authenticated;

-- Toastly — the Gist clock, kept by the server (Phase 1 voice transport).
--
-- 18 minutes, extendable once (PRD §5.4, CLAUDE.md). Until now the session
-- row had started_at/ended_at but nothing kept time, and "participants update
-- their sessions" (0003) let either member write any column — including
-- started_at. A member could have stretched a Gist indefinitely by editing it.
--
-- From here the clock is server-side:
--   gist_join(session)     first join starts it; returns when it ends
--   gist_extend(session)   each side asks; extends once, only when BOTH ask
--   gist_finish(session)   closes it, but only once the time is actually up
-- and a guard refuses any direct member write to the timing columns.
--
-- Voice only in Phase 1. Live video transport is Phase 2 (P2-D).

alter table public.gist_sessions
  add column if not exists ends_at timestamptz,
  add column if not exists proposer_extend_at timestamptz,
  add column if not exists invitee_extend_at timestamptz,
  add column if not exists extended_at timestamptz;

-- ---------------------------------------------------------------------------
-- Timing columns are written by these functions, not by members
-- ---------------------------------------------------------------------------

-- SECURITY INVOKER on purpose: current_user is the caller's role here, and
-- the security-definer functions below run as their owner, so they pass.
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
    new.started_at := null;
    new.ends_at := null;
    new.proposer_extend_at := null;
    new.invitee_extend_at := null;
    new.extended_at := null;
    return new;
  end if;
  if new.started_at is distinct from old.started_at
     or new.ends_at is distinct from old.ends_at
     or new.proposer_extend_at is distinct from old.proposer_extend_at
     or new.invitee_extend_at is distinct from old.invitee_extend_at
     or new.extended_at is distinct from old.extended_at then
    raise exception 'The Gist clock is kept by Toastly.' using errcode = '42501';
  end if;
  -- 'live' is set only by gist_join, so a session can't be marked live
  -- without its clock starting.
  if new.status = 'live' and old.status is distinct from 'live' then
    raise exception 'A Gist goes live when both people join.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_gist_timing on public.gist_sessions;
create trigger guard_gist_timing
  before insert or update on public.gist_sessions
  for each row execute function public.guard_gist_timing();

-- ---------------------------------------------------------------------------
-- Join: starts the clock on first join
-- ---------------------------------------------------------------------------

create or replace function public.gist_join(p_session_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  s gist_sessions%rowtype;
begin
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
-- Extend: once, and only when both people ask
-- ---------------------------------------------------------------------------

create or replace function public.gist_extend(p_session_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  s gist_sessions%rowtype;
begin
  select * into s from gist_sessions where id = p_session_id for update;
  if not found or auth.uid() not in (s.proposer_id, s.invitee_id) then
    raise exception 'That session doesn''t exist.' using errcode = 'P0002';
  end if;
  if s.status <> 'live' or s.ends_at is null or now() >= s.ends_at then
    raise exception 'This Gist isn''t running.' using errcode = '42501';
  end if;
  if s.extended_at is not null then
    raise exception 'A Gist can be extended once.' using errcode = '42501';
  end if;

  if auth.uid() = s.proposer_id then
    update gist_sessions set proposer_extend_at = coalesce(proposer_extend_at, now())
     where id = p_session_id returning * into s;
  else
    update gist_sessions set invitee_extend_at = coalesce(invitee_extend_at, now())
     where id = p_session_id returning * into s;
  end if;

  if s.proposer_extend_at is not null and s.invitee_extend_at is not null then
    update gist_sessions
       set extended_at = now(),
           ends_at = s.ends_at + interval '18 minutes'
     where id = p_session_id
    returning * into s;
  end if;
  return s.ends_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Finish: only once the time is up (a few seconds' grace for clock drift)
-- ---------------------------------------------------------------------------

create or replace function public.gist_finish(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  s gist_sessions%rowtype;
begin
  select * into s from gist_sessions where id = p_session_id for update;
  if not found or auth.uid() not in (s.proposer_id, s.invitee_id) then
    raise exception 'That session doesn''t exist.' using errcode = 'P0002';
  end if;
  if s.ends_at is null or now() < s.ends_at - interval '5 seconds' then
    return false;
  end if;
  if s.ended_at is null then
    update gist_sessions set ended_at = s.ends_at where id = p_session_id;
  end if;
  return true;
end;
$$;

revoke all on function public.gist_join(uuid) from public, anon;
revoke all on function public.gist_extend(uuid) from public, anon;
revoke all on function public.gist_finish(uuid) from public, anon;
grant execute on function public.gist_join(uuid) to authenticated;
grant execute on function public.gist_extend(uuid) to authenticated;
grant execute on function public.gist_finish(uuid) to authenticated;

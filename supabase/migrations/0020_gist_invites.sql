-- Toastly — Gist invites, end to end (the gist-invite prototypes, 1–8).
--
-- Until now nothing created a Gist: the feed's "Gist invite" saved a reply,
-- and no screen accepted one. From here:
--   gist_invite(answer)        an invite about one prompt answer, to someone
--                              in today's six
--   gist_respond(session, ok)  the invitee accepts or declines
--   gist_propose_time / gist_confirm_time
--                              either picks a time; the other confirms before
--                              anything is set (both-clocks.slim.html)
--   gist_partner_online        yes/no only, inside an accepted Gist
--
-- DECISIONS (3 October 2026):
--   * A Gist counts when the call CONNECTS, for BOTH people (PRD §7.1, "at
--     most 2 real conversations total"). Starter: 2 a month. Checked when
--     sending, when accepting, and when the clock starts.
--   * Invites close after 3 days unanswered.
--   * Either person can extend once (both-clocks.slim.html: "Either of you
--     can extend it once") — replaces 0019's mutual extension.

set search_path = public;

alter table public.gist_sessions
  add column if not exists prompt_answer_id uuid references public.prompt_answers (id) on delete set null,
  add column if not exists time_proposed_by uuid references public.profiles (id) on delete set null,
  add column if not exists time_confirmed_at timestamptz;

-- ---------------------------------------------------------------------------
-- The cap: connected calls this calendar month, either side
-- ---------------------------------------------------------------------------

create or replace function public.voice_gists_this_month(p_profile_id uuid)
returns integer
language sql
stable
as $$
  select count(*)::int
  from public.gist_sessions g
  where g.medium = 'voice'
    and g.started_at >= date_trunc('month', now())
    and (g.proposer_id = p_profile_id or g.invitee_id = p_profile_id);
$$;

-- True when this member may connect one more voice Gist this month.
create or replace function public.gist_has_room(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(voice_gists_this_month(p_profile_id) < voice_gist_allowance(p_profile_id), true);
$$;

revoke all on function public.gist_has_room(uuid) from public, anon;
grant execute on function public.gist_has_room(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Timing and scheduling columns are the server's
-- ---------------------------------------------------------------------------

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
     or new.prompt_answer_id is distinct from old.prompt_answer_id then
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

-- ---------------------------------------------------------------------------
-- Invite
-- ---------------------------------------------------------------------------

create or replace function public.gist_invite(p_prompt_answer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_to uuid;
  v_id uuid;
begin
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
  ) then
    raise exception 'That answer isn''t available.' using errcode = 'P0002';
  end if;
  -- One open invite or Gist per pair at a time.
  if exists (
    select 1 from gist_sessions g
    where ((g.proposer_id = v_me and g.invitee_id = v_to) or (g.proposer_id = v_to and g.invitee_id = v_me))
      and g.status in ('proposed', 'accepted', 'live')
      and not (g.status = 'proposed' and g.created_at < now() - interval '3 days')
  ) then
    raise exception 'You already have a Gist open with them.' using errcode = '23505';
  end if;
  if not gist_has_room(v_me) then
    raise exception 'Monthly voice Gist allowance reached' using errcode = '42501';
  end if;

  insert into gist_sessions (proposer_id, invitee_id, medium, prompt_answer_id)
  values (v_me, v_to, 'voice', p_prompt_answer_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Accept or decline (no reason asked)
-- ---------------------------------------------------------------------------

create or replace function public.gist_respond(p_session_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  s gist_sessions%rowtype;
begin
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
  if p_accept and not gist_has_room(auth.uid()) then
    raise exception 'Monthly voice Gist allowance reached' using errcode = '42501';
  end if;
  update gist_sessions set status = case when p_accept then 'accepted' else 'declined' end::gist_status
   where id = p_session_id;
  return case when p_accept then 'accepted' else 'declined' end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pick a time; the other person confirms
-- ---------------------------------------------------------------------------

create or replace function public.gist_propose_time(p_session_id uuid, p_at timestamptz)
returns void
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
  if s.status <> 'accepted' or s.started_at is not null then
    raise exception 'You can pick a time once the invite is accepted.' using errcode = '42501';
  end if;
  if p_at < now() + interval '5 minutes' or p_at > now() + interval '14 days' then
    raise exception 'Pick a time in the next two weeks.' using errcode = '22023';
  end if;
  update gist_sessions
     set scheduled_for = p_at, time_proposed_by = auth.uid(), time_confirmed_at = null
   where id = p_session_id;
end;
$$;

create or replace function public.gist_confirm_time(p_session_id uuid)
returns void
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
  if s.time_proposed_by is null or s.time_proposed_by = auth.uid() then
    raise exception 'There''s no time waiting for you to confirm.' using errcode = '42501';
  end if;
  if s.scheduled_for is null or s.scheduled_for < now() then
    raise exception 'That time has passed. Pick another.' using errcode = '42501';
  end if;
  update gist_sessions set time_confirmed_at = now() where id = p_session_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Join: 0019's, plus the cap at the moment the call connects
-- ---------------------------------------------------------------------------

create or replace function public.gist_join(p_session_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  s gist_sessions%rowtype;
  v_other uuid;
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
    v_other := case when auth.uid() = s.proposer_id then s.invitee_id else s.proposer_id end;
    if not gist_has_room(auth.uid()) then
      raise exception 'You''ve used your 2 Gists this month.' using errcode = '42501';
    end if;
    -- Never reveal the other person's plan or usage.
    if not gist_has_room(v_other) then
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
-- Extend: either person, once (both-clocks.slim.html)
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
  update gist_sessions
     set extended_at = now(),
         ends_at = s.ends_at + interval '18 minutes',
         proposer_extend_at = case when auth.uid() = s.proposer_id then now() else proposer_extend_at end,
         invitee_extend_at = case when auth.uid() = s.invitee_id then now() else invitee_extend_at end
   where id = p_session_id
  returning * into s;
  return s.ends_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- "Online now" — a yes/no, only inside an accepted Gist
-- ---------------------------------------------------------------------------

create table if not exists public.member_presence (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  seen_at timestamptz not null default now()
);

alter table public.member_presence enable row level security;
revoke all on public.member_presence from anon, authenticated;

create or replace function public.touch_presence()
returns void
language sql
security definer
set search_path = public
as $$
  insert into member_presence (profile_id, seen_at) values (auth.uid(), now())
  on conflict (profile_id) do update set seen_at = excluded.seen_at;
$$;

-- No timestamps leave the database: only whether the other person in YOUR
-- accepted (or live) Gist was here in the last two minutes.
create or replace function public.gist_partner_online(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from gist_sessions g
    join member_presence p
      on p.profile_id = case when g.proposer_id = auth.uid() then g.invitee_id else g.proposer_id end
    where g.id = p_session_id
      and auth.uid() in (g.proposer_id, g.invitee_id)
      and g.status in ('accepted', 'live')
      and p.seen_at > now() - interval '2 minutes'
  );
$$;

-- ---------------------------------------------------------------------------
-- The answer a Gist is about — readable by both people, always
-- ---------------------------------------------------------------------------
--
-- prompt_answers RLS lets the inviter read the invitee's answer only while
-- the invitee is in today's six. The invite screens show it for as long as
-- the Gist exists, so both participants read it through this.

create or replace function public.gist_answer(p_session_id uuid)
returns table (prompt text, answer text, owner_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select pr.text, pa.answer, pa.profile_id
  from gist_sessions g
  join prompt_answers pa on pa.id = g.prompt_answer_id
  join prompts pr on pr.id = pa.prompt_id
  where g.id = p_session_id
    and auth.uid() in (g.proposer_id, g.invitee_id);
$$;

revoke all on function public.gist_answer(uuid) from public, anon;
grant execute on function public.gist_answer(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Invites close after 3 days; the nightly job tidies them
-- ---------------------------------------------------------------------------

create or replace function public.gist_expire_invites()
returns void
language sql
security definer
set search_path = public
as $$
  update gist_sessions set status = 'expired'
   where status = 'proposed' and created_at < now() - interval '3 days';
$$;

create or replace function public.purge_expired_retention()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer;
begin
  delete from retained_safety_records where retain_until < now();
  delete from blocked_phone_hashes where retain_until < now();
  delete from blocked_id_hashes where retain_until < now();
  delete from retained_payments where retain_until < now();
  update verification_sessions set id_hash = null
   where id_hash is not null
     and status in ('started', 'submitted')
     and created_at < now() - interval '1 day';

  select days into v_days from retention_config where name = 'support_transcripts';
  v_days := coalesce(v_days, 30);
  delete from support_conversations
   where last_active_at < now() - make_interval(days => v_days);
  update support_tickets set summary = null
   where summary is not null
     and created_at < now() - make_interval(days => v_days);
  delete from agent_requests where created_at < now() - interval '7 days';

  perform gist_expire_invites();
end;
$$;

revoke all on function public.purge_expired_retention() from public, anon, authenticated;
revoke all on function public.gist_expire_invites() from public, anon, authenticated;

revoke all on function public.gist_invite(uuid) from public, anon;
revoke all on function public.gist_respond(uuid, boolean) from public, anon;
revoke all on function public.gist_propose_time(uuid, timestamptz) from public, anon;
revoke all on function public.gist_confirm_time(uuid) from public, anon;
revoke all on function public.touch_presence() from public, anon;
revoke all on function public.gist_partner_online(uuid) from public, anon;
grant execute on function public.gist_invite(uuid) to authenticated;
grant execute on function public.gist_respond(uuid, boolean) to authenticated;
grant execute on function public.gist_propose_time(uuid, timestamptz) to authenticated;
grant execute on function public.gist_confirm_time(uuid) to authenticated;
grant execute on function public.touch_presence() to authenticated;
grant execute on function public.gist_partner_online(uuid) to authenticated;

-- Toastly — live video in a Gist (Phase 2; decided 8 October 2026; PRD §5.4;
-- design/prototype/gist-video-call.html). Follows 0039.
--
--   - Unlock: video is available in a Gist if EITHER participant has Premium
--     Plus or Diaspora Plus (the women's offer included). Checked here on
--     every request and every acceptance.
--   - Every Gist starts as voice. "Ask for video" opens after 3 minutes
--     (gist_config.video_ask_after_seconds).
--   - Both or neither: video goes on only when the other person accepts.
--     Either person turning it off ends it for both. A declined request
--     blocks further requests for the rest of that Gist.
--   - The app keeps LiveKit in step: camera rights are granted to both only
--     while video_state = 'on' (app/api/gist/[id]/video, lib/livekit.ts).
--   - No recording, anywhere: nothing here or in the app starts one.
--
-- The whole feature stays behind VIDEO_GIST_ENABLED (lib/features.ts), off
-- until it ships. This migration only adds the rules.
--
-- medium stays 'voice': a Gist's medium decides the Starter count (0035),
-- and turning video on mid-call mustn't change what was counted.

set search_path = public;

alter table public.gist_config
  add column if not exists video_ask_after_seconds smallint not null default 180
    check (video_ask_after_seconds between 0 and 1080);

alter table public.gist_sessions
  add column if not exists video_state text not null default 'off' check (video_state in ('off', 'requested', 'on')),
  add column if not exists video_requested_by uuid references public.profiles (id) on delete set null,
  add column if not exists video_requested_at timestamptz,
  -- Set when a request is declined: no more requests in this Gist.
  add column if not exists video_declined_at timestamptz,
  add column if not exists video_on_at timestamptz,
  add column if not exists video_off_reason text
    check (video_off_reason is null or video_off_reason in ('turned_off', 'weak_connection', 'camera_unavailable', 'cancelled'));

-- Members update their own sessions (0003); the video columns are the server's.
create or replace function public.guard_gist_video()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.video_state is distinct from old.video_state
          or new.video_requested_by is distinct from old.video_requested_by
          or new.video_requested_at is distinct from old.video_requested_at
          or new.video_declined_at is distinct from old.video_declined_at
          or new.video_on_at is distinct from old.video_on_at
          or new.video_off_reason is distinct from old.video_off_reason) then
    raise exception 'Video in a Gist is kept by Toastly.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_gist_video() from public, anon, authenticated;
drop trigger if exists guard_gist_video on public.gist_sessions;
create trigger guard_gist_video before update on public.gist_sessions
  for each row execute function public.guard_gist_video();

-- Either participant on Premium Plus or Diaspora Plus (the women's offer
-- grants these tiers, so it counts). Internal.
create or replace function public._gist_video_allowed(s gist_sessions)
returns boolean language sql stable security definer set search_path = public as $$
  select current_tier(s.proposer_id) in ('premium_plus', 'diaspora_plus')
      or current_tier(s.invitee_id) in ('premium_plus', 'diaspora_plus');
$$;
revoke all on function public._gist_video_allowed(gist_sessions) from public, anon, authenticated;

-- For the call screen: does this Gist have a video control at all? Only
-- about the caller's own Gist; never says which person's plan it is.
create or replace function public.gist_video_allowed(p_session_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  s gist_sessions%rowtype;
begin
  select * into s from gist_sessions where id = p_session_id;
  if not found or auth.uid() not in (s.proposer_id, s.invitee_id) then
    raise exception 'That session doesn''t exist.' using errcode = 'P0002';
  end if;
  return _gist_video_allowed(s);
end;
$$;
revoke all on function public.gist_video_allowed(uuid) from public, anon;
grant execute on function public.gist_video_allowed(uuid) to authenticated;

-- The checks every video action shares: a participant, in a Gist that's
-- running. Returns the locked row.
create or replace function public._gist_video_session(p_session_id uuid)
returns gist_sessions language plpgsql security definer set search_path = public as $$
declare
  s gist_sessions%rowtype;
begin
  perform assert_live(auth.uid());
  select * into s from gist_sessions where id = p_session_id for update;
  if not found or auth.uid() not in (s.proposer_id, s.invitee_id) then
    raise exception 'That session doesn''t exist.' using errcode = 'P0002';
  end if;
  if s.status <> 'live' or s.started_at is null or s.ends_at is null or now() >= s.ends_at then
    raise exception 'This Gist isn''t running.' using errcode = '42501';
  end if;
  return s;
end;
$$;
revoke all on function public._gist_video_session(uuid) from public, anon, authenticated;

-- Ask for video.
create or replace function public.gist_video_request(p_session_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  s gist_sessions%rowtype := _gist_video_session(p_session_id);
  v_after smallint;
begin
  if not _gist_video_allowed(s) then
    raise exception 'Video isn''t available in this Gist.' using errcode = '42501';
  end if;
  if s.video_declined_at is not null then
    raise exception 'Video was declined in this Gist.' using errcode = '42501';
  end if;
  if s.video_state <> 'off' then
    return s.video_state;
  end if;
  select video_ask_after_seconds into v_after from gist_config;
  if now() < s.started_at + make_interval(secs => coalesce(v_after, 180)) then
    raise exception 'Video can be asked for after the first few minutes.' using errcode = '42501';
  end if;
  update gist_sessions
     set video_state = 'requested', video_requested_by = auth.uid(), video_requested_at = now(), video_off_reason = null
   where id = p_session_id;
  return 'requested';
end;
$$;

-- Withdraw your own request.
create or replace function public.gist_video_cancel(p_session_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  s gist_sessions%rowtype := _gist_video_session(p_session_id);
begin
  if s.video_state = 'requested' and s.video_requested_by = auth.uid() then
    update gist_sessions set video_state = 'off', video_off_reason = 'cancelled' where id = p_session_id;
    return 'off';
  end if;
  return s.video_state;
end;
$$;

-- The other person answers. Yes turns video on for both; no ends the chance
-- for the rest of this Gist.
create or replace function public.gist_video_answer(p_session_id uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  s gist_sessions%rowtype := _gist_video_session(p_session_id);
begin
  if s.video_state <> 'requested' then
    raise exception 'There''s no video request to answer.' using errcode = '42501';
  end if;
  if s.video_requested_by = auth.uid() then
    raise exception 'The other person answers a video request.' using errcode = '42501';
  end if;
  if not p_accept then
    update gist_sessions set video_state = 'off', video_declined_at = now(), video_off_reason = null where id = p_session_id;
    return 'off';
  end if;
  -- Plans are checked again at the moment it would start. If neither has a
  -- video plan any more, the request lapses and the Gist stays voice.
  if not _gist_video_allowed(s) then
    update gist_sessions set video_state = 'off', video_off_reason = null where id = p_session_id;
    return 'unavailable';
  end if;
  update gist_sessions set video_state = 'on', video_on_at = now(), video_off_reason = null where id = p_session_id;
  return 'on';
end;
$$;

-- Either person turns video off, or the app falls back on a weak connection
-- or a camera that won't start: it ends for both, and the Gist carries on as
-- voice. A request can be made again later — only a decline blocks that.
create or replace function public.gist_video_off(p_session_id uuid, p_reason text)
returns text language plpgsql security definer set search_path = public as $$
declare
  s gist_sessions%rowtype := _gist_video_session(p_session_id);
begin
  if p_reason not in ('turned_off', 'weak_connection', 'camera_unavailable') then
    raise exception 'Unknown reason.' using errcode = '22023';
  end if;
  if s.video_state = 'on' then
    update gist_sessions set video_state = 'off', video_off_reason = p_reason where id = p_session_id;
  end if;
  return 'off';
end;
$$;

revoke all on function public.gist_video_request(uuid) from public, anon;
revoke all on function public.gist_video_cancel(uuid) from public, anon;
revoke all on function public.gist_video_answer(uuid, boolean) from public, anon;
revoke all on function public.gist_video_off(uuid, text) from public, anon;
grant execute on function public.gist_video_request(uuid) to authenticated;
grant execute on function public.gist_video_cancel(uuid) to authenticated;
grant execute on function public.gist_video_answer(uuid, boolean) to authenticated;
grant execute on function public.gist_video_off(uuid, text) to authenticated;

-- Toastly — a finished Gist no longer blocks a new invite.
--
-- When a Gist's 18 minutes run out, its status stays 'live' until someone
-- answers "continue?" (submitOutcome sets 'completed'). gist_invite (0020)
-- treated any 'live' Gist as open, so a pair whose call had ended — or, as
-- on 3 October 2026, whose call never connected — could not invite each
-- other again. Re-creates gist_invite with one change: a 'live' Gist past
-- its ends_at is over.

set search_path = public;

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
      -- A Gist whose time has run out is over, even before anyone answers
      -- "continue?" (status stays 'live' until then).
      and not (g.status = 'live' and g.ends_at is not null and g.ends_at < now())
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

revoke all on function public.gist_invite(uuid) from public, anon;
grant execute on function public.gist_invite(uuid) to authenticated;

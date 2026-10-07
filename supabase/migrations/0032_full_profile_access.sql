-- Toastly — who can open whose full profile (PRD §5.2.4, decided 7 October 2026).
--
-- Until now any live member could read any other live member's profile row
-- (0029, "live members see other live profiles"). The full profile is
-- narrower and two-way. A member can open the profile of:
--
--   1. anyone in their current six;
--   2. anyone who has reached out to them: replied to one of their prompt
--      answers, or invited them to a Gist;
--   3. their matches and Gist partners, both ways, for as long as the match
--      exists (a block ends it).
--
-- No browse or search of arbitrary profiles. No "who viewed you": opening a
-- profile is a read and writes nothing, anywhere. Nothing in this file may
-- record a view, and no function below is volatile.
--
-- The locked Starter inbox (CLAUDE.md, 0004) still holds. A text reply is a
-- message a Starter member can't read, so it never opens its sender's profile
-- for them; otherwise "can I open X?" would tell a Starter member who wrote
-- to them. A Gist invitation is different: on every plan, including Starter,
-- the invited member can open the inviter's profile before accepting.
-- Nobody is asked to talk to someone they can't see.
--
-- The same rule governs everything a full profile carries: the profile row,
-- the prompt answers and the photos (photos still follow the owner's reveal
-- choice on top of it). Field-by-field visibility (relationship history,
-- genotype, faith) is unchanged and applies within an opened profile.

-- ---------------------------------------------------------------------------
-- 1. The rule
-- ---------------------------------------------------------------------------

-- Internal: two arbitrary ids would let a client ask about OTHER pairs.
create or replace function public.profile_open_to(p_viewer uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_viewer is null or p_owner is null then false
    when p_viewer = p_owner then true
    -- No live profile, no access (PRD §5.1.2), on both sides.
    when not profile_is_live(p_viewer) or not profile_is_live(p_owner) then false
    -- A block, either way, ends everything.
    when exists (
      select 1 from blocks b
      where (b.blocker_id = p_viewer and b.blocked_id = p_owner)
         or (b.blocker_id = p_owner and b.blocked_id = p_viewer)
    ) then false
    -- An active couple: paused to everyone else, never to each other.
    when exists (
      select 1 from couples c
      where c.status = 'active'
        and ((c.member_a = p_viewer and c.member_b = p_owner)
          or (c.member_a = p_owner and c.member_b = p_viewer))
    ) then true
    when exists (select 1 from profiles o where o.id = p_owner and o.paused) then false
    else
      -- 1. In the viewer's six today.
      exists (
        select 1 from daily_feed f
        where f.profile_id = p_viewer and f.feed_date = current_date and f.candidate_id = p_owner
      )
      -- 2a. Replied to one of the viewer's prompt answers — counted only
      --     when the viewer may read that reply. A text reply to a Starter
      --     member is a locked message and must not name its sender.
      or exists (
        select 1 from replies r
        where r.sender_id = p_owner and r.recipient_id = p_viewer
          and (r.kind = 'gist_invite' or can_read_inbox(p_viewer))
      )
      -- 2b. Invited the viewer to a Gist, whatever happened next. Every plan.
      or exists (
        select 1 from gist_sessions g
        where g.proposer_id = p_owner and g.invitee_id = p_viewer
      )
      -- 3. Gist partners and matches, both ways: an invite still open, an
      --    accepted or live Gist, or one that happened.
      or exists (
        select 1 from gist_sessions g
        where ((g.proposer_id = p_owner and g.invitee_id = p_viewer)
            or (g.proposer_id = p_viewer and g.invitee_id = p_owner))
          and (g.status in ('accepted', 'live', 'completed')
               or (g.status = 'proposed' and g.created_at >= now() - interval '3 days'))
      )
  end;
$$;
revoke all on function public.profile_open_to(uuid, uuid) from public, anon, authenticated;

-- Member-facing: only ever about the caller.
create or replace function public.can_open_profile(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select profile_open_to(auth.uid(), p_owner) $$;
revoke all on function public.can_open_profile(uuid) from public, anon;
grant execute on function public.can_open_profile(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. What a full profile carries follows the rule
-- ---------------------------------------------------------------------------

-- "own profile readable" (0001) still covers a member's own row.
drop policy if exists "verified members see other verified profiles" on public.profiles;
drop policy if exists "live members see other live profiles" on public.profiles;
drop policy if exists "members open profiles they are connected to" on public.profiles;
create policy "members open profiles they are connected to" on public.profiles for select
  using (public.can_open_profile(id));

-- "own answers writable" (0002) still covers a member's own answers.
drop policy if exists "answers of today's candidates readable" on public.prompt_answers;
drop policy if exists "answers of profiles a member can open" on public.prompt_answers;
create policy "answers of profiles a member can open" on public.prompt_answers for select
  using (public.can_open_profile(profile_id));

drop policy if exists "photos visible per the owner's reveal choice" on public.profile_photos;
create policy "photos visible per the owner's reveal choice" on public.profile_photos for select
  using (
    auth.uid() = profile_id
    or (public.can_open_profile(profile_id)
        and public.can_see_photos(auth.uid(), profile_id)
        and not public.is_hidden_candidate(id)));

create or replace function public.can_see_photo_file(p_viewer uuid, p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when try_uuid((storage.foldername(p_path))[1]) = p_viewer then true
    else profile_open_to(p_viewer, try_uuid((storage.foldername(p_path))[1]))
         and can_see_photos(p_viewer, try_uuid((storage.foldername(p_path))[1]))
         and exists (select 1 from profile_photos ph where ph.storage_path = p_path and not is_hidden_candidate(ph.id))
  end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The locked inbox: a Starter member can't list threads either
-- ---------------------------------------------------------------------------
--
-- A thread row names both members. A Starter member can't read a single
-- message, so the thread list could only ever tell them who wrote. Their
-- inbox is the bare count from unread_count(), which needs no thread rows.
drop policy if exists "participants see their threads" on public.threads;
create policy "participants see their threads" on public.threads for select
  using ((auth.uid() = member_a or auth.uid() = member_b)
         and public.profile_is_live(auth.uid()) and public.can_read_inbox(auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. What the screen reads, through the same rule
-- ---------------------------------------------------------------------------

-- "Matched", as the viewer is allowed to know it. are_matched (0013) counts
-- mutual replies of any kind, so a Starter member who invited someone and
-- got a text reply back would learn, from an "on match" field appearing,
-- that the other person wrote to them. Here the other person's reply counts
-- only if the viewer can read it.
create or replace function public.viewer_matched(p_viewer uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_viewer is not null and p_owner is not null and p_viewer <> p_owner
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = p_viewer and b.blocked_id = p_owner)
         or (b.blocker_id = p_owner and b.blocked_id = p_viewer)
    )
    and (
      exists (
        select 1 from gist_sessions g
        where g.status in ('accepted', 'live', 'completed')
          and ((g.proposer_id = p_viewer and g.invitee_id = p_owner)
            or (g.proposer_id = p_owner and g.invitee_id = p_viewer))
      )
      or exists (
        select 1 from couples c
        where c.status = 'active'
          and ((c.member_a = p_viewer and c.member_b = p_owner)
            or (c.member_a = p_owner and c.member_b = p_viewer))
      )
      or (
        exists (select 1 from replies r where r.sender_id = p_viewer and r.recipient_id = p_owner)
        and exists (
          select 1 from replies r
          where r.sender_id = p_owner and r.recipient_id = p_viewer
            and (r.kind = 'gist_invite' or can_read_inbox(p_viewer))
        )
      )
    );
$$;
revoke all on function public.viewer_matched(uuid, uuid) from public, anon, authenticated;

create or replace function public.i_am_matched_with(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select profile_open_to(auth.uid(), p_owner) and viewer_matched(auth.uid(), p_owner) $$;
revoke all on function public.i_am_matched_with(uuid) from public, anon;
grant execute on function public.i_am_matched_with(uuid) to authenticated, service_role;

-- Age, never the date of birth (that stays owner-only, 0015), and only on a
-- profile the caller can open.
create or replace function public.age_for(p_owner uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$ select case when profile_open_to(auth.uid(), p_owner) then _member_age(p_owner) end $$;
revoke all on function public.age_for(uuid) from public, anon;
grant execute on function public.age_for(uuid) to authenticated, service_role;

-- Relationship history (0013) follows the access rule too, and "on match"
-- uses the match the viewer is allowed to know about.
create or replace function public.history_visible_to_me(
  p_owner uuid,
  p_visibility field_visibility
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null or p_owner is null then false
    when auth.uid() = p_owner then true
    when not profile_open_to(auth.uid(), p_owner) then false
    when p_visibility = 'public' then true
    when p_visibility = 'on_match' then viewer_matched(auth.uid(), p_owner)
    else false
  end;
$$;

-- Toastly — another member's profile, field by field, for this viewer only
-- (PRD §5.2.4; decided 7 October 2026). Follows 0032.
--
-- Until now a member who could open a profile (0032) read the whole row and
-- the app hid what the owner hadn't chosen to show. Hiding in the app is not
-- privacy: the row went to the browser's session, hidden tribe, religion and
-- profession included. Now:
--
--   - another member's profile is read ONLY through profile_for(), a
--     security-definer function that returns just the fields the owner shows
--     to this viewer — a field that isn't shown isn't in the result at all;
--   - no policy lets a member select another member's row in profiles,
--     profile_history or profile_photos. Each member still reads and writes
--     their own rows normally.
--
-- And the genotype "all matches" setting now uses the viewer's match
-- (viewer_matched, 0032), the same as relationship history: a Starter
-- member's Gist invite plus a text reply they can't read is not a match they
-- can see, so it can never reveal that reply.
--
-- This file is on the genotype display path (scripts/check-constraints.mjs):
-- the word appears only in can_see_genotype and profile_for, which hands a
-- permitted viewer the value get_genotype_for() already allows, to display.

-- ---------------------------------------------------------------------------
-- 1. Genotype "all matches": the viewer's match
-- ---------------------------------------------------------------------------

create or replace function public.can_see_genotype(p_viewer uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_viewer is null or p_owner is null then false
    when p_viewer = p_owner then true
    when exists (
      select 1 from blocks b
      where (b.blocker_id = p_owner and b.blocked_id = p_viewer)
         or (b.blocker_id = p_viewer and b.blocked_id = p_owner)
    ) then false
    when not exists (
      select 1 from profiles v
      where v.id = p_viewer and v.stage in ('verified_real', 'id_confirmed')
    ) then false
    else coalesce((
      select case g.visibility
        when 'private' then false
        when 'couple_only' then exists (
          select 1 from couples c
          where c.status = 'active'
            and ((c.member_a = p_owner and c.member_b = p_viewer)
              or (c.member_a = p_viewer and c.member_b = p_owner))
        )
        when 'after_gist' then exists (
          select 1 from gist_sessions s
          where s.status = 'completed'
            and ((s.proposer_id = p_owner and s.invitee_id = p_viewer)
              or (s.proposer_id = p_viewer and s.invitee_id = p_owner))
            and gist_mutual_continue(s.id)
        ) or exists (
          select 1 from couples c
          where c.status = 'active'
            and ((c.member_a = p_owner and c.member_b = p_viewer)
              or (c.member_a = p_viewer and c.member_b = p_owner))
        )
        -- The match as the viewer may know it (0032), never are_matched.
        when 'all_matches' then viewer_matched(p_viewer, p_owner)
        else false
      end
      from genotypes g
      where g.profile_id = p_owner
    ), false)
  end;
$$;
revoke all on function public.can_see_genotype(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The one read of another member's profile
-- ---------------------------------------------------------------------------

-- A field the owner shows to this viewer: 'public', or 'on_match' once they
-- are matched as the viewer may know it.
create or replace function public.field_shown_to(p_viewer uuid, p_owner uuid, p_visibility field_visibility)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_visibility = 'public' or (p_visibility = 'on_match' and viewer_matched(p_viewer, p_owner));
$$;
revoke all on function public.field_shown_to(uuid, uuid, field_visibility) from public, anon, authenticated;

-- NULL unless the caller can open the profile (0032). Otherwise only what the
-- owner shows this viewer; anything not shown is absent from the result —
-- no key, no placeholder, nothing to tell hidden from empty.
create or replace function public.profile_for(p_owner uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  p profiles%rowtype;
  v_matched boolean;
begin
  if v_me is null or p_owner is null or p_owner = v_me or not profile_open_to(v_me, p_owner) then
    return null;
  end if;
  select * into p from profiles where id = p_owner;
  if not found then
    return null;
  end if;
  v_matched := viewer_matched(v_me, p_owner);

  return jsonb_strip_nulls(jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'city', p.city,
    'stage', p.stage,
    'intent', p.intent,
    'age', _member_age(p.id),
    'matched', v_matched,
    'languages', case when cardinality(p.languages) > 0 and field_shown_to(v_me, p.id, p.languages_visibility)
                      then to_jsonb(p.languages) end,
    'tribe', case when field_shown_to(v_me, p.id, p.tribe_visibility) then nullif(btrim(p.tribe), '') end,
    'profession', case when field_shown_to(v_me, p.id, p.profession_visibility) then nullif(btrim(p.profession), '') end,
    'profession_verified', case when field_shown_to(v_me, p.id, p.profession_visibility)
                                     and nullif(btrim(p.profession), '') is not null
                                     and p.profession_verified_at is not null then true end,
    'education', case when field_shown_to(v_me, p.id, p.education_visibility) then nullif(btrim(p.education), '') end,
    -- Faith: one setting covers both; only 'public' is shown (0030).
    'religion', case when p.religion_visibility = 'public' then p.religion end,
    'religion_other', case when p.religion_visibility = 'public' then p.religion_other end,
    'denomination', case when p.religion_visibility = 'public' then p.denomination end,
    'denomination_other', case when p.religion_visibility = 'public' then p.denomination_other end,
    'history', (select h.history from profile_history h
                 where h.profile_id = p.id and field_shown_to(v_me, p.id, h.visibility)),
    -- Reciprocal and per the owner's choice (0014, and §1 above).
    'genotype', get_genotype_for(p.id),
    -- For scheduling a Gist in both time zones: only between two people
    -- with a Gist between them.
    'time_zone', case when exists (
                   select 1 from gist_sessions g
                   where (g.proposer_id = v_me and g.invitee_id = p.id)
                      or (g.proposer_id = p.id and g.invitee_id = v_me)) then p.time_zone end,
    -- Photos per the owner's reveal choice (0007): the main photo first,
    -- never a candidate still being checked. The paths are what storage's
    -- own policy (can_see_photo_file) then lets this viewer sign.
    'photos', case when can_see_photos(v_me, p.id) then (
                select jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.storage_path)
                                 order by (ph.id = p.main_photo_id) desc, ph.position)
                  from profile_photos ph
                 where ph.profile_id = p.id and not is_hidden_candidate(ph.id)) end
  ));
end;
$$;
revoke all on function public.profile_for(uuid) from public, anon;
grant execute on function public.profile_for(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. No direct read of another member's rows
-- ---------------------------------------------------------------------------

-- profiles: "own profile readable" (0001) stays; nothing else.
drop policy if exists "members open profiles they are connected to" on public.profiles;
drop policy if exists "live members see other live profiles" on public.profiles;
drop policy if exists "verified members see other verified profiles" on public.profiles;

-- profile_history: "own history writable" (0013, for all) stays.
drop policy if exists "history visible per its owner's choice" on public.profile_history;

-- profile_photos: own rows only. Another member's photos come from
-- profile_for(); the files from storage, by the reveal rules (0032).
drop policy if exists "photos visible per the owner's reveal choice" on public.profile_photos;
drop policy if exists "own photos readable" on public.profile_photos;
create policy "own photos readable" on public.profile_photos for select
  using (auth.uid() = profile_id);

-- Toastly — children: how many, and whether they want them (owner,
-- 10 October 2026; PRD §5.2, §5.2.4, §5.1.2).
--
--   1. Children: None / 1 / 2 / 3 or more / Prefer not to say. Optional.
--      Replaces the yes/no has_children (yes -> Prefer not to say, since a
--      yes doesn't say how many; no -> None). Same visibility as
--      relationship history — the one setting on profile_history, default
--      on_match — and served only through profile_for. NEVER filterable,
--      never read by matching or ranking. No names, ages or details: there
--      are no columns for them.
--   2. Do you want children?: Yes / No / Open to it / Not sure yet.
--      Optional. Its own setting, default public (shown on the full
--      profile); hideable. Never on the feed card.
--   3. A self-applied filter on it (paid plans only), by 0031's rules: only
--      shown values count, "Include people who don't say" on by default,
--      never widens.
--   4. Report reason "Photo shows a child", to the review queue. Nothing is
--      removed automatically.
--
-- Members still can't read each other's profile_history rows (0033): every
-- other-member read is profile_for.

-- ---------------------------------------------------------------------------
-- 1 and 2. The fields
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'children_count') then
    create type children_count as enum ('none', 'one', 'two', 'three_plus', 'prefer_not_to_say');
  end if;
  if not exists (select 1 from pg_type where typname = 'wants_children_answer') then
    create type wants_children_answer as enum ('yes', 'no', 'open', 'not_sure');
  end if;
end $$;

alter table public.profile_history
  add column if not exists children children_count,
  add column if not exists wants_children wants_children_answer,
  add column if not exists wants_children_visibility field_visibility not null default 'public';

-- has_children -> children. A yes doesn't say how many, so it becomes
-- "Prefer not to say"; a no becomes "None"; unanswered stays unanswered.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'profile_history' and column_name = 'has_children') then
    update public.profile_history
       set children = case when has_children then 'prefer_not_to_say'::children_count else 'none'::children_count end
     where has_children is not null and children is null;
    alter table public.profile_history drop column has_children;
  end if;
end $$;

comment on table public.profile_history is
  'Relationship history and number of children (visible per `visibility`, default on_match), and whether they want children (visible per `wants_children_visibility`, default public). Owner-only rows; other members see only what profile_for returns.';

-- ---------------------------------------------------------------------------
-- 3. The filter
-- ---------------------------------------------------------------------------

alter table public.member_filters
  add column if not exists wants_children text[] not null default '{}'
    check (wants_children <@ array['yes', 'no', 'open', 'not_sure']::text[]),
  add column if not exists wants_children_include_unsaid boolean not null default true;

-- 0031's rule, plus "Do you want children?". Only a value its owner shows
-- to everyone ('public') counts; hidden or unanswered is "doesn't say".
-- The NUMBER of children is never read here, or anywhere in matching.
create or replace function public.passes_own_filters(p_viewer uuid, p_candidate uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when not has_advanced_filters(p_viewer) then true
    else coalesce((
      select
        (cardinality(f.religions) = 0
         or case
              when c.religion_visibility = 'public'
                   and c.religion in ('Christian', 'Muslim', 'Traditional', 'Spiritual but not religious', 'Not religious', 'Other')
                then c.religion = any (f.religions)
              else f.religion_include_unsaid
            end)
        and
        (cardinality(f.tribes) = 0
         or case
              when c.tribe_visibility = 'public' and nullif(btrim(c.tribe), '') is not null
                then lower(btrim(c.tribe)) = any (select lower(btrim(t)) from unnest(f.tribes) t)
              else f.tribe_include_unsaid
            end)
        and
        (cardinality(f.wants_children) = 0
         or case
              when h.wants_children_visibility = 'public' and h.wants_children is not null
                then h.wants_children::text = any (f.wants_children)
              else f.wants_children_include_unsaid
            end)
      from member_filters f
      join profiles c on c.id = p_candidate
      left join profile_history h on h.profile_id = p_candidate
      where f.profile_id = p_viewer
    ), true)
  end;
$$;
revoke all on function public.passes_own_filters(uuid, uuid) from public, anon, authenticated;

create or replace function public.my_filters_active()
returns boolean language sql stable security definer set search_path = public as $$
  select i_have_advanced_filters()
     and exists (select 1 from member_filters f
                  where f.profile_id = auth.uid()
                    and (cardinality(f.religions) > 0 or cardinality(f.tribes) > 0 or cardinality(f.wants_children) > 0));
$$;
revoke all on function public.my_filters_active() from public, anon;
grant execute on function public.my_filters_active() to authenticated;

-- ---------------------------------------------------------------------------
-- profile_for: 0033's definition, plus the two fields
-- ---------------------------------------------------------------------------

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
    -- 0044: the number of children, under relationship history's setting
    -- (default on_match). "Prefer not to say" is shown as nothing at all.
    'children', (select h.children from profile_history h
                  where h.profile_id = p.id and h.children <> 'prefer_not_to_say'
                    and field_shown_to(v_me, p.id, h.visibility)),
    -- 0044: whether they want children, under its own setting (default public).
    'wants_children', (select h.wants_children from profile_history h
                        where h.profile_id = p.id and field_shown_to(v_me, p.id, h.wants_children_visibility)),
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

-- ---------------------------------------------------------------------------
-- 4. "Photo shows a child"
-- ---------------------------------------------------------------------------

alter type report_reason add value if not exists 'photo_of_child';

-- The reviewer's label for each reason: 0041's, plus the new one.
create or replace function public._report_label(p report_reason)
returns text language sql immutable as $$
  select case p::text
    when 'user_is_married' then 'Married'
    when 'scam_or_fraud' then 'Scam or fraud'
    when 'asked_for_money' then 'Asking for money'
    when 'fake_profile' then 'Fake profile'
    when 'harassment' then 'Harassment'
    when 'threats_or_coercion' then 'Threats or coercion'
    when 'underage' then 'Under 18'
    when 'photos_not_them' then 'Photos aren''t them'
    when 'recorded_or_shared' then 'Recorded or shared them'
    when 'photo_of_child' then 'Photo shows a child'
    else 'Other' end;
$$;

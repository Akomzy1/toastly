-- Toastly — self-applied filters (PRD §5.2.4; decided 6 October 2026).
--
-- Advanced filters are sold on the pricing page, so they exist at launch:
--   * Plans: Premium, Premium Plus, Diaspora, Diaspora Plus. Not Starter.
--   * At launch: religion and tribe, multi-select each.
--   * A filter narrows ONLY the filtering member's own six. Nobody can see
--     another member's filters, and a filter never changes who sees its
--     owner.
--   * Only values the other member has chosen to show count: a hidden or
--     empty value is never read. Each filter has "Include people who don't
--     say", on by default.
--   * Too few people: never widen. The six may be fewer; the feed says so.
--   * Never filterable: denomination, genotype, hidden relationship history,
--     anything not in the §7.1 list.
--   * Stored per member, deleted with the account.

-- ---------------------------------------------------------------------------
-- 1. Who has filters
-- ---------------------------------------------------------------------------

create or replace function public.has_advanced_filters(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select current_tier(p_profile_id) in ('premium', 'premium_plus', 'diaspora', 'diaspora_plus');
$$;
-- Internal: nobody learns another member's plan from it.
revoke all on function public.has_advanced_filters(uuid) from public, anon, authenticated;

-- The caller's own answer, for the policies below and the filters screen.
create or replace function public.i_have_advanced_filters()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and has_advanced_filters(auth.uid());
$$;
revoke all on function public.i_have_advanced_filters() from public, anon;
grant execute on function public.i_have_advanced_filters() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The member's own filters
-- ---------------------------------------------------------------------------

create table if not exists public.member_filters (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  religions text[] not null default '{}'
    check (religions <@ array['Christian', 'Muslim', 'Traditional', 'Spiritual but not religious', 'Not religious', 'Other']::text[]),
  religion_include_unsaid boolean not null default true,
  tribes text[] not null default '{}'
    check (cardinality(tribes) <= 40),
  tribe_include_unsaid boolean not null default true,
  updated_at timestamptz not null default now()
);
-- Tribe values: 1–40 characters each (the app offers a fixed list).
create or replace function public.tribes_are_valid(p text[])
returns boolean language sql immutable as $$
  select coalesce(bool_and(char_length(btrim(t)) between 1 and 40), true) from unnest(p) t;
$$;
alter table public.member_filters drop constraint if exists member_filters_tribes_valid;
alter table public.member_filters add constraint member_filters_tribes_valid check (public.tribes_are_valid(tribes));

alter table public.member_filters enable row level security;
revoke all on public.member_filters from anon;
-- Owner only. Nobody — no other member — can read anyone else's filters.
drop policy if exists "own filters readable" on public.member_filters;
create policy "own filters readable" on public.member_filters for select using (auth.uid() = profile_id);
-- Setting filters needs a plan with advanced filters. Never Starter.
drop policy if exists "own filters writable on a filter plan" on public.member_filters;
create policy "own filters writable on a filter plan" on public.member_filters for insert
  with check (auth.uid() = profile_id and public.i_have_advanced_filters());
drop policy if exists "own filters updatable on a filter plan" on public.member_filters;
create policy "own filters updatable on a filter plan" on public.member_filters for update
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id and public.i_have_advanced_filters());
drop policy if exists "own filters removable" on public.member_filters;
create policy "own filters removable" on public.member_filters for delete using (auth.uid() = profile_id);

-- ---------------------------------------------------------------------------
-- 3. The rule — one place
-- ---------------------------------------------------------------------------
--
-- Does p_candidate pass p_viewer's OWN filters? Reads only the viewer's
-- filters, and only the candidate's SHOWN values: visibility is checked
-- before a value is looked at, so a hidden or empty value never decides
-- anything — it counts as "doesn't say". A religion stored before the
-- option list (free text) and "Prefer not to say" also count as "doesn't
-- say". Without a plan with advanced filters, nothing is filtered.

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
      from member_filters f
      join profiles c on c.id = p_candidate
      where f.profile_id = p_viewer
    ), true)
  end;
$$;
revoke all on function public.passes_own_filters(uuid, uuid) from public, anon, authenticated;

-- The member's own filters are set, and their plan applies them — for the
-- feed's "Only {n} people match your filters today" line.
create or replace function public.my_filters_active()
returns boolean language sql stable security definer set search_path = public as $$
  select i_have_advanced_filters()
     and exists (select 1 from member_filters f
                  where f.profile_id = auth.uid()
                    and (cardinality(f.religions) > 0 or cardinality(f.tribes) > 0));
$$;
revoke all on function public.my_filters_active() from public, anon;
grant execute on function public.my_filters_active() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The six — the member's own filter applied to the member's own six
-- ---------------------------------------------------------------------------
--
-- build_daily_feed: 0029's definition, with two changes —
--   * the member's own filters (passes_own_filters), on their own six only;
--   * a six built earlier today with fewer than six people is topped up, so
--     widening filters shows more today. Never more than six a day: the
--     top-up only fills the remaining places, from people not yet shown.

create or replace function public.build_daily_feed(p_profile_id uuid)
returns setof public.daily_feed
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := current_date;
  v_tier tier;
  v_pool match_pool;
  v_country text;
  v_open boolean;
  v_city_open boolean;
  v_age_min integer;
  v_age_max integer;
  v_have integer;
begin
  -- No live profile, no access (PRD §5.1.2): the six are only for live members.
  perform assert_live(auth.uid());
  -- A member builds and reads only their own six. Security definer, so
  -- without this anyone could read anyone's feed by passing their id.
  if p_profile_id is distinct from auth.uid() then
    raise exception 'A member can only build their own feed.' using errcode = '42501';
  end if;

  select count(*) into v_have from daily_feed where profile_id = p_profile_id and feed_date = v_today;
  if v_have >= daily_match_count() then
    return query select * from daily_feed where profile_id = p_profile_id and feed_date = v_today order by position;
    return;
  end if;

  if is_restricted(p_profile_id) then
    return query select * from daily_feed where profile_id = p_profile_id and feed_date = v_today order by position;
    return;
  end if;

  select pool, country_code, open_to_abroad
    into v_pool, v_country, v_open
    from profiles where id = p_profile_id;
  select lo, hi into v_age_min, v_age_max from _age_range(p_profile_id);
  v_tier := current_tier(p_profile_id);
  v_city_open := diaspora_pool_open(p_profile_id);

  -- Diaspora-to-diaspora is a Diaspora-plan feature. Everyone else draws
  -- from the Nigeria pool, and the pool screen and feed say so.
  if v_tier not in ('diaspora', 'diaspora_plus') then
    v_pool := 'back_home';
    v_city_open := false;
  end if;

  insert into daily_feed (profile_id, feed_date, position, candidate_id)
  select p_profile_id, v_today, v_have + row_number() over (), c.id
  from (
    select p.id,
           (
             case when v_tier in ('premium', 'premium_plus', 'diaspora', 'diaspora_plus')
                  then 1.0 else 0.0 end
             + case when p.intent is not distinct from (select intent from profiles where id = p_profile_id)
                    then 0.5 else 0.0 end
             + case when p.city is not distinct from (select city from profiles where id = p_profile_id)
                    then 0.4 else 0.0 end
             + (select count(*) * 0.1 from prompt_answers pa where pa.profile_id = p.id)
             + random() * 0.3
           ) as score
    from profiles p
    where p.id <> p_profile_id
      and p.stage in ('verified_real', 'id_confirmed')
      and p.paused = false
      and not exists (select 1 from account_restrictions r where r.profile_id = p.id and r.lifted_at is null)
      and not exists (select 1 from reverification_requests v where v.profile_id = p.id)
      and (
        -- The Nigeria pool. "Open to people living abroad" works both ways:
        -- a member in Nigeria who switched it off doesn't see members
        -- abroad, and members abroad don't see them.
        (
          (v_pool in ('back_home', 'both') or not v_city_open)
          and (
            (p.country_code = 'NG' and (v_country = 'NG' or p.open_to_abroad))
            or (v_country = 'NG' and v_open and p.country_code <> 'NG' and p.pool in ('back_home', 'both'))
          )
        )
        -- Diaspora-to-diaspora: both abroad, both chose it, both on a
        -- Diaspora plan, both cities open.
        or (
          v_pool in ('diaspora', 'both')
          and v_city_open
          and p.country_code <> 'NG'
          and p.pool in ('diaspora', 'both')
          and current_tier(p.id) in ('diaspora', 'diaspora_plus')
          and exists (select 1 from diaspora_cities dc where dc.slug = p.diaspora_city and dc.active)
        )
      )
      -- The member's own age range, on their own six. Free on every plan.
      -- Someone whose age isn't on record is never filtered out.
      and (_member_age(p.id) is null
           or (_member_age(p.id) >= v_age_min and (v_age_max is null or _member_age(p.id) <= v_age_max)))
      -- The member's OWN filters, on their OWN six (PRD §5.2.4): only the
      -- viewer's filters are read, only shown values count, and nothing is
      -- filtered without a plan with advanced filters. Never widened.
      and passes_own_filters(p_profile_id, p.id)
      and not exists (select 1 from seen_candidates s where s.profile_id = p_profile_id and s.candidate_id = p.id)
      and not exists (select 1 from blocks b where (b.blocker_id = p_profile_id and b.blocked_id = p.id)
                                                or (b.blocker_id = p.id and b.blocked_id = p_profile_id))
      --
      -- NOTHING BELOW THIS LINE. Do not add religion, tribe, language,
      -- relationship history, has_children, profession or education to this
      -- WHERE clause. They are display-only and must never silently exclude
      -- anyone from anyone's feed (CLAUDE.md). The member's own opt-in
      -- filters live in passes_own_filters above, applied to their own six.
      -- Diaspora status is never a score input (PRD §5.6).
      --
    order by score desc
    limit daily_match_count() - v_have
  ) c;

  insert into seen_candidates (profile_id, candidate_id)
  select p_profile_id, candidate_id from daily_feed
  where profile_id = p_profile_id and feed_date = v_today
  on conflict do nothing;

  return query select * from daily_feed where profile_id = p_profile_id and feed_date = v_today order by position;
end;
$$;

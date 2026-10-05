-- 0020 — the diaspora women's offer, "Open to people living abroad", and the
-- AriyaPlanner brief rule.
--
-- Ships with 0013–0018 (it redefines 0013's build_daily_feed), not with the
-- held 0019.
--
-- 1. Women abroad get 30 days of Diaspora Plus instead of Premium Plus — the
--    same full upper tier (live-video Gist, incognito), priced for where
--    they live. The grant follows the member's country for as long as it
--    runs, so a later move changes the tier, never the end date.
--
-- 2. "Open to people living abroad" — on by default, for members in Nigeria.
--    Until now the back-home pool only ever held members in Nigeria, so
--    Nigerians abroad who chose "back home" could see Nigeria but Nigeria
--    never saw them. With the switch on (the default), a member in Nigeria
--    is also shown members abroad who want to match back home. It is the
--    member's OWN filter on their OWN six: turning it off never hides them
--    from anyone.
--
-- 3. The AriyaPlanner brief is drafted only from what the couple enters, or
--    chooses to copy across, at the handoff (PRD §5.7, CLAUDE.md). Nothing in
--    the database reads a profile to fill it; check-constraints enforces that
--    no function or app code ever does. Genotype is refused at the schema.

-- ---------------------------------------------------------------------------
-- 1. The women's offer follows where the member lives
-- ---------------------------------------------------------------------------

create or replace function public.womens_offer_tier(p_country text)
returns tier
language sql
immutable
as $$
  select case when p_country = 'NG' then 'premium_plus'::tier else 'diaspora_plus'::tier end;
$$;

-- At grant time: whatever tier the grant names, a women's-offer grant is
-- the upper tier for the member's country.
create or replace function public.womens_offer_tier_on_grant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source = 'womens_launch_offer' then
    new.tier := womens_offer_tier(
      (select country_code from profiles where id = new.profile_id));
  end if;
  return new;
end;
$$;

create trigger entitlements_womens_offer_tier
  before insert on public.entitlements
  for each row execute function public.womens_offer_tier_on_grant();

-- After a move: a running offer switches tier. The end date never moves,
-- and an offer that has ended stays as it was.
create or replace function public.womens_offer_follows_country()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update entitlements
     set tier = womens_offer_tier(new.country_code)
   where profile_id = new.id
     and source = 'womens_launch_offer'
     and (ends_at is null or ends_at > now())
     and tier is distinct from womens_offer_tier(new.country_code);
  return new;
end;
$$;

create trigger profiles_womens_offer_follows_country
  after update of country_code on public.profiles
  for each row
  when (old.country_code is distinct from new.country_code)
  execute function public.womens_offer_follows_country();

-- ---------------------------------------------------------------------------
-- 2. "Open to people living abroad"
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column open_to_abroad boolean not null default true;

comment on column public.profiles.open_to_abroad is
  'Members in Nigeria: include members abroad who want to match back home in my own six. '
  'The member''s own filter only — never used to hide them from anyone.';

-- A member abroad wants back-home matches when their pool says so, when
-- their plan doesn't include diaspora matching (back home is open on every
-- plan), or when their city isn't open yet (the fallback).
create or replace function public.wants_back_home(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.country_code <> 'NG'
       and (current_tier(p.id) not in ('diaspora', 'diaspora_plus')
            or p.pool in ('back_home', 'both')
            or not diaspora_pool_open(p.id))
    from profiles p where p.id = p_profile_id), false);
$$;

-- The fallback notice explains a city that isn't open yet. A member abroad
-- without a Diaspora plan isn't waiting on their city — they're on back
-- home because of the plan — so the notice must not claim otherwise; the
-- feed tells them about the plan instead.
create or replace function public.pool_fallback_city(p_profile_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select dc.label
  from profiles p
  join diaspora_cities dc on dc.slug = p.diaspora_city
  where p.id = p_profile_id
    and p.pool in ('diaspora', 'both')
    and dc.active = false
    and current_tier(p.id) in ('diaspora', 'diaspora_plus');
$$;

-- 0013's feed, with members abroad who want back home added to the back-home
-- pool of a member in Nigeria who is open to them. Everything else is 0013.
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
  v_open_to_abroad boolean;
  v_city_open boolean;
begin
  if p_profile_id is distinct from auth.uid() then
    raise exception 'A member can only build their own feed.' using errcode = '42501';
  end if;
  perform assert_live(p_profile_id);

  if exists (select 1 from daily_feed where profile_id = p_profile_id and feed_date = v_today) then
    return query
      select f.* from daily_feed f
      join profiles c on c.id = f.candidate_id
      where f.profile_id = p_profile_id and f.feed_date = v_today
        and c.paused = false and profile_is_live(f.candidate_id)
      order by f.position;
    return;
  end if;

  select pool, country_code, open_to_abroad
    into v_pool, v_country, v_open_to_abroad
    from profiles where id = p_profile_id;
  v_tier := current_tier(p_profile_id);
  v_city_open := diaspora_pool_open(p_profile_id);

  if v_tier not in ('diaspora', 'diaspora_plus') then
    v_pool := 'back_home';
    v_city_open := false;
  end if;

  insert into daily_feed (profile_id, feed_date, position, candidate_id)
  select p_profile_id, v_today, row_number() over (), c.id
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
      -- Live only, and not paused. A profile that isn't live appears in
      -- nobody's feed.
      and profile_is_live(p.id)
      and p.paused = false
      and (
        (
          (v_pool in ('back_home', 'both') or not v_city_open)
          and (
            p.country_code = 'NG'
            -- Back home, seen from Nigeria: members abroad who want to match
            -- back home, unless this member has switched them off for
            -- their own six.
            or (v_country = 'NG' and v_open_to_abroad and wants_back_home(p.id))
          )
        )
        or (
          v_pool in ('diaspora', 'both')
          and v_city_open
          and exists (
            select 1 from diaspora_cities dc
            where dc.slug = p.diaspora_city and dc.active
          )
        )
      )
      and not exists (select 1 from seen_candidates s where s.profile_id = p_profile_id and s.candidate_id = p.id)
      and not exists (select 1 from blocks b where (b.blocker_id = p_profile_id and b.blocked_id = p.id)
                                                or (b.blocker_id = p.id and b.blocked_id = p_profile_id))
      --
      -- NOTHING BELOW THIS LINE. Do not add religion, tribe, language,
      -- relationship history, has_children, profession or education to this
      -- WHERE clause. They are display-only and must never silently exclude
      -- anyone from anyone's feed (CLAUDE.md). Opt-in filters belong on the
      -- member's own search, applied to their own results, not here.
      --
    order by score desc
    limit daily_match_count()
  ) c;

  insert into seen_candidates (profile_id, candidate_id)
  select p_profile_id, candidate_id from daily_feed
  where profile_id = p_profile_id and feed_date = v_today
  on conflict do nothing;

  return query select * from daily_feed where profile_id = p_profile_id and feed_date = v_today order by position;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The AriyaPlanner brief: the couple's own entries, nothing else
-- ---------------------------------------------------------------------------
--
-- 0006 said cultural context would be "copied from profiles at consent
-- time". That is withdrawn: tribe, religion, language and the like are
-- protected attributes no agent or integration may read (PRD §5.9). The
-- existing columns stay (CLAUDE.md: the data model can stay), but they hold
-- only what the couple types or explicitly copies across at the handoff.
--
-- The fields PRD §5.7 names for the brief:

alter table public.couple_briefs
  add column wedding_city text check (char_length(wedding_city) <= 120),
  add column rough_date text check (char_length(rough_date) <= 60),
  add column guest_count_band text check (char_length(guest_count_band) <= 40),
  add column budget_band text check (char_length(budget_band) <= 40),
  add column ceremony_formats text[] not null default '{}'
    check (ceremony_formats <@ array['introduction', 'traditional', 'white_wedding']::text[]);

-- Genotype never crosses into a brief (PRD §5.7): not as a column, and not
-- tucked into either free-form field.
alter table public.couple_briefs
  add constraint couple_briefs_no_genotype check (
    not (aesthetic ? 'genotype') and not (budget_cues ? 'genotype')
  );

comment on table public.couple_briefs is
  'AriyaPlanner handoff brief. Filled only from what the couple enters or chooses to copy at handoff; '
  'never read from profiles (PRD §5.7). Nothing sends it anywhere.';

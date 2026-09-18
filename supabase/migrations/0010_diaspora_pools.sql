-- Toastly — Prompt 10: diaspora matching pools, per-city activation.
--
-- 0001 and 0002 already modelled the choice (`match_pool`) and already
-- filtered the feed by it. Three things were missing, and they are the
-- difference between a setting and a working feature:
--
--   1. Diaspora-to-diaspora was open to everyone, everywhere, by country.
--      PRD §5.6 says it unlocks PER CITY, once that city has enough verified
--      users — "not switched on globally at launch". The old clause
--      (p.country_code = v_country) opened every city at once.
--   2. There was no structured city, so nothing could key a flag off.
--      `profiles.city` is free text and always will be.
--   3. A member whose city is closed would have silently received an empty
--      feed. They now fall back to the back-home pool, and the UI can say so
--      in plain words.
--
-- The 6/day count is untouched. Pools change WHO the six are drawn from,
-- never how many there are.

-- ---------------------------------------------------------------------------
-- Cities, and their flags
-- ---------------------------------------------------------------------------
--
-- Rows, not code, so a city opens without a deploy: flip `active` and the
-- next feed build picks it up.

create table public.diaspora_cities (
  slug text primary key,
  label text not null,
  country_code text not null,
  -- Off by default. A city opens only when it has the liquidity to be worth
  -- opening — a decision made from data, not at build time.
  active boolean not null default false,
  activated_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.diaspora_cities is
  'Per-city activation for diaspora-to-diaspora matching (PRD §5.6). Seeded inactive.';

-- US, UK and Canada metros with meaningful Nigerian populations. Extensible:
-- adding a city is an insert, not a migration.
insert into public.diaspora_cities (slug, label, country_code) values
  ('us-new-york',     'New York',        'US'),
  ('us-houston',      'Houston',         'US'),
  ('us-dallas',       'Dallas',          'US'),
  ('us-atlanta',      'Atlanta',         'US'),
  ('us-chicago',      'Chicago',         'US'),
  ('us-los-angeles',  'Los Angeles',     'US'),
  ('us-washington-dc','Washington, DC',  'US'),
  ('us-baltimore',    'Baltimore',       'US'),
  ('us-boston',       'Boston',          'US'),
  ('us-philadelphia', 'Philadelphia',    'US'),
  ('us-minneapolis',  'Minneapolis',     'US'),
  ('gb-london',       'London',          'GB'),
  ('gb-manchester',   'Manchester',      'GB'),
  ('gb-birmingham',   'Birmingham',      'GB'),
  ('gb-leeds',        'Leeds',           'GB'),
  ('gb-glasgow',      'Glasgow',         'GB'),
  ('ca-toronto',      'Toronto',         'CA'),
  ('ca-calgary',      'Calgary',         'CA'),
  ('ca-edmonton',     'Edmonton',        'CA'),
  ('ca-vancouver',    'Vancouver',       'CA'),
  ('ca-ottawa',       'Ottawa',          'CA'),
  ('ca-winnipeg',     'Winnipeg',        'CA');

-- The structured field the flag keys off. `profiles.city` stays free text for
-- display; this is the matching one.
alter table public.profiles
  add column if not exists diaspora_city text references public.diaspora_cities (slug);

-- A Nigeria-based member has no diaspora city, by definition.
alter table public.profiles
  add constraint diaspora_city_only_abroad
  check (country_code <> 'NG' or diaspora_city is null);

-- ---------------------------------------------------------------------------
-- Is this member's own city open?
-- ---------------------------------------------------------------------------

create or replace function public.diaspora_pool_open(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select dc.active
     from profiles p
     join diaspora_cities dc on dc.slug = p.diaspora_city
     where p.id = p_profile_id),
    false
  );
$$;

-- What the UI needs to explain a fallback honestly. Returns the city's label
-- when the member asked for diaspora matching and their city is not open
-- yet; NULL when there is nothing to explain.
--
-- PRD §5.6 and Prompt 10: never silently show an empty feed, and never
-- silently substitute a different pool without saying so.
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
    and dc.active = false;
$$;

-- ---------------------------------------------------------------------------
-- The feed, with per-city gating and an automatic back-home fallback
-- ---------------------------------------------------------------------------

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
  v_city_open boolean;
begin
  -- Already built for today? The six are fixed for the day.
  if exists (select 1 from daily_feed where profile_id = p_profile_id and feed_date = v_today) then
    return query select * from daily_feed where profile_id = p_profile_id and feed_date = v_today order by position;
    return;
  end if;

  select pool, country_code into v_pool, v_country from profiles where id = p_profile_id;
  v_tier := current_tier(p_profile_id);
  v_city_open := diaspora_pool_open(p_profile_id);

  insert into daily_feed (profile_id, feed_date, position, candidate_id)
  select p_profile_id, v_today, row_number() over (), c.id
  from (
    select p.id,
           -- Ordering only. A paid tier changes how well the six are matched
           -- to you; it never changes how many there are, and it never
           -- inserts anyone into another member's six.
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
      -- Verified only, and not paused. The trust layer, again.
      and p.stage in ('verified_real', 'id_confirmed')
      and p.paused = false
      -- Pool choice is the member's own setting about themselves.
      --
      -- Back home is always available; diaspora-to-diaspora requires BOTH
      -- members' cities to be open. A member who chose diaspora while their
      -- city is still closed lands in the first branch — the back-home pool —
      -- rather than an empty feed. pool_fallback_city() tells the UI to say so.
      and (
        (
          (v_pool in ('back_home', 'both') or not v_city_open)
          and p.country_code = 'NG'
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
-- Sentinel: pool switching
-- ---------------------------------------------------------------------------
--
-- Prompt 10 asks for this as a weak signal (rapid flipping). It is a
-- behavioural event like the rest — the city is a location, not a protected
-- attribute, and no key here trips the metadata guard in 0009.

alter type trust_event_kind add value if not exists 'pool_changed';

create or replace function public.trust_on_pool_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.pool is distinct from old.pool
     or new.diaspora_city is distinct from old.diaspora_city then
    perform emit_trust_event(
      new.id, null, 'pool_changed',
      jsonb_build_object(
        'from_pool', old.pool,
        'to_pool', new.pool,
        'city_changed', (new.diaspora_city is distinct from old.diaspora_city)
      )
    );
  end if;
  return new;
end;
$$;

create trigger trust_pool_change
  after update on public.profiles
  for each row execute function public.trust_on_pool_change();

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
--
-- The city list is readable by any signed-in member (they pick from it).
-- Flags are set by staff with the service role: no member may open a city.

alter table public.diaspora_cities enable row level security;

create policy "city list is readable" on public.diaspora_cities
  for select to authenticated using (true);

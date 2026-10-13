-- Toastly — today's six, rebuilt (PRD §5.2.5). Follows 0044.
--
-- What changes, and why it is one migration:
--   * Eligibility is MUTUAL. A man and a woman, and each inside the other's age
--     range. Until now only the viewer's own range applied (0027), so a member
--     could be shown to people whose range excluded them.
--   * Out of the six for good: anyone matched, in a Gist with, replied to,
--     reported, blocked or passed on. Out for a while: anyone shown in the last
--     SEEN_COOLDOWN_DAYS. (0002's permanent "seen" list is replaced.)
--   * Only members active in the last ACTIVE_WINDOW_DAYS are shown. Activity is
--     the presence heartbeat (member_presence, 0020).
--   * A score with its weights in a table. Plan tier is NOT a score input.
--   * A full six is fixed for the day, and refilled once if someone in it stops
--     being live or pauses. A short six (fewer qualified) is filled as more
--     qualify, never past six. If fewer than six qualify, fewer are shown.
--
-- The selection reads no religion, tribe, language, relationship history,
-- children, genotype, profession, education or photo to RANK anyone. The one
-- member-chosen exception is the viewer's own opt-in filters, which go through
-- passes_own_filters (0031/0044) exactly as before.

-- ---------------------------------------------------------------------------
-- 1. Settings
-- ---------------------------------------------------------------------------

create table if not exists public.feed_config (
  key text primary key,
  value numeric not null,
  note text
);

insert into public.feed_config (key, value, note) values
  ('seen_cooldown_days', 30,  'A member shown to you is not shown again for this many days.'),
  ('active_window_days', 14,  'Only members seen in the app within this many days are shown.'),
  ('w_intent_same',      0.6, 'Same intent.'),
  ('w_intent_step1',     0.3, 'One step apart on casual / open to serious / serious / marriage-minded.'),
  ('w_intent_step2',     0,   'Two steps apart.'),
  ('w_intent_opposite', -0.3, 'Opposite ends. Nothing is added when either side has no intent set.'),
  ('w_city',             0.4, 'Same city. There is deliberately NO same-country term: it would rank members abroad below members in Nigeria, i.e. diaspora status as a score input (PRD §5.2.5, §5.6; decided 13 October 2026).'),
  ('active_hot_days',    2,   'Seen within this many days ...'),
  ('w_active_hot',       0.3, '... earns this.'),
  ('active_warm_days',   7,   'Seen within this many days ...'),
  ('w_active_warm',      0.15,'... earns this (when not already hot).'),
  ('w_prompt_each',      0.05,'Per prompt answer ...'),
  ('prompt_cap',         3,   '... counted up to this many.'),
  ('new_member_days',    7,   'A member is new for this many days after going live ...'),
  ('w_new_member',       0.2, '... and earns this.'),
  ('exposure_divisor',   50,  'Impressions today / this = the exposure penalty ...'),
  ('exposure_cap',       0.5, '... capped at this.'),
  ('w_random',           0.2, 'Random 0..this, as a tie-break.')
on conflict (key) do nothing;

alter table public.feed_config enable row level security;
revoke all on public.feed_config from anon, authenticated;

create or replace function public._fc(p_key text)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare v numeric;
begin
  select value into v from feed_config where key = p_key;
  if v is null then raise exception 'feed_config is missing %', p_key; end if;
  return v;
end;
$$;
revoke all on function public._fc(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Who has been shown, passed on, and the day's bookkeeping
-- ---------------------------------------------------------------------------

-- Replaces seen_candidates. shown_at is the LAST time the pair was in a six.
create table if not exists public.feed_shown (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  shown_at timestamptz not null default now(),
  primary key (profile_id, candidate_id),
  check (profile_id <> candidate_id)
);

insert into public.feed_shown (profile_id, candidate_id, shown_at)
select profile_id, candidate_id, first_seen_on::timestamptz from public.seen_candidates
on conflict do nothing;

drop table public.seen_candidates;

-- "Not for me." Permanent, and private to the member who passed.
create table if not exists public.feed_passes (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  passed_at timestamptz not null default now(),
  primary key (profile_id, candidate_id),
  check (profile_id <> candidate_id)
);

-- One row per member per day: the six was built, and whether it was refilled.
create table if not exists public.feed_state (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  feed_date date not null,
  built_at timestamptz not null default now(),
  refilled_at timestamptz,
  primary key (profile_id, feed_date)
);

insert into public.feed_state (profile_id, feed_date)
select profile_id, feed_date from public.daily_feed
group by profile_id, feed_date
on conflict do nothing;

alter table public.feed_shown enable row level security;
alter table public.feed_passes enable row level security;
alter table public.feed_state enable row level security;
revoke all on public.feed_shown, public.feed_passes, public.feed_state from anon, authenticated;

-- A pass belongs to the member who made it. Only they can read or delete their
-- own rows; nobody can insert directly (pass_on is the only way in), and the
-- person passed on can never see that a row exists.
grant select, delete on public.feed_passes to authenticated;
drop policy if exists "own passes readable" on public.feed_passes;
create policy "own passes readable" on public.feed_passes for select using (auth.uid() = profile_id);
drop policy if exists "own passes deletable" on public.feed_passes;
create policy "own passes deletable" on public.feed_passes for delete using (auth.uid() = profile_id);

create index if not exists daily_feed_candidate_day_idx on public.daily_feed (candidate_id, feed_date);
create index if not exists replies_pair_idx on public.replies (sender_id, recipient_id);
create index if not exists reports_pair_idx on public.reports (reporter_id, reported_id);

-- ---------------------------------------------------------------------------
-- 3. Pieces the selection uses
-- ---------------------------------------------------------------------------

-- 0 casual … 3 marriage-minded; null when no intent is set.
create or replace function public._intent_rank(p_intent intent_level)
returns integer language sql immutable as $$
  select array_position(enum_range(null::intent_level), p_intent) - 1;
$$;

-- Is p_age inside the range its owner uses? Exactly _age_range (0027), for a
-- row we already have in hand: their own choice, else the default around
-- their own age, else no limit. An unknown age is never filtered out.
create or replace function public._age_in_window(
  p_age integer, p_min smallint, p_max smallint, p_owner_age integer,
  p_floor integer, p_cap integer, p_below integer, p_above integer, p_span integer)
returns boolean language plpgsql immutable as $$
declare lo integer; hi integer;
begin
  if p_age is null then return true; end if;
  if p_min is not null then
    lo := p_min; hi := p_max;
  elsif p_owner_age is not null then
    lo := greatest(p_floor, p_owner_age - p_below);
    hi := least(p_cap, greatest(p_owner_age + p_above, lo + p_span));
  else
    lo := p_floor; hi := p_cap;
  end if;
  return p_age >= lo and (hi >= p_cap or p_age <= hi);
end;
$$;

-- Does the viewer have opt-in filters set, on a plan that has them? Only the
-- viewer's own row, only a yes/no. Lets the selection skip the per-candidate
-- filter check for the many members who have none.
create or replace function public._viewer_filters_set(p_viewer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select has_advanced_filters(p_viewer)
     and exists (select 1 from member_filters f where f.profile_id = p_viewer);
$$;
revoke all on function public._viewer_filters_set(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. The selection: who qualifies, and in what order
-- ---------------------------------------------------------------------------
--
-- Each eligibility rule is ONE line ending in "-- rule:<name>"; each score
-- term is ONE line ending in "-- term:<name>". The tests rely on that to
-- prove every rule bites (they take a rule out and watch the test fail).
--
-- can_meet is symmetric (a man and a woman, whichever way round), so one call
-- is the mutual rule; the plain comparison before it only saves work.
--
-- Internal: not callable by members. Plan tier decides which POOLS a member can
-- be in (Diaspora plans open diaspora-to-diaspora) and whether their own opt-in
-- filters apply. It is never read by a score term.

create or replace function public._feed_pick(p_viewer uuid, p_now timestamptz, p_limit integer)
returns table (candidate_id uuid, score numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := p_now::date;
  v_pool match_pool;
  v_country text;
  v_open boolean;
  v_city_open boolean;
  v_city text;
  v_gender text;
  v_intent integer;
  v_age integer;
  v_age_min smallint;
  v_age_max smallint;
  v_filtering boolean;
  v_n integer := 0;
  pk record;
  c_floor integer; c_cap integer; c_below integer; c_above integer; c_span integer;
  k_cooldown numeric := _fc('seen_cooldown_days');
  k_window numeric := _fc('active_window_days');
  w_same numeric := _fc('w_intent_same');
  w_one numeric := _fc('w_intent_step1');
  w_two numeric := _fc('w_intent_step2');
  w_opp numeric := _fc('w_intent_opposite');
  w_city numeric := _fc('w_city');
  d_hot numeric := _fc('active_hot_days');
  w_hot numeric := _fc('w_active_hot');
  d_warm numeric := _fc('active_warm_days');
  w_warm numeric := _fc('w_active_warm');
  w_prompt numeric := _fc('w_prompt_each');
  k_prompt numeric := _fc('prompt_cap');
  d_new numeric := _fc('new_member_days');
  w_new numeric := _fc('w_new_member');
  k_div numeric := _fc('exposure_divisor');
  k_cap numeric := _fc('exposure_cap');
  w_rand numeric := _fc('w_random');
begin
  select pool, country_code, open_to_abroad, city, gender, _intent_rank(intent), age_min, age_max
    into v_pool, v_country, v_open, v_city, v_gender, v_intent, v_age_min, v_age_max
    from profiles where id = p_viewer;
  v_age := _member_age(p_viewer);
  v_city_open := diaspora_pool_open(p_viewer);
  select age_floor, age_cap, age_below, age_above, age_min_span
    into c_floor, c_cap, c_below, c_above, c_span from match_config;

  -- Diaspora-to-diaspora is a Diaspora-plan feature (PRD §5.6). Everyone else
  -- draws from the Nigeria pool.
  if current_tier(p_viewer) not in ('diaspora', 'diaspora_plus') then
    v_pool := 'back_home';
    v_city_open := false;
  end if;

  -- The member's own opt-in filters apply only if they have any set.
  v_filtering := _viewer_filters_set(p_viewer);

  if p_limit <= 0 then return; end if;

  -- Scored best first; "live" is checked on the way down and only for as many
  -- as are needed, because it is the costliest check and most of the pool is
  -- never reached.
  for pk in
  with cheap as materialized (
    select p.id,
           p.city as c_city,
           p.first_live_at as c_first_live,
           _intent_rank(p.intent) as c_intent,
           mp.seen_at as c_seen,
           (select count(*) from prompt_answers pa where pa.profile_id = p.id) as c_answers,
           (select count(*) from daily_feed f where f.candidate_id = p.id and f.feed_date = v_today) as c_impressions
    from profiles p
    left join profile_birthdates b on b.profile_id = p.id
    left join member_presence mp on mp.profile_id = p.id
    cross join lateral (select extract(year from age(v_today, b.date_of_birth))::integer as a) ca
    where p.id <> p_viewer
      and p.paused = false
      and p.stage in ('verified_real', 'id_confirmed')
      and p.gender is distinct from v_gender and can_meet(p_viewer, p.id)  -- rule:gender
      and _age_in_window(ca.a, v_age_min, v_age_max, v_age, c_floor, c_cap, c_below, c_above, c_span)  -- rule:age_mine
      and _age_in_window(v_age, p.age_min, p.age_max, ca.a, c_floor, c_cap, c_below, c_above, c_span)  -- rule:age_theirs
      and not exists (select 1 from blocks bl where (bl.blocker_id = p_viewer and bl.blocked_id = p.id) or (bl.blocker_id = p.id and bl.blocked_id = p_viewer))  -- rule:blocked
      and not exists (select 1 from reports r where r.reporter_id = p_viewer and r.reported_id = p.id)  -- rule:reported
      and not exists (select 1 from feed_passes fp where fp.profile_id = p_viewer and fp.candidate_id = p.id)  -- rule:passed
      and not exists (select 1 from feed_shown fs where fs.profile_id = p_viewer and fs.candidate_id = p.id and fs.shown_at > p_now - make_interval(days => k_cooldown::integer))  -- rule:cooldown
      and not exists (select 1 from daily_feed f where f.profile_id = p_viewer and f.feed_date = v_today and f.candidate_id = p.id)  -- rule:today
      and not exists (select 1 from gist_sessions g where (g.proposer_id = p_viewer and g.invitee_id = p.id) or (g.proposer_id = p.id and g.invitee_id = p_viewer))  -- rule:gist
      and not exists (select 1 from couples cp where (cp.member_a = p_viewer and cp.member_b = p.id) or (cp.member_a = p.id and cp.member_b = p_viewer))  -- rule:matched
      and not exists (select 1 from replies rp where (rp.sender_id = p_viewer and rp.recipient_id = p.id) or (rp.sender_id = p.id and rp.recipient_id = p_viewer))  -- rule:replied
      and mp.seen_at >= p_now - make_interval(days => k_window::integer)  -- rule:active
      and not exists (select 1 from account_restrictions ar where ar.profile_id = p.id and ar.lifted_at is null)
      and not exists (select 1 from reverification_requests rv where rv.profile_id = p.id)
      and (
        -- The Nigeria pool. "Open to people living abroad" works both ways.
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
      and (not v_filtering or passes_own_filters(p_viewer, p.id))  -- rule:own_filters
  )
  select c.id as cid,
         (
           case when v_intent is null or c.c_intent is null then 0
                else case abs(c.c_intent - v_intent) when 0 then w_same when 1 then w_one when 2 then w_two else w_opp end end  -- term:intent
           + case when v_city is not null and lower(btrim(c.c_city)) = lower(btrim(v_city)) then w_city else 0 end  -- term:place
           + case when c.c_seen >= p_now - make_interval(days => d_hot::integer) then w_hot when c.c_seen >= p_now - make_interval(days => d_warm::integer) then w_warm else 0 end  -- term:active
           + least(c.c_answers, k_prompt) * w_prompt  -- term:prompts
           + case when c.c_first_live >= p_now - make_interval(days => d_new::integer) then w_new else 0 end  -- term:new_member
           - least(c.c_impressions / k_div, k_cap)  -- term:exposure
           + random()::numeric * w_rand  -- term:random
         )::numeric as sc
  from cheap c
  order by 2 desc, c.id
  loop
    if profile_is_live(pk.cid) then  -- rule:live
      candidate_id := pk.cid;
      score := pk.sc;
      return next;
      v_n := v_n + 1;
      exit when v_n >= p_limit;
    end if;
  end loop;
end;
$$;
revoke all on function public._feed_pick(uuid, timestamptz, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Building and refilling a member's six
-- ---------------------------------------------------------------------------

create or replace function public._build_feed_for(p_profile_id uuid, p_now timestamptz)
returns setof public.daily_feed
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := p_now::date;
  v_claimed integer;
  v_stale integer[];
  v_picks uuid[];
  v_have integer;
  i integer;
begin
  if not is_restricted(p_profile_id) then
    insert into feed_state (profile_id, feed_date, built_at) values (p_profile_id, v_today, p_now)
    on conflict do nothing;
    get diagnostics v_claimed = row_count;

    if v_claimed = 0 then
      -- Built earlier today. If someone in it has stopped being live or
      -- paused, refill those places — ONCE a day, from the same rules. A place
      -- nobody qualifies for stays empty (the row stays, and is not returned).
      select array_agg(f.position order by f.position) into v_stale
        from daily_feed f
       where f.profile_id = p_profile_id and f.feed_date = v_today
         and not exists (select 1 from profiles c where c.id = f.candidate_id and c.paused = false and profile_is_live(c.id));
      if v_stale is not null then
        update feed_state set refilled_at = p_now
         where profile_id = p_profile_id and feed_date = v_today and refilled_at is null;
        get diagnostics v_claimed = row_count;
        if v_claimed = 1 then
          select array_agg(k.candidate_id order by k.score desc, k.candidate_id) into v_picks
            from _feed_pick(p_profile_id, p_now, cardinality(v_stale)) k;
          for i in 1 .. coalesce(cardinality(v_picks), 0) loop
            update daily_feed set candidate_id = v_picks[i], created_at = p_now
             where profile_id = p_profile_id and feed_date = v_today and position = v_stale[i];
          end loop;
        end if;
      end if;
    end if;

    -- A six that is short (the first look, or fewer qualified earlier) is
    -- filled from the same rules — never past six, and never by relaxing them.
    -- A full six is fixed for the day.
    select count(*) into v_have from daily_feed where profile_id = p_profile_id and feed_date = v_today;
    if v_have < daily_match_count() then
      insert into daily_feed (profile_id, feed_date, position, candidate_id, created_at)
      select p_profile_id, v_today, (v_have + row_number() over (order by k.score desc, k.candidate_id))::smallint, k.candidate_id, p_now
      from _feed_pick(p_profile_id, p_now, daily_match_count() - v_have) k;
    end if;

    -- Everyone in today's six has now been shown (cool-down starts here).
    insert into feed_shown (profile_id, candidate_id, shown_at)
    select f.profile_id, f.candidate_id, p_now from daily_feed f
     where f.profile_id = p_profile_id and f.feed_date = v_today
    on conflict (profile_id, candidate_id) do update set shown_at = excluded.shown_at where feed_shown.shown_at::date <> v_today;
  end if;

  -- Whoever is in the six and no longer live or paused is not returned.
  return query
    select f.* from daily_feed f
    join profiles c on c.id = f.candidate_id
    where f.profile_id = p_profile_id and f.feed_date = v_today
      and c.paused = false and profile_is_live(c.id)
    order by f.position;
end;
$$;
revoke all on function public._build_feed_for(uuid, timestamptz) from public, anon, authenticated;

create or replace function public.build_daily_feed(p_profile_id uuid)
returns setof public.daily_feed
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No live profile, no access (PRD §5.1.2): the six are only for live members.
  perform assert_live(auth.uid());
  -- A member builds and reads only their own six.
  if p_profile_id is distinct from auth.uid() then
    raise exception 'A member can only build their own feed.' using errcode = '42501';
  end if;
  return query select * from _build_feed_for(p_profile_id, now());
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Passing on someone in today's six
-- ---------------------------------------------------------------------------
--
-- Permanent and private: they never return to your six, and nothing tells them.
-- (No screen calls this yet; the prototype has no "pass" control.)

create or replace function public.pass_on(p_candidate uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform assert_live(auth.uid());
  if not exists (
    select 1 from daily_feed f
     where f.profile_id = auth.uid() and f.feed_date = current_date and f.candidate_id = p_candidate
  ) then
    raise exception 'You can pass on people in today''s six.' using errcode = '42501';
  end if;
  insert into feed_passes (profile_id, candidate_id) values (auth.uid(), p_candidate)
  on conflict do nothing;
end;
$$;
revoke all on function public.pass_on(uuid) from public, anon;
grant execute on function public.pass_on(uuid) to authenticated;

-- Settings → "People you passed on". Only the caller's own passes; a name and a
-- city (what a card already showed), never anything else about the person.
create or replace function public.my_passes()
returns table (candidate_id uuid, display_name text, city text, passed_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select fp.candidate_id, p.display_name, p.city, fp.passed_at
    from feed_passes fp
    join profiles p on p.id = fp.candidate_id
   where fp.profile_id = auth.uid()
   order by fp.passed_at desc;
$$;
revoke all on function public.my_passes() from public, anon;
grant execute on function public.my_passes() to authenticated;

-- "Bring back" (and the ten-second undo): the person may appear in a future six
-- again, after the usual cool-down. Nothing tells them either way.
create or replace function public.bring_back(p_candidate uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from feed_passes where profile_id = auth.uid() and candidate_id = p_candidate;
$$;
revoke all on function public.bring_back(uuid) from public, anon;
grant execute on function public.bring_back(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Staff: how many Gist requests women receive (PRD §5.2.5, monitoring)
-- ---------------------------------------------------------------------------
--
-- Women get about 2.4x the exposure of men (the simulation), so they may
-- receive more Gist requests. This lets staff see whether that becomes a
-- burden: invitations received per woman, per day. Counts only; no names, no
-- message text. Staff only.

create or replace function public.staff_gist_requests_per_woman(p_days integer default 30)
returns table (day date, women integer, requests integer, per_woman numeric, max_for_one_woman integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform _require_staff();
  return query
  with days as (
    select d::date as day from generate_series(current_date - (greatest(p_days, 1) - 1), current_date, interval '1 day') d
  ), women as (
    select count(*)::integer as n from profiles where gender = 'woman' and first_live_at is not null
  ), per as (
    select g.created_at::date as day, g.invitee_id, count(*)::integer as n
      from gist_sessions g join profiles p on p.id = g.invitee_id and p.gender = 'woman'
     where g.created_at::date >= current_date - (greatest(p_days, 1) - 1)
     group by 1, 2
  )
  select d.day,
         (select n from women),
         coalesce(sum(per.n), 0)::integer,
         round(coalesce(sum(per.n), 0)::numeric / nullif((select n from women), 0), 2),
         coalesce(max(per.n), 0)::integer
    from days d left join per on per.day = d.day
   group by d.day order by d.day desc;
end;
$$;
revoke all on function public.staff_gist_requests_per_woman(integer) from public, anon;
grant execute on function public.staff_gist_requests_per_woman(integer) to authenticated;

-- Toastly - height, star sign, and "Open to dating someone who has children?"
-- (owner, 13 October 2026; PRD 5.2, 5.2.4, 5.2.5). Follows 0047.
--
--   * Height: optional, stored in cm (120-220), self-reported, display only.
--     Shown on the full profile in cm and ft/in; never on the feed card, never
--     filterable, never a score term.
--   * Star sign: NOT stored. It is worked out from the date of birth, inside
--     profile_for, and only when the member turned on "Show my star sign"
--     (off by default). The date of birth is never returned.
--   * "Open to dating someone who has children?": Yes / No / not set (treated
--     as Yes). PRIVATE: no other member can ever read it - profile_for never
--     returns it and no policy lets a member select another's profile row. Its
--     one use is the two-way rule in today's six: if either member says No,
--     the other's Children answer must not be 1, 2 or 3 or more ("Prefer not
--     to say" and empty never trigger it). Every plan. A matching rule, not a
--     filter and not a score term, so it is not in member_filters.

alter table public.profiles
  add column if not exists height_cm smallint,
  add column if not exists show_star_sign boolean not null default false,
  add column if not exists open_to_children text;

alter table public.profiles drop constraint if exists profiles_height_cm_check;
alter table public.profiles add constraint profiles_height_cm_check
  check (height_cm is null or height_cm between 120 and 220);
alter table public.profiles drop constraint if exists profiles_open_to_children_check;
alter table public.profiles add constraint profiles_open_to_children_check
  check (open_to_children is null or open_to_children in ('yes', 'no'));

comment on column public.profiles.height_cm is
  'Self-reported, display only (full profile). Never filterable, never a score term, never on the feed card.';
comment on column public.profiles.show_star_sign is
  'Whether the full profile shows the sign worked out from the date of birth. Off by default.';
comment on column public.profiles.open_to_children is
  'PRIVATE. yes / no / null (not set = yes). Read only by _children_rule_ok (today''s six). Never returned by profile_for, never shown to anyone.';

-- ---------------------------------------------------------------------------
-- The sign, from a date of birth
-- ---------------------------------------------------------------------------

create or replace function public._star_sign(p_dob date)
returns text
language sql
immutable
as $$
  select case
    when p_dob is null then null
    else case
      when (extract(month from p_dob), extract(day from p_dob)) >= (3, 21)  and (extract(month from p_dob), extract(day from p_dob)) <= (4, 19)  then 'Aries'
      when (extract(month from p_dob), extract(day from p_dob)) >= (4, 20)  and (extract(month from p_dob), extract(day from p_dob)) <= (5, 20)  then 'Taurus'
      when (extract(month from p_dob), extract(day from p_dob)) >= (5, 21)  and (extract(month from p_dob), extract(day from p_dob)) <= (6, 20)  then 'Gemini'
      when (extract(month from p_dob), extract(day from p_dob)) >= (6, 21)  and (extract(month from p_dob), extract(day from p_dob)) <= (7, 22)  then 'Cancer'
      when (extract(month from p_dob), extract(day from p_dob)) >= (7, 23)  and (extract(month from p_dob), extract(day from p_dob)) <= (8, 22)  then 'Leo'
      when (extract(month from p_dob), extract(day from p_dob)) >= (8, 23)  and (extract(month from p_dob), extract(day from p_dob)) <= (9, 22)  then 'Virgo'
      when (extract(month from p_dob), extract(day from p_dob)) >= (9, 23)  and (extract(month from p_dob), extract(day from p_dob)) <= (10, 22) then 'Libra'
      when (extract(month from p_dob), extract(day from p_dob)) >= (10, 23) and (extract(month from p_dob), extract(day from p_dob)) <= (11, 21) then 'Scorpio'
      when (extract(month from p_dob), extract(day from p_dob)) >= (11, 22) and (extract(month from p_dob), extract(day from p_dob)) <= (12, 21) then 'Sagittarius'
      when (extract(month from p_dob), extract(day from p_dob)) >= (12, 22) or  (extract(month from p_dob), extract(day from p_dob)) <= (1, 19)  then 'Capricorn'
      when (extract(month from p_dob), extract(day from p_dob)) >= (1, 20)  and (extract(month from p_dob), extract(day from p_dob)) <= (2, 18)  then 'Aquarius'
      else 'Pisces'
    end
  end;
$$;

-- The preview on the profile screen: the caller's own sign, from their own date
-- of birth. Only the sign leaves the database.
create or replace function public.my_star_sign()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select _star_sign((select b.date_of_birth from profile_birthdates b where b.profile_id = auth.uid()));
$$;
revoke all on function public.my_star_sign() from public, anon;
grant execute on function public.my_star_sign() to authenticated;

-- ---------------------------------------------------------------------------
-- The two-way children rule (today's six only)
-- ---------------------------------------------------------------------------
--
-- Internal. If either member said No to "Open to dating someone who has
-- children?", the other's Children answer must not be 1, 2 or 3 or more. The
-- answer is read as stored, whatever its visibility, because the rule must hold
-- before anyone has matched; "Prefer not to say" and no answer never trigger it.

create or replace function public._children_rule_ok(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
cost 200
as $$
  select not (
    (coalesce((select p.open_to_children from profiles p where p.id = p_a), 'yes') = 'no'
       and coalesce((select h.children in ('one', 'two', 'three_plus') from profile_history h where h.profile_id = p_b), false))
    or
    (coalesce((select p.open_to_children from profiles p where p.id = p_b), 'yes') = 'no'
       and coalesce((select h.children in ('one', 'two', 'three_plus') from profile_history h where h.profile_id = p_a), false))
  );
$$;
revoke all on function public._children_rule_ok(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- profile_for: 0044's definition, plus height and (if shown) the star sign
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
    -- 0048: height in cm (the app shows cm and ft/in), and the star sign only
    -- when the owner turned it on. The sign is worked out from the date of
    -- birth in here; the date of birth itself is never returned.
    'height_cm', p.height_cm,
    'star_sign', case when p.show_star_sign
                      then _star_sign((select b.date_of_birth from profile_birthdates b where b.profile_id = p.id)) end,
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
-- Today's six: 0045's selection, plus the children rule
-- ---------------------------------------------------------------------------

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
      and _children_rule_ok(p_viewer, p.id)  -- rule:children
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

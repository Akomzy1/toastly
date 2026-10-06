-- Toastly — where a member lives, "Open to people living abroad" both ways,
-- and a free age-range preference (decided 5 October 2026).
--
-- 1. Country of residence is asked right after the phone code, with a guess
--    from the phone's country code that the member must confirm. Members
--    abroad then choose their city. Afterwards it changes only in settings,
--    at most once every 30 days, and every change is logged. A paid plan runs
--    to the end of its period and then renews on the new country's plans.
--    Members confirmed before this existed are asked once, on their next
--    visit. Country is now written only through confirm_country() and
--    change_country().
--
--    Review signals, never a block, when the stated country disagrees with
--    the phone's country code (new), the connection country at payment, or
--    the card's country. 0024 already raised the last two for naira
--    payments; this adds them for dollar payments.
--
-- 2. "Open to people living abroad" works both ways: switched off, the
--    member doesn't see members abroad, and members abroad don't see them.
--
-- 3. Age range: every member, free. A filter on the member's own six only,
--    defaulting to a configurable range around the member's own age; a
--    candidate whose age isn't on record is never filtered out.

-- ---------------------------------------------------------------------------
-- 1. Country of residence
-- ---------------------------------------------------------------------------

-- The countries a member can say they live in: the four the where-you-live
-- prototypes show first, and its 44 under "Somewhere else". Mirrors
-- lib/countries.ts (a constraint check compares the two).
create table if not exists public.residence_countries (
  code text primary key check (code ~ '^[A-Z]{2}$'),
  name text not null,
  calling_code text not null check (calling_code ~ '^[0-9]{1,4}$')
);
insert into public.residence_countries (code, name, calling_code) values
  ('NG', 'Nigeria', '234'), ('GB', 'United Kingdom', '44'), ('US', 'United States', '1'), ('CA', 'Canada', '1'),
  ('AU', 'Australia', '61'), ('AT', 'Austria', '43'), ('BE', 'Belgium', '32'), ('BJ', 'Benin', '229'),
  ('BW', 'Botswana', '267'), ('BR', 'Brazil', '55'), ('CM', 'Cameroon', '237'), ('CN', 'China', '86'),
  ('CI', 'Côte d''Ivoire', '225'), ('DK', 'Denmark', '45'), ('FI', 'Finland', '358'), ('FR', 'France', '33'),
  ('GM', 'Gambia', '220'), ('DE', 'Germany', '49'), ('GH', 'Ghana', '233'), ('IN', 'India', '91'),
  ('IE', 'Ireland', '353'), ('IT', 'Italy', '39'), ('JM', 'Jamaica', '1876'), ('JP', 'Japan', '81'),
  ('KE', 'Kenya', '254'), ('LR', 'Liberia', '231'), ('MY', 'Malaysia', '60'), ('NL', 'Netherlands', '31'),
  ('NZ', 'New Zealand', '64'), ('NO', 'Norway', '47'), ('PL', 'Poland', '48'), ('PT', 'Portugal', '351'),
  ('QA', 'Qatar', '974'), ('RW', 'Rwanda', '250'), ('SA', 'Saudi Arabia', '966'), ('SN', 'Senegal', '221'),
  ('SL', 'Sierra Leone', '232'), ('SG', 'Singapore', '65'), ('ZA', 'South Africa', '27'), ('KR', 'South Korea', '82'),
  ('ES', 'Spain', '34'), ('SE', 'Sweden', '46'), ('CH', 'Switzerland', '41'), ('TG', 'Togo', '228'),
  ('TT', 'Trinidad and Tobago', '1868'), ('TR', 'Türkiye', '90'), ('UG', 'Uganda', '256'), ('AE', 'United Arab Emirates', '971')
on conflict (code) do update set name = excluded.name, calling_code = excluded.calling_code;
alter table public.residence_countries enable row level security;
drop policy if exists "anyone reads the country list" on public.residence_countries;
create policy "anyone reads the country list" on public.residence_countries for select using (true);
revoke insert, update, delete on public.residence_countries from anon, authenticated;

alter table public.profiles add column if not exists country_confirmed_at timestamptz;
alter table public.profiles add column if not exists country_changed_at timestamptz;

-- Every confirmation and change, never edited.
create table if not exists public.country_changes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('confirmed', 'changed')),
  from_country text,
  to_country text not null,
  from_city text,
  to_city text,
  -- The phone number's country calling code at the time (e.g. '44'), never
  -- the number.
  phone_code text,
  created_at timestamptz not null default now()
);
create index if not exists country_changes_profile_idx on public.country_changes (profile_id, created_at desc);
alter table public.country_changes enable row level security;
drop policy if exists "own country changes readable" on public.country_changes;
create policy "own country changes readable" on public.country_changes for select using (auth.uid() = profile_id);
revoke insert, update, delete on public.country_changes from anon, authenticated;

create or replace function public.country_changes_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'The country log is append-only.' using errcode = '42501';
end;
$$;
drop trigger if exists country_changes_append_only on public.country_changes;
create trigger country_changes_append_only before update on public.country_changes
  for each row execute function public.country_changes_append_only();

-- Members can't set their country, or its confirmation and change dates,
-- by writing the row directly: only the two functions below do that.
create or replace function public.guard_country()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.country_code is distinct from old.country_code
    or new.country_confirmed_at is distinct from old.country_confirmed_at
    or new.country_changed_at is distinct from old.country_changed_at) then
    raise exception 'Where you live is changed in settings.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_country on public.profiles;
create trigger guard_country before update of country_code, country_confirmed_at, country_changed_at on public.profiles
  for each row execute function public.guard_country();

-- A dollar plan renewing for a member who has moved to Nigeria (or a naira
-- plan for one who has moved abroad) is stopped at the end of its period.
-- This marks it; the app stops it with the provider.
alter table public.subscriptions add column if not exists track_changed_at timestamptz;

alter type integrity_signal add value if not exists 'phone_country_mismatch';
alter type trust_event_kind add value if not exists 'phone_country_mismatch';

-- The signed-in member's phone calling code, digits only, or null. Read
-- from Supabase Auth, where the confirmed number lives; never stored here.
create or replace function public._my_phone_code(p_country text)
returns text language sql stable security definer set search_path = public as $$
  select case
           when coalesce(regexp_replace(u.phone, '\D', '', 'g'), '') = '' then null
           when regexp_replace(u.phone, '\D', '', 'g') like rc.calling_code || '%' then rc.calling_code
           else (select c.calling_code from residence_countries c
                  where regexp_replace(u.phone, '\D', '', 'g') like c.calling_code || '%'
                  order by length(c.calling_code) desc limit 1)
         end
    from auth.users u, residence_countries rc
   where u.id = auth.uid() and rc.code = p_country;
$$;
revoke all on function public._my_phone_code(text) from public, anon, authenticated;

-- Shared by both functions: validate, write, log, signal.
create or replace function public._set_country(p_kind text, p_country text, p_city text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_country text := upper(trim(coalesce(p_country, '')));
  v_city text := nullif(trim(coalesce(p_city, '')), '');
  me profiles;
  v_code text;
  v_phone_code text;
  v_track_changed boolean;
  v_stop jsonb;
begin
  if v_me is null then raise exception 'Please sign in again.' using errcode = '42501'; end if;
  select * into me from profiles where id = v_me for update;
  select calling_code into v_code from residence_countries where code = v_country;
  if not found then raise exception 'Choose a country from the list.' using errcode = '22023'; end if;

  if v_country = 'NG' then
    v_city := null;
  elsif v_city is not null and not exists (
      select 1 from diaspora_cities where slug = v_city and country_code = v_country) then
    raise exception 'Choose a city in the country you live in.' using errcode = '22023';
  end if;

  v_track_changed := (me.country_code = 'NG') <> (v_country = 'NG');
  v_phone_code := _my_phone_code(v_country);

  update profiles
     set country_code = v_country,
         diaspora_city = v_city,
         -- Members in Nigeria have one pool.
         pool = case when v_country = 'NG' then 'back_home' else pool end,
         country_confirmed_at = coalesce(country_confirmed_at, now()),
         country_changed_at = case when p_kind = 'changed' then now() else country_changed_at end,
         updated_at = now()
   where id = v_me;

  insert into country_changes (profile_id, kind, from_country, to_country, from_city, to_city, phone_code)
  values (v_me, p_kind, me.country_code, v_country, me.diaspora_city, v_city, v_phone_code);

  -- The phone's country code disagrees with where they say they live: a
  -- person looks. Never a block. (+1 covers both the US and Canada.)
  if v_phone_code is not null and v_phone_code <> v_code then
    perform _integrity_signal(v_me, 'phone_country_mismatch',
      jsonb_build_object('country', v_country, 'phone_code', v_phone_code, 'at', p_kind));
  end if;

  -- A renewing plan on the old track runs to its period end, then stops.
  v_stop := '[]'::jsonb;
  if v_track_changed then
    with marked as (
      update subscriptions
         set track_changed_at = now(), updated_at = now()
       where profile_id = v_me and status in ('active', 'past_due')
         and ((provider = 'paystack' and v_country <> 'NG') or (provider = 'stripe' and v_country = 'NG'))
      returning id, tier, current_period_end)
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'tier', tier, 'ends', current_period_end)), '[]'::jsonb)
      into v_stop from marked;
  end if;

  return jsonb_build_object('country', v_country, 'city', v_city, 'track_changed', v_track_changed,
                            'stop_renewing', v_stop);
end;
$$;
revoke all on function public._set_country(text, text, text) from public, anon, authenticated;

-- The first answer: after the phone code at sign-up, or once on the next
-- visit for members who never confirmed.
create or replace function public.confirm_country(p_country text, p_city text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from profiles where id = auth.uid() and country_confirmed_at is not null) then
    raise exception 'You''ve already confirmed where you live. Change it in settings.' using errcode = '22023';
  end if;
  return _set_country('confirmed', p_country, p_city);
end;
$$;

-- A move, from settings: at most once every 30 days.
create or replace function public.change_country(p_country text, p_city text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me profiles;
begin
  select * into me from profiles where id = auth.uid();
  if not found then raise exception 'Please sign in again.' using errcode = '42501'; end if;
  if me.country_confirmed_at is null then
    return _set_country('confirmed', p_country, p_city);
  end if;
  if upper(trim(coalesce(p_country, ''))) = me.country_code then
    raise exception 'That''s already where you live.' using errcode = '22023';
  end if;
  if me.country_changed_at is not null and me.country_changed_at > now() - interval '30 days' then
    raise exception 'You can change where you live again on %.',
      to_char(me.country_changed_at + interval '30 days', 'FMDD Mon YYYY') using errcode = '22023';
  end if;
  return _set_country('changed', p_country, p_city);
end;
$$;

revoke all on function public.confirm_country(text, text) from public, anon;
revoke all on function public.change_country(text, text) from public, anon;
grant execute on function public.confirm_country(text, text) to authenticated;
grant execute on function public.change_country(text, text) to authenticated;

-- Dollar payments: the card's country and the connection country are
-- checked against where the member says they live, as naira payments
-- already are (0024). Naira payments keep their own checks.
create or replace function public.trust_dollar_payment_geography()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_country text;
begin
  if new.currency = 'NGN' then return new; end if;
  select country_code into v_country from profiles where id = new.profile_id;
  if v_country is null then return new; end if;
  if tg_op = 'INSERT' then
    if new.ip_country is not null and new.ip_country <> v_country then
      perform _integrity_signal(new.profile_id, 'ip_country_mismatch',
        jsonb_build_object('track', 'usd', 'at', 'payment', 'country', new.ip_country, 'profile_country', v_country));
    end if;
  elsif new.card_country is not null and new.card_country is distinct from old.card_country
        and new.card_country <> v_country then
    perform _integrity_signal(new.profile_id, 'payment_geography_mismatch',
      jsonb_build_object('track', 'usd', 'country', new.card_country, 'profile_country', v_country, 'kind', new.kind));
  end if;
  return new;
end;
$$;
revoke all on function public.trust_dollar_payment_geography() from public, anon, authenticated;
drop trigger if exists dollar_payment_geography on public.payments;
create trigger dollar_payment_geography after insert or update of card_country on public.payments
  for each row execute function public.trust_dollar_payment_geography();

-- The console's one-line reason, for the new signal and the dollar track.
-- Otherwise 0026's function, unchanged.
create or replace function public._case_reason(i review_items)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  ir integrity_reviews;
  r reports;
  d date_commitments;
  vs verification_sessions;
  v_n integer;
  v_route text;
begin
  if i.kind = 'pricing' then
    select * into ir from integrity_reviews where id = i.source_id;
    v_route := ir.detail ->> 'route';
    return case ir.signal
      when 'profile_country_mismatch' then
        case when v_route = 'coin_pack' then 'Bought a naira coin pack while their profile says they live in ' || _country_name(ir.detail ->> 'country') || '.'
             when v_route = 'coins' then 'Paid for a naira plan with coins while their profile says they live in ' || _country_name(ir.detail ->> 'country') || '.'
             else 'Bought a naira plan while their profile says they live in ' || _country_name(ir.detail ->> 'country') || '.' end
      when 'payment_geography_mismatch' then
        case when ir.detail ->> 'track' = 'usd'
             then 'Paid in dollars with a card issued in ' || _country_name(ir.detail ->> 'country') || ' while their profile says they live in ' || _country_name(ir.detail ->> 'profile_country') || '.'
             else 'Paid in naira with a card issued in ' || _country_name(ir.detail ->> 'country') || '.' end
      when 'ip_country_mismatch' then
        case when ir.detail ->> 'track' = 'usd'
             then 'Opened a dollar checkout from ' || _country_name(ir.detail ->> 'country') || ' while their profile says they live in ' || _country_name(ir.detail ->> 'profile_country') || '.'
             else 'Opened a naira checkout from ' || _country_name(ir.detail ->> 'country') || '.' end
      when 'phone_country_mismatch' then
        'Says they live in ' || _country_name(ir.detail ->> 'country') || ', but their phone number has a +' || coalesce(ir.detail ->> 'phone_code', '?') || ' code.'
      else 'Pricing signal: ' || replace(ir.signal::text, '_', ' ') || '.' end;
  elsif i.kind in ('report', 'married_report', 'blind_report') then
    select * into r from reports where id = i.source_id;
    select count(*) into v_n from reports where reported_id = r.reported_id and created_at <= r.created_at and reason = r.reason;
    if i.kind = 'married_report' then
      return 'A match says this member is married. ' || case when v_n <= 1 then 'First report on the account.' else 'Report ' || v_n || ' of this kind on the account.' end;
    elsif i.kind = 'blind_report' then
      return 'Reported from a locked inbox as “' || _report_label(r.reason) || '”. The reporter hasn''t read the messages.';
    end if;
    return 'Reported as “' || _report_label(r.reason) || '”.' || case when v_n > 1 then ' Report ' || v_n || ' of this kind on the account.' else '' end;
  elsif i.kind = 'attendance' then
    select * into d from date_commitments where id = i.source_id;
    return 'Says they were at ' || coalesce(d.venue_name, 'the venue') || '. '
        || case when d.a_checked_in_at is not null and d.b_checked_in_at is not null then 'Both check-ins were recorded.'
                when d.a_checked_in_at is null and d.b_checked_in_at is null then 'No check-in was recorded.'
                else 'Only one check-in was recorded.' end;
  elsif i.kind in ('selfie_review', 'id_review') then
    select * into vs from verification_sessions where id = i.source_id;
    select count(*) into v_n from verification_sessions where profile_id = vs.profile_id and product = vs.product;
    return case when i.kind = 'selfie_review' then 'Selfie liveness came back for review' else 'ID check came back for review' end
        || case when v_n > 1 then ' after ' || (v_n - 1) || ' earlier attempt' || case when v_n > 2 then 's' else '' end || '.' else '.' end;
  elsif i.kind = 'photo_match' then
    return 'Main photo may not match the verified selfie.';
  end if;
  return 'Safety flag.';
end;
$$;
revoke all on function public._case_reason(review_items) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Age range (every member, free)
-- ---------------------------------------------------------------------------

-- The default range around a member's own age (match-preferences.slim.html:
-- four years below, five above, at least nine years wide, on a scale of
-- 18 to 70+). Configurable here rather than in code.
create table if not exists public.match_config (
  id boolean primary key default true check (id),
  age_floor smallint not null default 18 check (age_floor >= 18),
  age_cap smallint not null default 70 check (age_cap > 18),
  age_below smallint not null default 4 check (age_below >= 0),
  age_above smallint not null default 5 check (age_above >= 0),
  age_min_span smallint not null default 9 check (age_min_span >= 1)
);
insert into public.match_config (id) values (true) on conflict (id) do nothing;
alter table public.match_config enable row level security;
drop policy if exists "anyone reads match config" on public.match_config;
create policy "anyone reads match config" on public.match_config for select using (true);
revoke insert, update, delete on public.match_config from anon, authenticated;

-- Null = the default around the member's own age, which moves as they do.
-- age_max at the cap (70) means "70+": no upper limit.
alter table public.profiles add column if not exists age_min smallint;
alter table public.profiles add column if not exists age_max smallint;
alter table public.profiles drop constraint if exists profiles_age_range_check;
alter table public.profiles add constraint profiles_age_range_check check (
  (age_min is null and age_max is null)
  or (age_min between 18 and 70 and age_max between 19 and 70 and age_max > age_min));

-- A member's age, for the feed only. Their date of birth stays private.
create or replace function public._member_age(p uuid)
returns integer language sql stable security definer set search_path = public as $$
  select extract(year from age(current_date, b.date_of_birth))::integer
    from profile_birthdates b where b.profile_id = p;
$$;
revoke all on function public._member_age(uuid) from public, anon, authenticated;

-- The range a member's six use: their own choice, or the default around
-- their age. hi is null for "70+". A member whose age isn't on record and
-- who hasn't chosen gets no age filter at all.
create or replace function public._age_range(p uuid, out lo integer, out hi integer, out is_default boolean, out own_age integer)
language plpgsql stable security definer set search_path = public as $$
declare
  cfg match_config;
  me profiles;
begin
  select * into cfg from match_config;
  select * into me from profiles where id = p;
  own_age := _member_age(p);
  if me.age_min is not null then
    lo := me.age_min; hi := me.age_max; is_default := false;
  elsif own_age is not null then
    lo := greatest(cfg.age_floor, own_age - cfg.age_below);
    hi := least(cfg.age_cap, greatest(own_age + cfg.age_above, lo + cfg.age_min_span));
    is_default := true;
  else
    lo := cfg.age_floor; hi := cfg.age_cap; is_default := true;
  end if;
  if hi >= cfg.age_cap then hi := null; end if;
end;
$$;
revoke all on function public._age_range(uuid) from public, anon, authenticated;

-- For the Match preferences screen: the member's own range and the scale.
create or replace function public.my_age_range()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('lo', r.lo, 'hi', coalesce(r.hi, c.age_cap), 'is_default', r.is_default,
                            'floor', c.age_floor, 'cap', c.age_cap)
    from _age_range(auth.uid()) r, match_config c
   where auth.uid() is not null;
$$;
revoke all on function public.my_age_range() from public, anon;
grant execute on function public.my_age_range() to authenticated;

-- The console names countries from the full list now.
create or replace function public._country_name(p text)
returns text language sql stable set search_path = public as $$
  select case upper(coalesce(p, ''))
    when 'NG' then 'Nigeria' when 'GB' then 'the UK' when 'US' then 'the US'
    when 'NL' then 'the Netherlands' when 'AE' then 'the UAE'
    when '' then 'an unknown country'
    else coalesce((select name from residence_countries where code = upper(p)), upper(p)) end;
$$;

-- ---------------------------------------------------------------------------
-- 2 + 3. The daily six: 0026's, with the switch both ways and the age range
-- ---------------------------------------------------------------------------

comment on column public.profiles.open_to_abroad is
  'Nigeria-based members only. Off: members abroad are left out of my six, and I am left out of theirs '
  '(decided 5 October 2026). Never a ranking or scoring input (PRD §5.6).';

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
begin
  if exists (select 1 from daily_feed where profile_id = p_profile_id and feed_date = v_today) then
    return query select * from daily_feed where profile_id = p_profile_id and feed_date = v_today order by position;
    return;
  end if;

  if is_restricted(p_profile_id) then
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
      and not exists (select 1 from seen_candidates s where s.profile_id = p_profile_id and s.candidate_id = p.id)
      and not exists (select 1 from blocks b where (b.blocker_id = p_profile_id and b.blocked_id = p.id)
                                                or (b.blocker_id = p.id and b.blocked_id = p_profile_id))
      --
      -- NOTHING BELOW THIS LINE. Do not add religion, tribe, language,
      -- relationship history, has_children, profession or education to this
      -- WHERE clause. They are display-only and must never silently exclude
      -- anyone from anyone's feed (CLAUDE.md). Opt-in filters belong on the
      -- member's own search, applied to their own results, not here.
      -- Diaspora status is never a score input (PRD §5.6).
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

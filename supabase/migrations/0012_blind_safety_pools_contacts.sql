-- Toastly — four ratified decisions.
--
--   (a) Blind report and blind block on locked messages.
--   (b) Free members abroad get the back-home pool; paid Diaspora unlocks both.
--   (c) Photos visible by default, with an "only my matches" toggle.
--   (d) Emergency contact, confirmed by a one-time SMS code.
--
-- (c) needs no schema change and that is deliberate: `photo_reveal` already
-- defaults to 'verified_members', which IS visible-by-default. The toggle maps
-- to 'after_i_reply'. The flagged assumption in 0007 is now a ratified
-- decision — recorded here so the next reader doesn't re-open it.

-- ---------------------------------------------------------------------------
-- (a) Blind report and blind block
-- ---------------------------------------------------------------------------
--
-- The problem these solve: a Starter member being harassed can see that
-- messages arrived but not who sent them, so until now they could not report
-- or block without paying. Safety is never paywalled (CLAUDE.md), so that was
-- a real gate.
--
-- The shape matters. Neither function takes a sender argument, and neither
-- returns one — not a name, not an id, not a count of distinct senders. A
-- client that could name the sender, or count them, has been told something
-- the locked inbox exists to withhold. The member says "whoever is messaging
-- me", and the database resolves it.
--
-- The REVIEWER sees everything: these write ordinary rows to `reports`, which
-- carry full identity and reach the queue exactly like any other report. The
-- blindness is on the reporting member's side only.

create or replace function public.blind_report_locked(
  p_reason report_reason,
  p_detail text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Not signed in.';
  end if;

  -- One report per distinct sender of an unread message to me.
  insert into reports (reporter_id, reported_id, reason, detail)
  select v_me, m.sender_id, p_reason, p_detail
  from messages m
  join threads t on t.id = m.thread_id
  where m.sender_id <> v_me
    and (t.member_a = v_me or t.member_b = v_me)
    and m.read_at is null
  group by m.sender_id;
end;
$$;

-- Blocking is permanent and mutual in effect, and the member is told so
-- plainly in the UI before they use this: an innocent sender is caught by it
-- too, and that is the honest trade for being able to act without paying.
create or replace function public.blind_block_locked()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Not signed in.';
  end if;

  insert into blocks (blocker_id, blocked_id)
  select distinct v_me, m.sender_id
  from messages m
  join threads t on t.id = m.thread_id
  where m.sender_id <> v_me
    and (t.member_a = v_me or t.member_b = v_me)
    and m.read_at is null
  on conflict do nothing;
end;
$$;

revoke all on function public.blind_report_locked(report_reason, text) from public;
revoke all on function public.blind_block_locked() from public;
grant execute on function public.blind_report_locked(report_reason, text) to authenticated;
grant execute on function public.blind_block_locked() to authenticated;

-- ---------------------------------------------------------------------------
-- (b) Pools follow the paid tier
-- ---------------------------------------------------------------------------
--
-- A free member abroad is a Starter member: they match into the back-home
-- pool, which is where the liquidity is anyway. Diaspora-to-diaspora is part
-- of what the paid Diaspora tier buys — on top of the per-city opening from
-- 0010, which still applies.
--
-- The 6/day count is untouched. This changes WHICH pool a member draws from,
-- never how many they get, and every tier still gets six.

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
  if exists (select 1 from daily_feed where profile_id = p_profile_id and feed_date = v_today) then
    return query select * from daily_feed where profile_id = p_profile_id and feed_date = v_today order by position;
    return;
  end if;

  select pool, country_code into v_pool, v_country from profiles where id = p_profile_id;
  v_tier := current_tier(p_profile_id);
  v_city_open := diaspora_pool_open(p_profile_id);

  -- The paid Diaspora tiers unlock diaspora-to-diaspora. Everyone else
  -- matches back home, whatever their stored preference says.
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

-- Why a member's pool choice isn't producing what they picked, in words the
-- UI can show. Never a silent substitution (PRD §5.6).
create or replace function public.pool_restriction(p_profile_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when (select pool from profiles where id = p_profile_id) = 'back_home' then null
    when current_tier(p_profile_id) in ('diaspora', 'diaspora_plus') then null
    else 'tier'
  end;
$$;

-- ---------------------------------------------------------------------------
-- (d) Emergency contact
-- ---------------------------------------------------------------------------
--
-- A REVERSAL, stated plainly. 0007 says: "share-your-date and panic have no
-- table on purpose … so Toastly never stores a trusted contact's phone
-- number." Decision (d) requires storing one, because a panic alert has to be
-- deliverable when the member cannot reach their own phone, and a number
-- confirmed at setup is the only way to know it works before it matters.
--
-- What that obliges us to do:
--   - one contact per member, replaceable, deletable by the member alone;
--   - the number is never shown to any other member and never used for
--     anything except the confirmation code and alerts the member triggers;
--   - the confirmation code is stored only as a peppered hash, like phone
--     identities, and expires;
--   - this contact never becomes a call path. It receives SMS, nothing else.

create table public.emergency_contacts (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  confirmed_at timestamptz,
  -- Peppered hash of the one-time code, never the code itself.
  code_hash text,
  code_expires_at timestamptz,
  attempts smallint not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.emergency_contacts is
  'One trusted contact per member, for panic alerts and date check-ins. Never a matching input, never visible to other members, never a call path.';

alter table public.emergency_contacts enable row level security;

-- Own row only, in every direction. No member, staff query or report flow
-- reads somebody else's trusted contact.
create policy "own emergency contact" on public.emergency_contacts
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

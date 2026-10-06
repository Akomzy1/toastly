-- Toastly — fixes ported from live-profile-and-prompt-14 (6 October 2026),
-- and the AriyaPlanner brief rule.
--
-- 1. build_daily_feed trusted p_profile_id: as security definer it let any
--    member read anyone's six. It now refuses any id but the caller's.
-- 2. gist_mutual_continue ran under the caller's row-level security, which
--    only shows a member their own outcome — so asked as a member it was
--    always false ("did both say continue?" never came true). It now runs
--    as definer, answers only the two people in the Gist, and returns the
--    yes/no only — never the other person's answer.
-- 3. Phone binding never happened: confirmPhoneCode upserted phone_identities
--    as the member, and the table has no insert policy (rightly — hashes are
--    never client-writable), so the write failed silently. One number, one
--    account wasn't enforced, and a removed member's number never reached
--    the blocklist. Now: phone_in_use() answers yes/no for the member; the
--    server binds the number through record_phone_verified() (service role).
-- 4. replies had no insert policy, so every text reply was refused.
-- 5. The AriyaPlanner brief is drafted only from what the couple enters or
--    copies at the handoff (PRD §5.7) — never read from profiles.

-- ---------------------------------------------------------------------------
-- 1. The feed: only your own
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
  v_open boolean;
  v_city_open boolean;
  v_age_min integer;
  v_age_max integer;
begin
  -- A member builds and reads only their own six. Security definer, so
  -- without this anyone could read anyone's feed by passing their id.
  if p_profile_id is distinct from auth.uid() then
    raise exception 'A member can only build their own feed.' using errcode = '42501';
  end if;

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

-- ---------------------------------------------------------------------------
-- 2. Did both say continue? Yes or no, for the two people in the Gist
-- ---------------------------------------------------------------------------

create or replace function public.gist_mutual_continue(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select count(*) = 2 and bool_and(o.wants_to_continue)
      from gist_outcomes o
     where o.session_id = p_session_id
       and exists (
         select 1 from gist_sessions g
          where g.id = p_session_id
            -- The two members, or the server itself (no member session).
            and (auth.uid() is null or auth.uid() in (g.proposer_id, g.invitee_id)))
  ), false);
$$;
revoke all on function public.gist_mutual_continue(uuid) from public, anon;
grant execute on function public.gist_mutual_continue(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. One number, one account
-- ---------------------------------------------------------------------------

-- Is this number already on another account? Yes or no; never whose.
create or replace function public.phone_in_use(p_hash text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from phone_identities
     where phone_hash = p_hash and profile_id is distinct from auth.uid());
$$;
revoke all on function public.phone_in_use(text) from public, anon;
grant execute on function public.phone_in_use(text) to authenticated;

-- Bind a confirmed number to the account. Server only: the hash is computed
-- with the pepper on the server, after Supabase Auth confirmed the code.
-- Refuses a number on another account or on the blocklist, and never moves
-- a number from one account to another.
create or replace function public.record_phone_verified(p_profile uuid, p_hash text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if p_hash is null or length(p_hash) < 32 then
    raise exception 'A phone hash is required.' using errcode = '22023';
  end if;
  if is_phone_blocked(p_hash) then
    return 'blocked';
  end if;
  select profile_id into v_owner from phone_identities where phone_hash = p_hash;
  if v_owner is not null and v_owner <> p_profile then
    return 'in_use';
  end if;
  if v_owner = p_profile then
    return 'ok';
  end if;
  -- A member who confirms a different number later keeps one row: the new
  -- number replaces the old one for the same account.
  delete from phone_identities where profile_id = p_profile;
  insert into phone_identities (phone_hash, profile_id) values (p_hash, p_profile);
  return 'ok';
end;
$$;
revoke all on function public.record_phone_verified(uuid, text) from public, anon, authenticated;
grant execute on function public.record_phone_verified(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Sending a reply
-- ---------------------------------------------------------------------------

drop policy if exists "send a reply" on public.replies;
create policy "send a reply" on public.replies for insert
  with check (
    auth.uid() = sender_id
    -- To an answer the recipient wrote, that the sender can see.
    and exists (select 1 from prompt_answers a where a.id = prompt_answer_id and a.profile_id = recipient_id)
    -- Starter can't send free text (CLAUDE.md); a Gist invite is its channel.
    and (kind <> 'text' or current_tier(auth.uid()) <> 'starter')
    and not exists (select 1 from blocks b where (b.blocker_id = sender_id and b.blocked_id = recipient_id)
                                              or (b.blocker_id = recipient_id and b.blocked_id = sender_id))
  );

-- ---------------------------------------------------------------------------
-- 5. The AriyaPlanner brief: the couple's own entries
-- ---------------------------------------------------------------------------
--
-- 0006 said cultural context would be "copied from profiles at consent
-- time". Withdrawn: tribe, religion, language and the like are protected
-- attributes no agent or integration may read (PRD §5.9). The columns stay
-- (CLAUDE.md), holding only what the couple types or chooses to copy across.
-- The fields PRD §5.7 names for the brief:

alter table public.couple_briefs
  add column if not exists wedding_city text check (char_length(wedding_city) <= 120),
  add column if not exists rough_date text check (char_length(rough_date) <= 60),
  add column if not exists guest_count_band text check (char_length(guest_count_band) <= 40),
  add column if not exists budget_band text check (char_length(budget_band) <= 40),
  add column if not exists ceremony_formats text[] not null default '{}'
    check (ceremony_formats <@ array['introduction', 'traditional', 'white_wedding']::text[]);

-- Nothing can copy health data into a brief: it lives encrypted in its own
-- table, readable only on the display path (0014), and a constraint check
-- fails the build if any other SQL touches it.

comment on table public.couple_briefs is
  'AriyaPlanner handoff brief. Filled only from what the couple enters or chooses to copy at handoff; '
  'never read from profiles (PRD §5.7). Nothing sends it anywhere.';

-- Toastly — gender, who you'd like to meet, and a first prompt before going
-- live (decided 8 October 2026; PRD §7.3). Follows 0035.
--
--   - Gender and "who you'd like to meet" come from a config list
--     (gender_options; Woman/Man by default). Both are asked at sign-up.
--   - Two members appear in each other's six, and can reply, invite or open
--     each other's profile, only if EACH matches the other's preference.
--   - A profile goes live only with gender, who they'd like to meet, and at
--     least one prompt answer — on top of 0029's phone, Verified Real and
--     four photos with a matched main photo.
--   - Fixes a gap since 0029: the six only ever draws LIVE members.

-- ---------------------------------------------------------------------------
-- 1. The option list
-- ---------------------------------------------------------------------------

create table if not exists public.gender_options (
  code text primary key check (code ~ '^[a-z_]{2,30}$'),
  label text not null check (char_length(label) between 1 and 40),   -- "Woman", for "I am"
  plural text not null check (char_length(plural) between 1 and 40),  -- "Women", for "who you'd like to meet"
  sort smallint not null default 0,
  active boolean not null default true
);
insert into public.gender_options (code, label, plural, sort) values
  ('woman', 'Woman', 'Women', 1),
  ('man', 'Man', 'Men', 2)
on conflict (code) do nothing;
alter table public.gender_options enable row level security;
drop policy if exists "anyone reads the gender options" on public.gender_options;
create policy "anyone reads the gender options" on public.gender_options for select using (true);
revoke insert, update, delete on public.gender_options from anon, authenticated;
grant select on public.gender_options to anon, authenticated;

alter table public.profiles add column if not exists seeking text[];

create or replace function public.is_gender_option(p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from gender_options where code = p_code and active);
$$;

-- A member may only choose from the list. (Gender is also locked once live,
-- guard_gender in 0035; support can change it.)
create or replace function public.guard_gender_choice()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if (tg_op = 'INSERT' or new.gender is distinct from old.gender) and new.gender is not null and not is_gender_option(new.gender) then
    raise exception 'Choose from the list.' using errcode = '22023';
  end if;
  if (tg_op = 'INSERT' or new.seeking is distinct from old.seeking) and new.seeking is not null and (
       cardinality(new.seeking) = 0
       or exists (select 1 from unnest(new.seeking) s where not is_gender_option(s))) then
    raise exception 'Choose who you''d like to meet from the list.' using errcode = '22023';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_gender_choice on public.profiles;
create trigger guard_gender_choice before insert or update of gender, seeking on public.profiles
  for each row execute function public.guard_gender_choice();

-- handle_new_user: 0035's definition, also storing who they'd like to meet.
-- Anything not on the list is dropped; a profile without both can't go live.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gender text := new.raw_user_meta_data ->> 'gender';
  v_country text := upper(coalesce(new.raw_user_meta_data ->> 'country_code', 'NG'));
  v_seeking text[];
begin
  if v_country !~ '^[A-Z]{2}$' then v_country := 'NG'; end if;
  if v_gender is not null and not is_gender_option(v_gender) then v_gender := null; end if;
  select array_agg(distinct s) into v_seeking
    from jsonb_array_elements_text(case when jsonb_typeof(new.raw_user_meta_data -> 'seeking') = 'array'
                                        then new.raw_user_meta_data -> 'seeking' else '[]'::jsonb end) s
   where is_gender_option(s);

  insert into public.profiles (id, display_name, gender, country_code, seeking)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', 'New member'),
    v_gender,
    v_country,
    v_seeking
  );

  -- Everyone starts on Starter. The women's launch offer begins at go-live
  -- (grant_launch_offer, 0035), not here.
  insert into public.entitlements (profile_id, tier, source)
  values (new.id, 'starter', 'default');

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Each matches the other's preference
-- ---------------------------------------------------------------------------

-- Internal: two arbitrary ids would let a client ask about OTHER pairs.
create or replace function public.wants_each_other(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles a, profiles b
     where a.id = p_a and b.id = p_b
       and a.gender is not null and b.gender is not null
       and a.gender = any (b.seeking)
       and b.gender = any (a.seeking));
$$;
revoke all on function public.wants_each_other(uuid, uuid) from public, anon, authenticated;

-- For the reply policy: only ever about the caller.
create or replace function public.wants_each_other_with(p_other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select wants_each_other(auth.uid(), p_other);
$$;
revoke all on function public.wants_each_other_with(uuid) from public, anon;
grant execute on function public.wants_each_other_with(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Going live needs gender, who you'd like to meet, and a prompt answer
-- ---------------------------------------------------------------------------

create or replace function public.profile_is_live(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.phone_verified_at is not null
       and p.stage in ('verified_real', 'id_confirmed')
       and not is_restricted(p.id)
       and p.main_photo_id is not null
       and exists (select 1 from profile_photos m where m.id = p.main_photo_id and m.face_match = 'matched')
       and visible_photo_count(p.id) >= min_live_photos()
       -- 0036: who they are, who they'd like to meet, and one answer.
       and is_gender_option(p.gender)
       and coalesce(cardinality(p.seeking), 0) > 0
       and exists (select 1 from prompt_answers a where a.profile_id = p.id)
      from profiles p where p.id = p_profile_id), false);
$$;

-- What the not-live screen needs (0029's, plus the three new steps).
create or replace function public.live_profile_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'live', profile_is_live(p.id),
    'phone', p.phone_verified_at is not null,
    'verified', p.stage in ('verified_real', 'id_confirmed'),
    'restricted', is_restricted(p.id),
    'photo_count', visible_photo_count(p.id),
    'photos_min', min_live_photos(),
    'photos_max', max_profile_photos(),
    'main', case
      when p.main_photo_id is not null and exists (select 1 from profile_photos m where m.id = p.main_photo_id and m.face_match = 'matched') then 'matched'
      when p.pending_main_photo_id is not null then (select face_match::text from profile_photos where id = p.pending_main_photo_id)
      else 'none' end,
    'about_you', is_gender_option(p.gender) and coalesce(cardinality(p.seeking), 0) > 0,
    'prompt', exists (select 1 from prompt_answers a where a.profile_id = p.id),
    -- Was live before: "access paused", not "not live yet".
    'was_live', p.first_live_at is not null)
  from profiles p where p.id = auth.uid();
$$;

-- Answering the first prompt, or setting who they'd like to meet, can be
-- the step that makes a profile live: stamp it (and so start the women's
-- offer, 0035).
drop trigger if exists prompt_answers_stamp_first_live on public.prompt_answers;
create trigger prompt_answers_stamp_first_live after insert on public.prompt_answers
  for each row execute function public.stamp_first_live_trigger();
drop trigger if exists profiles_stamp_first_live_about_you on public.profiles;
create trigger profiles_stamp_first_live_about_you after update of gender, seeking on public.profiles
  for each row execute function public.stamp_first_live_trigger();

-- ---------------------------------------------------------------------------
-- 4. The six, replies, invites and profile access
-- ---------------------------------------------------------------------------

-- build_daily_feed: 0031's definition, plus (a) only LIVE candidates — a gap
-- since 0029 — and (b) each matches the other's preference.
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
      -- Only live members are ever shown (PRD §5.1.2) — missing since 0029.
      and profile_is_live(p.id)
      -- Each matches the other's "who you'd like to meet" (0036).
      and wants_each_other(p_profile_id, p.id)
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

-- profile_open_to: 0032's definition, plus each matching the other's
-- preference — no reply, invite or profile access across it.
create or replace function public.profile_open_to(p_viewer uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_viewer is null or p_owner is null then false
    when p_viewer = p_owner then true
    -- No live profile, no access (PRD §5.1.2), on both sides.
    when not profile_is_live(p_viewer) or not profile_is_live(p_owner) then false
    -- A block, either way, ends everything.
    when exists (
      select 1 from blocks b
      where (b.blocker_id = p_viewer and b.blocked_id = p_owner)
         or (b.blocker_id = p_owner and b.blocked_id = p_viewer)
    ) then false
    -- Each must match the other's "who you'd like to meet" (0036).
    when not wants_each_other(p_viewer, p_owner) then false
    -- An active couple: paused to everyone else, never to each other.
    when exists (
      select 1 from couples c
      where c.status = 'active'
        and ((c.member_a = p_viewer and c.member_b = p_owner)
          or (c.member_a = p_owner and c.member_b = p_viewer))
    ) then true
    when exists (select 1 from profiles o where o.id = p_owner and o.paused) then false
    else
      -- 1. In the viewer's six today.
      exists (
        select 1 from daily_feed f
        where f.profile_id = p_viewer and f.feed_date = current_date and f.candidate_id = p_owner
      )
      -- 2a. Replied to one of the viewer's prompt answers — counted only
      --     when the viewer may read that reply. A text reply to a Starter
      --     member is a locked message and must not name its sender.
      or exists (
        select 1 from replies r
        where r.sender_id = p_owner and r.recipient_id = p_viewer
          and (r.kind = 'gist_invite' or can_read_inbox(p_viewer))
      )
      -- 2b. Invited the viewer to a Gist, whatever happened next. Every plan.
      or exists (
        select 1 from gist_sessions g
        where g.proposer_id = p_owner and g.invitee_id = p_viewer
      )
      -- 3. Gist partners and matches, both ways: an invite still open, an
      --    accepted or live Gist, or one that happened.
      or exists (
        select 1 from gist_sessions g
        where ((g.proposer_id = p_owner and g.invitee_id = p_viewer)
            or (g.proposer_id = p_viewer and g.invitee_id = p_owner))
          and (g.status in ('accepted', 'live', 'completed')
               or (g.status = 'proposed' and g.created_at >= now() - interval '3 days'))
      )
  end;
$$;
revoke all on function public.profile_open_to(uuid, uuid) from public, anon, authenticated;

drop policy if exists "send a reply" on public.replies;
create policy "send a reply" on public.replies for insert
  with check (
    auth.uid() = sender_id
    and public.profile_is_live(auth.uid()) and public.profile_is_live(recipient_id)
    and exists (select 1 from prompt_answers a where a.id = prompt_answer_id and a.profile_id = recipient_id)
    and (kind <> 'text' or current_tier(auth.uid()) <> 'starter')
    -- Each matches the other's "who you'd like to meet" (0036).
    and public.wants_each_other_with(recipient_id)
    and not exists (select 1 from blocks b where (b.blocker_id = sender_id and b.blocked_id = recipient_id)
                                              or (b.blocker_id = recipient_id and b.blocked_id = sender_id)));

-- gist_invite: 0029's definition, plus each matching the other's preference.
create or replace function public.gist_invite(p_prompt_answer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_to uuid;
  v_id uuid;
begin
  -- No live profile, no access (PRD §5.1.2): sending a Gist invite.
  perform assert_live(auth.uid());
  if v_me is null then
    raise exception 'Please sign in again.' using errcode = '42501';
  end if;
  select profile_id into v_to from prompt_answers where id = p_prompt_answer_id;
  if v_to is null or v_to = v_me then
    raise exception 'That answer isn''t available.' using errcode = 'P0002';
  end if;
  -- Only someone in your six today, exactly like a reply.
  if not exists (
    select 1 from daily_feed f
    where f.profile_id = v_me and f.feed_date = current_date and f.candidate_id = v_to
  ) then
    raise exception 'You can invite people from today''s six.' using errcode = '42501';
  end if;
  if exists (
    select 1 from blocks b
    where (b.blocker_id = v_me and b.blocked_id = v_to) or (b.blocker_id = v_to and b.blocked_id = v_me)
  ) or not wants_each_other(v_me, v_to) then
    raise exception 'That answer isn''t available.' using errcode = 'P0002';
  end if;
  -- One open invite or Gist per pair at a time.
  if exists (
    select 1 from gist_sessions g
    where ((g.proposer_id = v_me and g.invitee_id = v_to) or (g.proposer_id = v_to and g.invitee_id = v_me))
      and g.status in ('proposed', 'accepted', 'live')
      and not (g.status = 'proposed' and g.created_at < now() - interval '3 days')
      -- A Gist whose time has run out is over, even before anyone answers
      -- "continue?" (status stays 'live' until then).
      and not (g.status = 'live' and g.ends_at is not null and g.ends_at < now())
  ) then
    raise exception 'You already have a Gist open with them.' using errcode = '23505';
  end if;
  if not gist_has_room(v_me) then
    raise exception 'Monthly voice Gist allowance reached' using errcode = '42501';
  end if;

  insert into gist_sessions (proposer_id, invitee_id, medium, prompt_answer_id)
  values (v_me, v_to, 'voice', p_prompt_answer_id)
  returning id into v_id;
  return v_id;
end;
$$;

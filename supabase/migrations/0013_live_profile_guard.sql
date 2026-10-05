-- Toastly — no live profile, no access (PRD §5.1.2, CLAUDE.md, Prompt 14).
--
-- "You can't look at people who can't see you." Until a member's own profile
-- is LIVE they cannot load a feed, see another member's profile or photos,
-- appear in anyone's feed, send or accept a Gist invite, message, or arrange
-- a date. Live means all four of:
--
--   1. phone confirmed
--   2. Verified Real passed (the liveness selfie)
--   3. at least four photos
--   4. a main photo that has been face-matched to the liveness selfie
--
-- Enforced HERE, in row-level security, trigger and function bodies, so the
-- rule holds for every client that can reach the database — not only for the
-- pages that happen to check it. The app checks it too, to explain itself
-- rather than render empty lists (lib/live-profile.ts).
--
-- Still allowed while not live, by construction (nothing below touches them):
-- verification, photo upload, account and privacy settings, the safety kit,
-- report and block. Toastly Help, data export and account deletion must not
-- call assert_live() either.
--
-- Decided 2026-10-05: while access is paused for PROFILE reasons, Couple Mode
-- stays available — it closes only if the account is restricted or removed
-- by review — and the coin balance stays viewable, with coins and plans still
-- purchasable. Stakes and dates stay blocked. So couples, couple_* and
-- coin_ledger are deliberately untouched here.
--
-- "Live" is computed, never stored. A stored flag is a second source of truth
-- that drifts the first time a code path forgets to update it; a computed one
-- means dropping below four photos or deleting the main photo hides the
-- profile and pauses access on the very next query, and restoring them
-- un-pauses it the same way.
--
-- Live is NOT the same as visible. `paused` (Couple Mode) hides a profile from
-- feeds while both members stay live and keep their Couple Mode space.
--
-- This file also closes three holes found while wiring the guard, each of
-- which would have made it bypassable:
--   * members could write their own `stage` (and so self-award Verified Real)
--     through the "own profile writable" policy, which had no column limit;
--   * build_daily_feed() was security definer and never checked that the
--     profile it built and returned was the caller's;
--   * settle_commitment() was executable by any member, for any commitment.

-- ---------------------------------------------------------------------------
-- 1. The photo state the rule reads
-- ---------------------------------------------------------------------------
--
-- Only the outcome of the face match is stored, never a face template
-- (PRD §5.1.2). The comparison itself (Smile ID) is not wired here — see
-- record_main_photo_match() below for the one function that writes it.

create type face_match_status as enum (
  'unchecked',  -- not nominated as the main photo
  'pending',    -- nominated; comparison running
  'review',     -- borderline: a person decides, never auto-rejected
  'matched',
  'mismatch'
);

alter table public.profile_photos
  add column face_match face_match_status not null default 'unchecked',
  add column face_checked_at timestamptz;

alter table public.profiles
  -- The main photo other members see. Always a matched photo, or null.
  add column main_photo_id uuid references public.profile_photos (id) on delete set null,
  -- A replacement main photo being checked. While it is, main_photo_id keeps
  -- serving the previously matched photo; the new one only replaces it once
  -- it matches (PRD §5.1.2). Never shown to anyone but its owner.
  add column pending_main_photo_id uuid references public.profile_photos (id) on delete set null,
  -- First time the profile went live. Lets the app tell "not live yet" (still
  -- onboarding) apart from "access paused" (was live, dropped below the bar).
  add column first_live_at timestamptz;

-- Four. A constant, like daily_match_count(): a minimum that moved per tier
-- or per member would stop being a trust floor.
create or replace function public.min_live_photos()
returns smallint
language sql
immutable
as $$ select 4::smallint $$;

-- ---------------------------------------------------------------------------
-- 2. Members cannot write their own verification or live state
-- ---------------------------------------------------------------------------
--
-- `current_user` is 'authenticated' (or 'anon') only when a member's own
-- request is writing the row. Security-definer functions, foreign-key
-- actions and the service role run as other roles, so verification results,
-- the face match and the photo pointers can still be written — by Toastly.

create or replace function public.protect_server_owned_profile_state()
returns trigger
language plpgsql
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.stage <> 'unverified'
       or new.phone_verified_at is not null
       or new.liveness_verified_at is not null
       or new.id_confirmed_at is not null
       or new.profession_verified_at is not null
       or new.main_photo_id is not null
       or new.pending_main_photo_id is not null
       or new.first_live_at is not null then
      raise exception 'Verification and live-profile state are set by Toastly, not by the client.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.stage is distinct from old.stage
     or new.phone_verified_at is distinct from old.phone_verified_at
     or new.liveness_verified_at is distinct from old.liveness_verified_at
     or new.id_confirmed_at is distinct from old.id_confirmed_at
     or new.profession_verified_at is distinct from old.profession_verified_at
     or new.main_photo_id is distinct from old.main_photo_id
     or new.pending_main_photo_id is distinct from old.pending_main_photo_id
     or new.first_live_at is distinct from old.first_live_at then
    raise exception 'Verification and live-profile state are set by Toastly, not by the client.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Named so it sorts first: BEFORE triggers fire alphabetically.
create trigger profiles_10_protect_server_owned_state
  before insert or update on public.profiles
  for each row execute function public.protect_server_owned_profile_state();

-- A member uploads photos and reorders them. They never set a face-match
-- result, and never repoint a row at a different file: swapping the bytes
-- under a matched main photo is exactly the catfish the match exists to stop.
create or replace function public.protect_face_match()
returns trigger
language plpgsql
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.face_match := 'unchecked';
    new.face_checked_at := null;
    return new;
  end if;

  if new.face_match is distinct from old.face_match
     or new.face_checked_at is distinct from old.face_checked_at
     or new.storage_path is distinct from old.storage_path
     or new.profile_id is distinct from old.profile_id then
    raise exception 'A photo''s file and face-match result cannot be changed by the client.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profile_photos_10_protect_face_match
  before insert or update on public.profile_photos
  for each row execute function public.protect_face_match();

-- The same protection at the file level. A file still referenced by a photo
-- row can be neither deleted nor re-uploaded, so the only way to change the
-- main photo's image is to delete its row — which takes the main photo, and
-- with it live status, away until a new one matches.
create or replace function public.photo_path_in_use(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profile_photos where storage_path = p_path);
$$;

drop policy "own profile photo files upload" on storage.objects;
create policy "own profile photo files upload"
  on storage.objects for insert
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not public.photo_path_in_use(name)
  );

drop policy "own profile photo files delete" on storage.objects;
create policy "own profile photo files delete"
  on storage.objects for delete
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not public.photo_path_in_use(name)
  );

-- With `stage` now server-owned, phone confirmation is recorded by
-- record_phone_verified() in 0014, together with the phone identity.

-- ---------------------------------------------------------------------------
-- 3. The rule, in one place
-- ---------------------------------------------------------------------------

-- Photos that count toward the four: everything except a replacement main
-- photo still being checked, which nobody but its owner can see.
create or replace function public.visible_photo_count(p_profile_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from profile_photos ph
  join profiles p on p.id = ph.profile_id
  where ph.profile_id = p_profile_id
    and ph.id is distinct from p.pending_main_photo_id;
$$;

create or replace function public.profile_is_live(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.phone_verified_at is not null
       and p.stage in ('verified_real', 'id_confirmed')
       and exists (
         select 1 from profile_photos m
         where m.id = p.main_photo_id
           and m.profile_id = p.id
           and m.face_match = 'matched'
       )
       and visible_photo_count(p.id) >= min_live_photos()
    from profiles p
    where p.id = p_profile_id
  ), false);
$$;

-- The guard every function-shaped route calls. PT403 makes PostgREST answer
-- HTTP 403 rather than a generic 400, so a direct API caller learns exactly
-- why, and the app can tell this apart from any other failure.
create or replace function public.assert_live(p_profile_id uuid default auth.uid())
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_profile_id is null or not profile_is_live(p_profile_id) then
    raise exception 'profile_not_live'
      using errcode = 'PT403',
            hint = 'No live profile, no access (PRD 5.1.2).';
  end if;
end;
$$;

-- What a member is told about their OWN profile. Takes no argument: it can
-- only ever describe the caller.
create or replace function public.live_profile_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'live', profile_is_live(p.id),
    'was_live', p.first_live_at is not null,
    'phone_confirmed', p.phone_verified_at is not null,
    'verified_real', p.stage in ('verified_real', 'id_confirmed'),
    'photo_count', visible_photo_count(p.id),
    'min_photos', min_live_photos(),
    -- 'matched' | 'checking' | 'missing'
    'main_photo', case
      when m.face_match = 'matched' then 'matched'
      when r.face_match in ('pending', 'review') then 'checking'
      else 'missing'
    end,
    -- A replacement being checked while the matched one stays live.
    'replacement_checking', m.face_match = 'matched'
                            and r.face_match in ('pending', 'review')
  )
  from profiles p
  left join profile_photos m on m.id = p.main_photo_id and m.profile_id = p.id
  left join profile_photos r on r.id = p.pending_main_photo_id and r.profile_id = p.id
  where p.id = auth.uid();
$$;

revoke all on function public.live_profile_status() from public, anon;
grant execute on function public.live_profile_status() to authenticated;

-- First time live. Recorded by triggers whenever something that could make a
-- profile live changes; never written by the member.
create or replace function public.stamp_first_live(p_profile_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update profiles
     set first_live_at = now()
   where id = p_profile_id
     and first_live_at is null
     and profile_is_live(p_profile_id);
$$;

create or replace function public.stamp_first_live_from_photo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform stamp_first_live(coalesce(new.profile_id, old.profile_id));
  return null;
end;
$$;

create trigger profile_photos_stamp_first_live
  after insert or update or delete on public.profile_photos
  for each row execute function public.stamp_first_live_from_photo();

create or replace function public.stamp_first_live_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform stamp_first_live(new.id);
  return null;
end;
$$;

-- Column-scoped, so the stamp's own update of first_live_at does not re-fire it.
create trigger profiles_stamp_first_live
  after update of stage, phone_verified_at, main_photo_id, pending_main_photo_id
  on public.profiles
  for each row execute function public.stamp_first_live_from_profile();

-- ---------------------------------------------------------------------------
-- 4. The main photo: nominate, then match
-- ---------------------------------------------------------------------------

-- The member picks which of their photos is the main one. It becomes the
-- pending candidate; it is never shown as the main photo until it matches.
-- If a matched main photo already exists, it stays live meanwhile.
create or replace function public.nominate_main_photo(p_photo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_prev uuid;
begin
  if v_me is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  if not exists (select 1 from profile_photos where id = p_photo_id and profile_id = v_me) then
    raise exception 'That photo is not yours.' using errcode = '42501';
  end if;

  if (select main_photo_id from profiles where id = v_me) = p_photo_id then
    return;  -- already the live main photo
  end if;

  select pending_main_photo_id into v_prev from profiles where id = v_me;
  if v_prev is not null and v_prev <> p_photo_id then
    update profile_photos set face_match = 'unchecked', face_checked_at = null
     where id = v_prev and face_match in ('pending', 'review');
  end if;

  update profile_photos set face_match = 'pending', face_checked_at = null
   where id = p_photo_id;
  update profiles set pending_main_photo_id = p_photo_id where id = v_me;
end;
$$;

revoke all on function public.nominate_main_photo(uuid) from public, anon;
grant execute on function public.nominate_main_photo(uuid) to authenticated;

-- Records the face-match outcome. SERVICE ROLE ONLY — called by the server
-- once the comparison returns, never by a member. Smile ID is not wired yet
-- (Prompt 14); until it is, nothing calls this outside tests.
--
--   matched  -> the pending photo becomes the main photo; the previously
--               matched one stays in the set as an ordinary photo
--   review   -> stays pending; a person decides. Never auto-rejected.
--   mismatch -> the pending photo is dropped as a candidate; any previously
--               matched main photo stays live
create or replace function public.record_main_photo_match(
  p_photo_id uuid,
  p_outcome face_match_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if p_outcome not in ('matched', 'review', 'mismatch') then
    raise exception 'Not a match outcome: %', p_outcome;
  end if;

  select profile_id into v_owner from profile_photos where id = p_photo_id;
  if v_owner is null then
    raise exception 'No such photo.';
  end if;
  if (select pending_main_photo_id from profiles where id = v_owner) is distinct from p_photo_id then
    raise exception 'That photo is not the pending main photo.';
  end if;

  update profile_photos
     set face_match = p_outcome, face_checked_at = now()
   where id = p_photo_id;

  if p_outcome = 'matched' then
    update profiles
       set main_photo_id = p_photo_id, pending_main_photo_id = null
     where id = v_owner;
  elsif p_outcome = 'mismatch' then
    update profiles set pending_main_photo_id = null where id = v_owner;
  end if;
end;
$$;

revoke all on function public.record_main_photo_match(uuid, face_match_status) from public, anon, authenticated;
grant execute on function public.record_main_photo_match(uuid, face_match_status) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Profile view: other members, their answers and their photos
-- ---------------------------------------------------------------------------

drop policy "verified members see other verified profiles" on public.profiles;
create policy "live members see other live profiles"
  on public.profiles for select
  using (
    paused = false
    and public.profile_is_live(id)
    and public.profile_is_live(auth.uid())
  );

drop policy "answers of today's candidates readable" on public.prompt_answers;
create policy "answers of today's candidates readable" on public.prompt_answers for select
  using (
    public.profile_is_live(auth.uid())
    and public.profile_is_live(prompt_answers.profile_id)
    and exists (
      select 1 from public.daily_feed f
      where f.profile_id = auth.uid()
        and f.feed_date = current_date
        and f.candidate_id = prompt_answers.profile_id
    )
  );

-- Photos. Viewer AND owner must be live: a hidden profile's photos are
-- hidden with it. Everything else is 0007's rule unchanged.
create or replace function public.can_see_photos(p_viewer uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_viewer is null or p_owner is null then false
    when p_viewer = p_owner then true
    when exists (
      select 1 from blocks b
      where (b.blocker_id = p_owner and b.blocked_id = p_viewer)
         or (b.blocker_id = p_viewer and b.blocked_id = p_owner)
    ) then false
    -- No live profile, no access — and a profile that isn't live is hidden.
    when not profile_is_live(p_viewer) then false
    when not profile_is_live(p_owner) then false
    else coalesce((
      select case o.photo_reveal
        when 'verified_members' then true
        when 'after_i_reply' then
          exists (
            select 1 from replies r
            where r.sender_id = p_owner and r.recipient_id = p_viewer
          )
          or exists (
            select 1 from gist_sessions g
            where (g.proposer_id = p_owner and g.invitee_id = p_viewer
                   and g.status not in ('declined', 'cancelled', 'expired'))
               or (g.invitee_id = p_owner and g.proposer_id = p_viewer
                   and g.status in ('accepted', 'live', 'completed'))
          )
        when 'after_gist' then exists (
          select 1 from gist_sessions g
          where g.status = 'completed'
            and ((g.proposer_id = p_owner and g.invitee_id = p_viewer)
              or (g.invitee_id = p_owner and g.proposer_id = p_viewer))
            and gist_mutual_continue(g.id)
        )
        else false
      end
      from profiles o
      where o.id = p_owner
    ), false)
  end;
$$;

-- A replacement main photo still being checked is its owner's alone.
create or replace function public.is_pending_main_photo(p_photo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where pending_main_photo_id = p_photo_id);
$$;

drop policy "photos visible per the owner's reveal choice" on public.profile_photos;
create policy "photos visible per the owner's reveal choice"
  on public.profile_photos for select
  using (
    public.can_see_photos(auth.uid(), profile_id)
    and (auth.uid() = profile_id or not public.is_pending_main_photo(id))
  );

create or replace function public.can_see_photo_file(p_viewer uuid, p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when try_uuid((storage.foldername(p_path))[1]) = p_viewer then true
    else can_see_photos(p_viewer, try_uuid((storage.foldername(p_path))[1]))
         and not exists (
           select 1 from profile_photos ph
           join profiles p on p.pending_main_photo_id = ph.id
           where ph.storage_path = p_path
         )
  end;
$$;

drop policy "profile photo files follow reveal rules" on storage.objects;
create policy "profile photo files follow reveal rules"
  on storage.objects for select
  using (
    bucket_id = 'profile-photos'
    and public.can_see_photo_file(auth.uid(), name)
  );

-- ---------------------------------------------------------------------------
-- 6. Feed
-- ---------------------------------------------------------------------------

drop policy "own feed readable" on public.daily_feed;
create policy "own feed readable" on public.daily_feed for select
  using (auth.uid() = profile_id and public.profile_is_live(auth.uid()));

-- 0012's feed, with three changes and nothing else:
--   * it builds and returns only the CALLER's feed (it was security definer
--     and trusted p_profile_id, so anyone could read anyone's six);
--   * the caller must be live;
--   * candidates must be live — replacing the old verified-only test — and
--     a candidate who stops being live later in the day drops out of the six
--     already built, rather than lingering as an empty card.
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

  select pool, country_code into v_pool, v_country from profiles where id = p_profile_id;
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
-- 7. Invites: replies and Gist sessions
-- ---------------------------------------------------------------------------

drop policy "own sent replies" on public.replies;
create policy "own sent replies" on public.replies for select
  using (auth.uid() = sender_id and public.profile_is_live(auth.uid()));

-- Replies had NO insert policy, so replyToAnswer() was refused for every
-- member. This is that policy, written with the guard in it. The answer
-- lookup runs under the sender's own row-level security, so a member can
-- only reply to an answer they were actually shown today.
create policy "live members reply to live members" on public.replies for insert
  with check (
    auth.uid() = sender_id
    and public.profile_is_live(auth.uid())
    and public.profile_is_live(recipient_id)
    and exists (
      select 1 from public.prompt_answers pa
      where pa.id = prompt_answer_id and pa.profile_id = recipient_id
    )
  );

drop policy "participants see their sessions" on public.gist_sessions;
create policy "participants see their sessions" on public.gist_sessions for select
  using (
    (auth.uid() = proposer_id or auth.uid() = invitee_id)
    and public.profile_is_live(auth.uid())
  );

drop policy "members propose their own sessions" on public.gist_sessions;
create policy "members propose their own sessions" on public.gist_sessions for insert
  with check (
    auth.uid() = proposer_id
    and public.profile_is_live(auth.uid())
    and public.profile_is_live(invitee_id)
  );

drop policy "participants update their sessions" on public.gist_sessions;
create policy "participants update their sessions" on public.gist_sessions for update
  using (
    (auth.uid() = proposer_id or auth.uid() = invitee_id)
    and public.profile_is_live(auth.uid())
  );

-- Whoever writes the row, a session only starts or moves forward between two
-- live members. Declining or cancelling stays possible, so a live member is
-- never stuck with an invite from someone whose profile has since hidden.
create or replace function public.enforce_gist_live()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_forward boolean;
begin
  if tg_op = 'INSERT' then
    v_forward := true;
  else
    v_forward := (new.status in ('accepted', 'live') and new.status is distinct from old.status)
              or new.proposer_ready_at is distinct from old.proposer_ready_at
              or new.invitee_ready_at is distinct from old.invitee_ready_at;
  end if;

  if v_forward
     and not (profile_is_live(new.proposer_id) and profile_is_live(new.invitee_id)) then
    raise exception 'profile_not_live'
      using errcode = 'PT403',
            hint = 'Both people need a live profile for a Gist (PRD 5.1.2).';
  end if;
  return new;
end;
$$;

create trigger gist_sessions_require_live
  before insert or update on public.gist_sessions
  for each row execute function public.enforce_gist_live();

drop policy "own outcome writable" on public.gist_outcomes;
create policy "own outcome writable" on public.gist_outcomes for insert
  with check (auth.uid() = profile_id and public.profile_is_live(auth.uid()));

drop policy "own outcome readable" on public.gist_outcomes;
create policy "own outcome readable" on public.gist_outcomes for select
  using (auth.uid() = profile_id and public.profile_is_live(auth.uid()));

-- ---------------------------------------------------------------------------
-- 8. Messages
-- ---------------------------------------------------------------------------

drop policy "participants see their threads" on public.threads;
create policy "participants see their threads" on public.threads for select
  using (
    (auth.uid() = member_a or auth.uid() = member_b)
    and public.profile_is_live(auth.uid())
  );

drop policy "readable only by entitled participants" on public.messages;
create policy "readable only by entitled participants" on public.messages for select
  using (
    public.profile_is_live(auth.uid())
    and can_read_inbox(auth.uid())
    and exists (
      select 1 from public.threads t
      where t.id = messages.thread_id
        and (t.member_a = auth.uid() or t.member_b = auth.uid())
    )
  );

drop policy "entitled members send" on public.messages;
create policy "entitled members send" on public.messages for insert
  with check (
    auth.uid() = sender_id
    and public.profile_is_live(auth.uid())
    and exists (
      select 1 from public.threads t
      where t.id = messages.thread_id
        and (t.member_a = auth.uid() or t.member_b = auth.uid())
        and public.profile_is_live(
          case when t.member_a = auth.uid() then t.member_b else t.member_a end
        )
    )
  );

-- The locked-inbox count is still a count — but only for a live member.
create or replace function public.unread_count()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform assert_live(auth.uid());
  return (
    select count(*)::int
    from messages m
    join threads t on t.id = m.thread_id
    where m.read_at is null
      and m.sender_id <> auth.uid()
      and (t.member_a = auth.uid() or t.member_b = auth.uid())
  );
end;
$$;

revoke all on function public.unread_count() from public, anon;
grant execute on function public.unread_count() to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Dates: spots and commitments
-- ---------------------------------------------------------------------------

-- Both people in a session are live.
create or replace function public.gist_pair_live(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select profile_is_live(g.proposer_id) and profile_is_live(g.invitee_id)
    from gist_sessions g where g.id = p_session_id
  ), false);
$$;

drop policy "own session spots readable" on public.date_spots;
create policy "own session spots readable" on public.date_spots
  for select using (
    in_gist_session(session_id, auth.uid())
    and public.profile_is_live(auth.uid())
  );

drop policy "own session spots writable" on public.date_spots;
create policy "own session spots writable" on public.date_spots
  for insert with check (
    in_gist_session(session_id, auth.uid())
    and public.profile_is_live(auth.uid())
    and public.gist_pair_live(session_id)
  );

drop policy "own session spots updatable" on public.date_spots;
create policy "own session spots updatable" on public.date_spots
  for update using (
    in_gist_session(session_id, auth.uid())
    and public.profile_is_live(auth.uid())
  )
  with check (
    in_gist_session(session_id, auth.uid())
    and public.profile_is_live(auth.uid())
    and public.gist_pair_live(session_id)
  );

drop policy "own commitments" on public.date_commitments;
create policy "own commitments" on public.date_commitments for select
  using (
    (auth.uid() = member_a or auth.uid() = member_b)
    and public.profile_is_live(auth.uid())
  );

-- No client writes commitments today. Whatever path creates one later — a
-- client policy or the service role — a date is only arranged between two
-- live members.
create or replace function public.enforce_commitment_live()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (profile_is_live(new.member_a) and profile_is_live(new.member_b)) then
    raise exception 'profile_not_live'
      using errcode = 'PT403',
            hint = 'Both people need a live profile to arrange a date (PRD 5.1.2).';
  end if;
  return new;
end;
$$;

create trigger date_commitments_require_live
  before insert on public.date_commitments
  for each row execute function public.enforce_commitment_live();

-- Settling moves coins. It was executable by any member, for any
-- commitment; it is a server-side operation and nothing in the app calls it.
revoke all on function public.settle_commitment(uuid, commitment_status, uuid)
  from public, anon, authenticated;
grant execute on function public.settle_commitment(uuid, commitment_status, uuid)
  to service_role;

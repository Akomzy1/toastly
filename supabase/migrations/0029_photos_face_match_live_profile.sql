-- Toastly — profile photos, the main-photo face match, and "no live profile,
-- no access" (PRD §5.1.2, Prompt 14). Ported from live-profile-and-prompt-14
-- (6 October 2026) onto main's Smile ID integration.
--
-- A profile is LIVE when: the phone is confirmed, Verified Real is passed,
-- the account isn't restricted, there are at least 4 photos (max 6, both in
-- match_config), and the main photo matched the member's live selfie. Until
-- then a member can't load the feed, see another profile, appear in anyone's
-- six, send or accept Gist invites, message, or arrange dates. Verification,
-- photos, Toastly Help, settings, data export and deletion stay open; so do
-- Couple Mode, the coin balance and buying, and attendance and safety on a
-- date already arranged (decided 5 October 2026).
--
-- The match (decided 5 October 2026): Smile ID's hosted flow can't compare a
-- photo with an enrolled face (main parked Prompt 14 on exactly this), so
-- the selfie is captured in the page with Smile ID's own camera component
-- and sent to its REST API:
--   * onboarding — photos first, then ONE selfie: SmartSelfie Compare against
--     the main photo, enrolling the member; it settles Verified Real (the
--     liveness half) and the main photo together;
--   * replacing a matched main photo — a FRESH selfie, two jobs: Authentication
--     (is this the enrolled member?) and Compare (is the new photo them?).
--     A replacement never enrols.
-- Both are verification_sessions rows; the selfie and frames pass through to
-- Smile ID and are never stored. Toastly keeps outcomes only — never an image,
-- a score or a face template. The previously matched main photo stays live
-- while a replacement is checked. Borderline goes to a person, never an
-- automatic rejection.

alter type report_reason add value if not exists 'photos_not_them';
alter type trust_event_kind add value if not exists 'verification_drift';

-- ---------------------------------------------------------------------------
-- 1. Photo state, and the numbers in config
-- ---------------------------------------------------------------------------

do $$ begin
  create type face_match_status as enum ('unchecked', 'pending', 'matched', 'review', 'mismatch');
exception when duplicate_object then null; end $$;

alter table public.profile_photos
  add column if not exists face_match face_match_status not null default 'unchecked',
  add column if not exists face_checked_at timestamptz,
  add column if not exists face_match_reason text
    check (face_match_reason in ('face_not_clear', 'not_matching', 'not_same_person'));
comment on column public.profile_photos.face_match_reason is
  'Why a main photo was not confirmed. A category only — never a score or an image.';

alter table public.profiles
  add column if not exists main_photo_id uuid references public.profile_photos (id) on delete set null,
  add column if not exists pending_main_photo_id uuid references public.profile_photos (id) on delete set null,
  add column if not exists first_live_at timestamptz;

-- "Max from config, default 6" (PRD §5.1.2); four to go live.
alter table public.match_config
  add column if not exists photos_min smallint not null default 4 check (photos_min >= 1),
  add column if not exists photos_max smallint not null default 6 check (photos_max between 4 and 6);

create or replace function public.min_live_photos()
returns integer language sql stable security definer set search_path = public as $$
  select coalesce((select photos_min from match_config), 4)::int;
$$;
create or replace function public.max_profile_photos()
returns integer language sql stable security definer set search_path = public as $$
  select coalesce((select photos_max from match_config), 6)::int;
$$;

-- Six visible photos; one more row is allowed so a member with six can still
-- put a replacement main photo up for checking (the old one leaves on a match).
create or replace function public.enforce_photo_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from profile_photos where profile_id = new.profile_id) >= max_profile_photos() + 1 then
    raise exception 'photo_limit' using errcode = '23514', hint = 'Up to six photos (PRD 5.1.2).';
  end if;
  return new;
end;
$$;
drop trigger if exists profile_photos_20_limit on public.profile_photos;
create trigger profile_photos_20_limit before insert on public.profile_photos
  for each row execute function public.enforce_photo_limit();

-- ---------------------------------------------------------------------------
-- 2. Members can't write the result, or point their profile at a photo
-- ---------------------------------------------------------------------------

create or replace function public.protect_face_match()
returns trigger language plpgsql as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.face_match := 'unchecked';
    new.face_checked_at := null;
    new.face_match_reason := null;
    return new;
  end if;
  if new.face_match is distinct from old.face_match
     or new.face_checked_at is distinct from old.face_checked_at
     or new.face_match_reason is distinct from old.face_match_reason
     or new.storage_path is distinct from old.storage_path
     or new.profile_id is distinct from old.profile_id then
    raise exception 'A photo''s file and face-match result are recorded by Toastly.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists profile_photos_10_protect_face_match on public.profile_photos;
create trigger profile_photos_10_protect_face_match before insert or update on public.profile_photos
  for each row execute function public.protect_face_match();

create or replace function public.guard_photo_pointers()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.main_photo_id is distinct from old.main_photo_id
    or new.pending_main_photo_id is distinct from old.pending_main_photo_id
    or new.first_live_at is distinct from old.first_live_at) then
    raise exception 'The main photo is set through nominate_main_photo().' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_photo_pointers on public.profiles;
create trigger guard_photo_pointers before update of main_photo_id, pending_main_photo_id, first_live_at on public.profiles
  for each row execute function public.guard_photo_pointers();

-- ---------------------------------------------------------------------------
-- 3. The live rule, in one place
-- ---------------------------------------------------------------------------

-- A candidate being checked, or one that wasn't confirmed, is private until
-- the member chooses otherwise ("Use it as another photo").
create or replace function public.is_hidden_candidate(p_photo_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where pending_main_photo_id = p_photo_id)
      or exists (select 1 from profile_photos where id = p_photo_id and face_match = 'mismatch');
$$;

create or replace function public.visible_photo_count(p_profile_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int
    from profile_photos ph join profiles p on p.id = ph.profile_id
   where ph.profile_id = p_profile_id
     and ph.id is distinct from p.pending_main_photo_id
     and ph.face_match <> 'mismatch';
$$;

create or replace function public.profile_is_live(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.phone_verified_at is not null
       and p.stage in ('verified_real', 'id_confirmed')
       and not is_restricted(p.id)
       and p.main_photo_id is not null
       and exists (select 1 from profile_photos m where m.id = p.main_photo_id and m.face_match = 'matched')
       and visible_photo_count(p.id) >= min_live_photos()
      from profiles p where p.id = p_profile_id), false);
$$;
revoke all on function public.profile_is_live(uuid) from public, anon;
grant execute on function public.profile_is_live(uuid) to authenticated, service_role;

-- Refuses with HTTP 403 through PostgREST (PT403).
create or replace function public.assert_live(p_profile_id uuid default auth.uid())
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not profile_is_live(p_profile_id) then
    raise exception 'Your profile isn''t live yet.' using errcode = 'PT403',
      hint = 'Finish verification and photos to use the feed, Gists, messages and dates.';
  end if;
end;
$$;
revoke all on function public.assert_live(uuid) from public, anon;
grant execute on function public.assert_live(uuid) to authenticated, service_role;

-- What the "not live yet" / "access paused" screens need, for the caller only.
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
    -- Was live before: "access paused", not "not live yet".
    'was_live', p.first_live_at is not null)
  from profiles p where p.id = auth.uid();
$$;
revoke all on function public.live_profile_status() from public, anon;
grant execute on function public.live_profile_status() to authenticated;

create or replace function public.stamp_first_live(p_profile_id uuid)
returns void language sql security definer set search_path = public as $$
  update profiles set first_live_at = now()
   where id = p_profile_id and first_live_at is null and profile_is_live(p_profile_id);
$$;
revoke all on function public.stamp_first_live(uuid) from public, anon, authenticated;

create or replace function public.stamp_first_live_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'profiles' then
    perform stamp_first_live(new.id);
  else
    perform stamp_first_live(new.profile_id);
  end if;
  return null;
end;
$$;
drop trigger if exists profiles_stamp_first_live on public.profiles;
create trigger profiles_stamp_first_live after update of stage, main_photo_id, phone_verified_at on public.profiles
  for each row execute function public.stamp_first_live_trigger();
drop trigger if exists profile_photos_stamp_first_live on public.profile_photos;
create trigger profile_photos_stamp_first_live after insert or update of face_match on public.profile_photos
  for each row execute function public.stamp_first_live_trigger();

-- ---------------------------------------------------------------------------
-- 4. The main photo: nominate, check, record
-- ---------------------------------------------------------------------------

-- A photo goes to a person. Cases are one per source row, so a photo that was
-- already decided and comes back (chosen again, checked again) reopens its
-- case with a timeline entry rather than silently not reaching anyone.
create or replace function public._queue_photo_review(p_owner uuid, p_photo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_item uuid;
begin
  select id into v_item from review_items where source_table = 'profile_photos' and source_id = p_photo;
  if v_item is null then
    perform _queue('photo_match', p_owner, 'profile_photos', p_photo, null);
  else
    update review_items
       set stage = 'new', status = 'open', decision = null, decided_at = null, decided_by = null, assigned_to = null
     where id = v_item and stage in ('decided', 'waiting_member');
    if found then
      insert into case_events (review_item_id, actor_label, actor_role, what, why)
      values (v_item, 'System', 'Automatic', 'Raised again', 'The same photo came back for a person to check.');
    end if;
  end if;
end;
$$;
revoke all on function public._queue_photo_review(uuid, uuid) from public, anon, authenticated;

-- The member picks a photo as their main photo. It's checked before it shows:
-- until then the previously matched main photo (if any) stays live.
create or replace function public.nominate_main_photo(p_photo_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if not exists (select 1 from profile_photos where id = p_photo_id and profile_id = v_me) then
    raise exception 'That photo isn''t yours.' using errcode = '42501';
  end if;
  if (select main_photo_id from profiles where id = v_me) = p_photo_id then
    raise exception 'That''s already your main photo.' using errcode = '22023';
  end if;
  -- A previous candidate that hadn't been decided goes back to an ordinary photo.
  update profile_photos set face_match = 'unchecked', face_match_reason = null, face_checked_at = null
   where id = (select pending_main_photo_id from profiles where id = v_me) and id <> p_photo_id
     and face_match in ('pending', 'review');
  update profile_photos set face_match = 'pending', face_match_reason = null, face_checked_at = null where id = p_photo_id;
  update profiles set pending_main_photo_id = p_photo_id where id = v_me;
end;
$$;
revoke all on function public.nominate_main_photo(uuid) from public, anon;
grant execute on function public.nominate_main_photo(uuid) to authenticated;

-- SERVICE ROLE ONLY. Returns the storage path of a main photo that was
-- REPLACED, so the server can delete that file too.
--   matched  -> the candidate becomes the main photo; the old one is removed
--   review   -> stays pending; a person decides (a 'photo_match' case)
--   mismatch -> dropped as a candidate, with a reason; any matched main photo
--               stays live. After a first match, a mismatch is a Sentinel
--               "verification drift" event.
create or replace function public.record_main_photo_match(p_photo_id uuid, p_outcome face_match_status, p_reason text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_old_main uuid;
  v_old_path text;
begin
  if p_outcome not in ('matched', 'review', 'mismatch') then raise exception 'Not a match outcome: %', p_outcome; end if;
  if p_outcome = 'mismatch' and p_reason is null then raise exception 'A mismatch needs a reason.'; end if;
  select profile_id into v_owner from profile_photos where id = p_photo_id;
  if v_owner is null then raise exception 'No such photo.'; end if;
  if (select pending_main_photo_id from profiles where id = v_owner) is distinct from p_photo_id then
    raise exception 'That photo is not the pending main photo.';
  end if;

  update profile_photos
     set face_match = p_outcome, face_checked_at = now(),
         face_match_reason = case when p_outcome = 'mismatch' then p_reason end
   where id = p_photo_id;

  if p_outcome = 'matched' then
    select main_photo_id into v_old_main from profiles where id = v_owner;
    update profiles set main_photo_id = p_photo_id, pending_main_photo_id = null where id = v_owner;
    if v_old_main is not null and v_old_main <> p_photo_id then
      delete from profile_photos where id = v_old_main returning storage_path into v_old_path;
    end if;
    update profile_photos set position = 0 where id = p_photo_id;
  elsif p_outcome = 'review' then
    perform _queue_photo_review(v_owner, p_photo_id);
  else
    if (select main_photo_id from profiles where id = v_owner) is not null then
      perform emit_trust_event(v_owner, null, 'verification_drift', jsonb_build_object('reason', p_reason));
    end if;
    update profiles set pending_main_photo_id = null where id = v_owner;
  end if;
  return v_old_path;
end;
$$;
revoke all on function public.record_main_photo_match(uuid, face_match_status, text) from public, anon, authenticated;
grant execute on function public.record_main_photo_match(uuid, face_match_status, text) to service_role;

-- "Ask a person to look" — only when the photo didn't look like the selfie.
-- A face that isn't clear is fixed by choosing another photo.
create or replace function public.request_photo_review(p_photo_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if not exists (select 1 from profile_photos where id = p_photo_id and profile_id = v_me
                   and face_match = 'mismatch' and face_match_reason = 'not_matching') then
    raise exception 'That photo can''t be sent for review.' using errcode = '42501';
  end if;
  update profile_photos set face_match = 'review', face_match_reason = null where id = p_photo_id;
  update profiles set pending_main_photo_id = p_photo_id where id = v_me;
  perform _queue_photo_review(v_me, p_photo_id);
end;
$$;
revoke all on function public.request_photo_review(uuid) from public, anon;
grant execute on function public.request_photo_review(uuid) to authenticated;

-- "Use it as another photo": a candidate that wasn't confirmed stays in the set.
create or replace function public.keep_as_other_photo(p_photo_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profile_photos where id = p_photo_id and profile_id = auth.uid() and face_match = 'mismatch') then
    raise exception 'That photo can''t be moved.' using errcode = '42501';
  end if;
  update profile_photos set face_match = 'unchecked', face_match_reason = null, face_checked_at = null where id = p_photo_id;
end;
$$;
revoke all on function public.keep_as_other_photo(uuid) from public, anon;
grant execute on function public.keep_as_other_photo(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The selfie checks are verification sessions
-- ---------------------------------------------------------------------------

alter table public.verification_sessions
  add column if not exists photo_id uuid references public.profile_photos (id) on delete set null,
  -- reverify: a re-check a reviewer asked for — Authentication only, against
  -- the face the onboarding selfie enrolled (decided 6 October 2026).
  -- id_kyc + id_auth: the optional ID check, in the page — Biometric KYC
  -- against the official record AND Authentication of the same capture
  -- against the registered face; the ring needs both (record_id_check).
  add column if not exists step text check (step in ('onboard', 'authenticate', 'compare', 'reverify', 'id_kyc', 'id_auth')),
  add column if not exists check_id uuid;
alter table public.verification_sessions drop constraint if exists verification_sessions_product_check;
alter table public.verification_sessions add constraint verification_sessions_product_check
  check (product in ('smartselfie', 'biometric_kyc', 'photo_match'));
create index if not exists verification_sessions_check_idx on public.verification_sessions (check_id) where check_id is not null;

-- The member's main-photo check, for the photo screens. Caller only.
create or replace function public.main_photo_check()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'main_photo_id', p.main_photo_id,
    'candidate_id', c.id,
    'candidate_state', c.face_match,
    'candidate_reason', c.face_match_reason,
    'check_running', exists (select 1 from verification_sessions s
                              where s.photo_id = c.id and s.status in ('started', 'submitted')))
  from profiles p
  left join lateral (
    select ph.id, ph.face_match, ph.face_match_reason from profile_photos ph
     where ph.profile_id = p.id
       and (ph.id = p.pending_main_photo_id or (ph.face_match = 'mismatch' and ph.face_checked_at is not null))
     order by (ph.id = p.pending_main_photo_id) desc, ph.face_checked_at desc nulls last
     limit 1
  ) c on true
  where p.id = auth.uid();
$$;
revoke all on function public.main_photo_check() from public, anon;
grant execute on function public.main_photo_check() to authenticated;

-- The ONE onboarding selfie's result. SERVICE ROLE ONLY.
--   p_live 'passed' -> Verified Real (phone confirmed first); 'review' -> a
--          person decides (main's selfie_review case); 'retake' -> nothing.
-- A live person whose photo doesn't match still earns Verified Real — the
-- seal says a real person is behind the phone, which is true — but the
-- profile stays hidden until a main photo that IS them matches.
create or replace function public.record_onboarding_check(p_session uuid, p_live text, p_match face_match_status, p_reason text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  s verification_sessions;
begin
  if p_live not in ('passed', 'review', 'retake') then raise exception 'Not a liveness outcome: %', p_live; end if;
  select * into s from verification_sessions where id = p_session;
  if not found or s.step is distinct from 'onboard' or s.photo_id is null then raise exception 'Not an onboarding selfie.'; end if;
  if p_live = 'passed' then
    update profiles
       set stage = case when stage = 'phone_verified' then 'verified_real' else stage end,
           liveness_verified_at = now()
     where id = s.profile_id and phone_verified_at is not null;
  end if;
  if p_live = 'retake' and p_match <> 'mismatch' then return null; end if;
  -- A borderline liveness result decides the photo with it: the case is the
  -- selfie review, and a person's decision settles both (see below).
  if p_live = 'review' then
    update profile_photos set face_match = 'review' where id = s.photo_id;
    return null;
  end if;
  return record_main_photo_match(s.photo_id, p_match, p_reason);
end;
$$;
revoke all on function public.record_onboarding_check(uuid, text, face_match_status, text) from public, anon, authenticated;
grant execute on function public.record_onboarding_check(uuid, text, face_match_status, text) to service_role;

-- The optional ID check's result (decided 6 October 2026). SERVICE ROLE ONLY,
-- and called by the review trigger below. The second ring is granted only
-- when BOTH halves of one capture are clear: Biometric KYC (the number is on
-- the official record and the selfie matches its photo) AND Authentication
-- (the same selfie is the face registered at onboarding). One ID, one
-- account: the fingerprint is bound here, and a member who checks a
-- different ID gives up the old binding.
create or replace function public.record_id_check(p_check uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  k verification_sessions;
  a verification_sessions;
  v_owner uuid;
begin
  select * into k from verification_sessions where check_id = p_check and step = 'id_kyc';
  select * into a from verification_sessions where check_id = p_check and step = 'id_auth';
  if k.id is null or a.id is null then raise exception 'Not an ID check.'; end if;
  if k.status <> 'clear' or a.status <> 'clear' or k.id_hash is null then return 'not_clear'; end if;

  select profile_id into v_owner from verified_id_hashes where id_hash = k.id_hash;
  if (v_owner is not null and v_owner <> k.profile_id)
     or exists (select 1 from blocked_id_hashes b where b.id_hash = k.id_hash) then
    update verification_sessions set status = 'block', passed = false, result_code = 'id_already_used', id_hash = null where id = k.id;
    return 'id_already_used';
  end if;

  delete from verified_id_hashes where profile_id = k.profile_id and id_hash <> k.id_hash;
  insert into verified_id_hashes (id_hash, profile_id, id_type, verified_at)
  values (k.id_hash, k.profile_id, k.id_type, now())
  on conflict (id_hash) do nothing;
  update profiles set stage = 'id_confirmed', id_confirmed_at = now()
   where id = k.profile_id and stage = 'verified_real';
  return 'confirmed';
end;
$$;
revoke all on function public.record_id_check(uuid) from public, anon, authenticated;
grant execute on function public.record_id_check(uuid) to service_role;

-- Three failed matches against the registered face in 24 hours go to a
-- person instead of a fourth try (decided 6 October 2026): the third refusal
-- of a re-check, or of an ID check's selfie, becomes 'attention' with reason
-- 'repeated_mismatch', and queue_from_source hands it to a reviewer (a
-- selfie review or an ID review). While it waits, the member sees "a person
-- is taking a look" and the server refuses another attempt. A reviewer's
-- 'clear' settles it as clear; any other decision returns it to a refusal,
-- so the member can try again — and a further failure goes straight back.
create or replace function public.route_repeated_mismatch()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  if new.step in ('reverify', 'id_auth') and new.status = 'block'
     and old.status in ('started', 'submitted') then
    select count(*) into v_n from verification_sessions s
     where s.profile_id = new.profile_id and s.step = new.step and s.id <> new.id
       and s.created_at > now() - interval '24 hours'
       and (s.status = 'block' or (s.status = 'attention' and s.result_code = 'repeated_mismatch'));
    if v_n >= 2 then
      new.status := 'attention';
      new.result_code := 'repeated_mismatch';
      new.passed := false;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.route_repeated_mismatch() from public, anon, authenticated;
drop trigger if exists route_repeated_mismatch on public.verification_sessions;
create trigger route_repeated_mismatch before update of status on public.verification_sessions
  for each row execute function public.route_repeated_mismatch();

-- A person's decision settles the photo and, for an onboarding selfie, Verified
-- Real. main's staff_decide closes the case; this applies what it means:
--   photo_match:  clear -> matched; anything else -> not matching
--   selfie_review on an onboarding selfie: clear -> live and matched
-- It also releases a blocklist entry held for a review that was cleared.
create or replace function public.apply_review_outcome()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s verification_sessions;
  v_path text;
begin
  -- A photo case is settled when it's decided, or when a person asks for a
  -- fresh selfie (main's 'request re-verification' waits on the member).
  if new.kind = 'photo_match' and new.source_table = 'profile_photos'
     and new.stage in ('decided', 'waiting_member') and old.stage not in ('decided', 'waiting_member') then
    begin
      v_path := record_main_photo_match(new.source_id,
                  case when new.decision = 'clear' then 'matched'::face_match_status else 'mismatch'::face_match_status end,
                  case when new.decision = 'clear' then null else 'not_matching' end);
      if v_path is not null then
        insert into storage_deletions (bucket_id, name) values ('profile-photos', v_path);
      end if;
    exception when others then
      -- The member chose another photo meanwhile: nothing left to decide.
      null;
    end;
  end if;

  -- A re-check or ID-check half a person did NOT clear — repeated mismatches
  -- included (route_repeated_mismatch) — goes back to a refusal, so the
  -- member can try again: on any other decision, or when the person asks for
  -- a fresh selfie (which waits on the member, not decided).
  if new.kind in ('selfie_review', 'id_review') and new.source_table = 'verification_sessions'
     and new.stage in ('decided', 'waiting_member') and old.stage not in ('decided', 'waiting_member')
     and new.decision is distinct from 'clear' then
    update verification_sessions set status = 'block', passed = false
     where id = new.source_id and status = 'attention' and step in ('reverify', 'id_kyc', 'id_auth');
  end if;

  if new.stage <> 'decided' or old.stage = 'decided' then return new; end if;

  if new.decision = 'clear' then
    delete from blocked_phone_hashes where held_for_review = new.id;
    delete from blocked_id_hashes where held_for_review = new.id;
  else
    update blocked_phone_hashes set held_for_review = null where held_for_review = new.id;
    update blocked_id_hashes set held_for_review = null where held_for_review = new.id;
  end if;

  if new.kind = 'selfie_review' and new.source_table = 'verification_sessions' and new.decision = 'clear' then
    select * into s from verification_sessions where id = new.source_id;
    -- A re-verification selfie a person cleared: passing it clears the
    -- request (0026's reverification_passed) and moves the liveness date on.
    if found and s.step = 'reverify' then
      update verification_sessions set passed = true, status = 'clear' where id = s.id;
      update profiles set liveness_verified_at = now() where id = s.profile_id;
    end if;
    if found and s.step = 'onboard' then
      update verification_sessions set passed = true, status = 'clear' where id = s.id;
      update profiles set stage = case when stage = 'phone_verified' then 'verified_real' else stage end,
                          liveness_verified_at = now()
       where id = s.profile_id and phone_verified_at is not null;
      if s.photo_id is not null then
        begin
          v_path := record_main_photo_match(s.photo_id, 'matched', null);
          if v_path is not null then
            insert into storage_deletions (bucket_id, name) values ('profile-photos', v_path);
          end if;
        exception when others then null;
        end;
      end if;
    end if;
  end if;

  -- One half of an ID check a person cleared: the ring still needs the
  -- other half clear too (record_id_check).
  if new.kind = 'id_review' and new.source_table = 'verification_sessions' and new.decision = 'clear' then
    select * into s from verification_sessions where id = new.source_id;
    if found and s.step in ('id_kyc', 'id_auth') and s.check_id is not null then
      update verification_sessions set passed = true, status = 'clear' where id = s.id;
      perform record_id_check(s.check_id);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.apply_review_outcome() from public, anon, authenticated;
drop trigger if exists apply_review_outcome on public.review_items;
create trigger apply_review_outcome after update of stage on public.review_items
  for each row execute function public.apply_review_outcome();

-- Files the database can't delete itself (it can't reach storage): the server
-- empties this after a decision made outside a request.
create table if not exists public.storage_deletions (
  id bigserial primary key,
  bucket_id text not null,
  name text not null,
  created_at timestamptz not null default now()
);
alter table public.storage_deletions enable row level security;
revoke all on public.storage_deletions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5b. Verified Real comes only from the in-page selfie (decided 6 October 2026)
-- ---------------------------------------------------------------------------
--
-- The hosted selfie enrolled no face under the member's id, so a later
-- step-up re-check (Authentication) would have nothing to compare against.
-- The hosted flow is retired — for Verified Real and for the ID check —
-- and anyone whose Verified Real came only from it goes back one step and
-- takes the onboarding selfie: liveness, the main-photo match, and the face
-- registered under their member id.
--
-- Their ID check goes too (decided 6 October 2026): the ring now needs the
-- ID-check selfie to match the face registered at onboarding, which a hosted
-- check never did, so they redo it in the page after the new selfie. Their
-- ID's fingerprint stays bound to them meanwhile, so no other account can
-- use that ID. No Sentinel "verification drift" event: this is Toastly's
-- change, not the member's.

-- The hosted flow is retired for both checks: nothing still in flight can
-- grant anything.
update public.verification_sessions
   set status = 'error', result_code = 'hosted_flow_retired', passed = false, completed_at = now()
 where step is null and status in ('started', 'submitted');

alter table public.profiles disable trigger trust_verification_change;
update public.profiles p
   set stage = (case when p.phone_verified_at is not null then 'phone_verified' else 'unverified' end)::verification_stage,
       liveness_verified_at = null,
       id_confirmed_at = null
 where p.stage in ('verified_real', 'id_confirmed')
   and not exists (select 1 from public.verification_sessions s
                    where s.profile_id = p.id and s.step = 'onboard' and s.passed is true);
alter table public.profiles enable trigger trust_verification_change;

-- ---------------------------------------------------------------------------
-- 6. Consent records, with the version agreed to
-- ---------------------------------------------------------------------------

do $$ begin
  create type consent_kind as enum ('verification_selfie', 'replace_main_photo', 'id_check', 'reverify_selfie');
exception when duplicate_object then null; end $$;

create table if not exists public.consents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind consent_kind not null,
  version text not null check (char_length(version) between 1 and 40),
  agreed_at timestamptz not null default now()
);
create index if not exists consents_lookup_idx on public.consents (profile_id, kind, agreed_at desc);
alter table public.consents enable row level security;
drop policy if exists "own consents readable" on public.consents;
create policy "own consents readable" on public.consents for select using (auth.uid() = profile_id);
drop policy if exists "members record their own consent" on public.consents;
create policy "members record their own consent" on public.consents for insert with check (auth.uid() = profile_id);
-- Append-only: a consent is a fact about a moment.
revoke update, delete on public.consents from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. No live profile, no access — the tables
-- ---------------------------------------------------------------------------

drop policy if exists "verified members see other verified profiles" on public.profiles;
drop policy if exists "live members see other live profiles" on public.profiles;
create policy "live members see other live profiles" on public.profiles for select
  using (paused = false and public.profile_is_live(id) and public.profile_is_live(auth.uid()));

drop policy if exists "answers of today's candidates readable" on public.prompt_answers;
create policy "answers of today's candidates readable" on public.prompt_answers for select
  using (
    public.profile_is_live(auth.uid()) and public.profile_is_live(profile_id)
    and exists (select 1 from public.daily_feed f
                 where f.profile_id = auth.uid() and f.feed_date = current_date and f.candidate_id = prompt_answers.profile_id));

drop policy if exists "photos visible per the owner's reveal choice" on public.profile_photos;
create policy "photos visible per the owner's reveal choice" on public.profile_photos for select
  using (
    auth.uid() = profile_id
    or (public.can_see_photos(auth.uid(), profile_id)
        and public.profile_is_live(auth.uid()) and public.profile_is_live(profile_id)
        and not public.is_hidden_candidate(id)));

-- Another member reads only a REGISTERED photo — never a stray file in the
-- folder — and never a candidate still being checked.
create or replace function public.can_see_photo_file(p_viewer uuid, p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when try_uuid((storage.foldername(p_path))[1]) = p_viewer then true
    else can_see_photos(p_viewer, try_uuid((storage.foldername(p_path))[1]))
         and profile_is_live(p_viewer) and profile_is_live(try_uuid((storage.foldername(p_path))[1]))
         and exists (select 1 from profile_photos ph where ph.storage_path = p_path and not is_hidden_candidate(ph.id))
  end;
$$;
drop policy if exists "profile photo files follow reveal rules" on storage.objects;
create policy "profile photo files follow reveal rules" on storage.objects for select
  using (bucket_id = 'profile-photos' and public.can_see_photo_file(auth.uid(), name));

-- Every image enters storage through the server, stripped of its metadata —
-- EXIF and GPS location, XMP, thumbnails, comments (decided 6 October 2026;
-- lib/strip-image.ts). So members' sessions can't write to either image
-- bucket: no upload, no overwrite. Members still delete their own photo
-- files. Message images have no upload screen yet; when one is built, it
-- uploads through the server the same way.
drop policy if exists "own profile photo files upload" on storage.objects;
drop policy if exists "senders upload attachment files" on storage.objects;

drop policy if exists "own feed readable" on public.daily_feed;
create policy "own feed readable" on public.daily_feed for select
  using (auth.uid() = profile_id and public.profile_is_live(auth.uid()));

drop policy if exists "own sent replies" on public.replies;
create policy "own sent replies" on public.replies for select
  using (auth.uid() = sender_id and public.profile_is_live(auth.uid()));
drop policy if exists "send a reply" on public.replies;
create policy "send a reply" on public.replies for insert
  with check (
    auth.uid() = sender_id
    and public.profile_is_live(auth.uid()) and public.profile_is_live(recipient_id)
    and exists (select 1 from prompt_answers a where a.id = prompt_answer_id and a.profile_id = recipient_id)
    and (kind <> 'text' or current_tier(auth.uid()) <> 'starter')
    and not exists (select 1 from blocks b where (b.blocker_id = sender_id and b.blocked_id = recipient_id)
                                              or (b.blocker_id = recipient_id and b.blocked_id = sender_id)));

drop policy if exists "participants see their sessions" on public.gist_sessions;
create policy "participants see their sessions" on public.gist_sessions for select
  using ((auth.uid() = proposer_id or auth.uid() = invitee_id) and public.profile_is_live(auth.uid()));
drop policy if exists "members propose their own sessions" on public.gist_sessions;
create policy "members propose their own sessions" on public.gist_sessions for insert
  with check (auth.uid() = proposer_id and public.profile_is_live(auth.uid()) and public.profile_is_live(invitee_id));
drop policy if exists "participants update their sessions" on public.gist_sessions;
create policy "participants update their sessions" on public.gist_sessions for update
  using ((auth.uid() = proposer_id or auth.uid() = invitee_id) and public.profile_is_live(auth.uid()));

drop policy if exists "own outcome writable" on public.gist_outcomes;
create policy "own outcome writable" on public.gist_outcomes for insert
  with check (auth.uid() = profile_id and public.profile_is_live(auth.uid()));
drop policy if exists "own outcome readable" on public.gist_outcomes;
create policy "own outcome readable" on public.gist_outcomes for select
  using (auth.uid() = profile_id and public.profile_is_live(auth.uid()));

drop policy if exists "participants see their threads" on public.threads;
create policy "participants see their threads" on public.threads for select
  using ((auth.uid() = member_a or auth.uid() = member_b) and public.profile_is_live(auth.uid()));
drop policy if exists "readable only by entitled participants" on public.messages;
create policy "readable only by entitled participants" on public.messages for select
  using (
    public.profile_is_live(auth.uid()) and can_read_inbox(auth.uid())
    and exists (select 1 from public.threads t where t.id = messages.thread_id and (t.member_a = auth.uid() or t.member_b = auth.uid())));
drop policy if exists "entitled members send" on public.messages;
create policy "entitled members send" on public.messages for insert
  with check (
    auth.uid() = sender_id and public.profile_is_live(auth.uid())
    and exists (select 1 from public.threads t where t.id = messages.thread_id and (t.member_a = auth.uid() or t.member_b = auth.uid())));

drop policy if exists "own session spots readable" on public.date_spots;
create policy "own session spots readable" on public.date_spots for select
  using (in_gist_session(session_id, auth.uid()) and public.profile_is_live(auth.uid()));
drop policy if exists "own session spots writable" on public.date_spots;
create policy "own session spots writable" on public.date_spots for insert
  with check (in_gist_session(session_id, auth.uid()) and public.profile_is_live(auth.uid()));
drop policy if exists "own session spots updatable" on public.date_spots;
create policy "own session spots updatable" on public.date_spots for update
  using (in_gist_session(session_id, auth.uid()) and public.profile_is_live(auth.uid()))
  with check (in_gist_session(session_id, auth.uid()) and public.profile_is_live(auth.uid()));

-- date_commitments stays readable to its two members whatever their status:
-- attendance and safety on a date already arranged never depend on it.

-- The locked inbox's bare count is part of messaging.
create or replace function public.unread_count()
returns integer language plpgsql stable security definer set search_path = public as $$
begin
  perform assert_live(auth.uid());
  return (select count(*)::int from public.messages m join public.threads t on t.id = m.thread_id
           where m.read_at is null and m.sender_id <> auth.uid()
             and (t.member_a = auth.uid() or t.member_b = auth.uid()));
end;
$$;
revoke all on function public.unread_count() from public;
grant execute on function public.unread_count() to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Blocklist entries held while a review is open
-- ---------------------------------------------------------------------------

-- A date called off because one of the pair deleted their account.
alter table public.date_commitments drop constraint if exists date_commitments_cancel_reason_check;
alter table public.date_commitments add constraint date_commitments_cancel_reason_check
  check (cancel_reason in ('notice', 'declined', 'reschedule', 'safety', 'neither_attended', 'account_deleted'));

alter table public.blocked_phone_hashes add column if not exists held_for_review uuid;
alter table public.blocked_id_hashes add column if not exists held_for_review uuid;

-- The console's words for a report (0026's, plus the new category).
create or replace function public._report_label(p report_reason)
returns text language sql immutable as $$
  select case p::text
    when 'user_is_married' then 'Married'
    when 'scam_or_fraud' then 'Scam or fraud'
    when 'asked_for_money' then 'Asking for money'
    when 'fake_profile' then 'Fake profile'
    when 'photos_not_them' then 'Photos aren''t them'
    when 'harassment' then 'Harassment'
    when 'threats_or_coercion' then 'Threats or coercion'
    when 'underage' then 'Under 18'
    else 'Other' end;
$$;

-- For the delete screen's "kept until an open review is settled" line
-- (account-delete prototype): a yes/no about the caller only — never what
-- the review is, or who raised it.
create or replace function public.has_open_review()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from review_items where subject_id = auth.uid() and stage <> 'decided');
$$;
revoke all on function public.has_open_review() from public, anon;
grant execute on function public.has_open_review() to authenticated;

-- ---------------------------------------------------------------------------
-- 9. The functions that need the guard (main's own definitions, plus one line)
-- ---------------------------------------------------------------------------

-- build_daily_feed: 0028_ported_fixes_and_brief_rule.sql's definition, plus the live guard.
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
  -- No live profile, no access (PRD §5.1.2): the six are only for live members.
  perform assert_live(auth.uid());
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

-- gist_invite: 0021_gist_invite_after_finish.sql's definition, plus the live guard.
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
  ) then
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

-- gist_respond: 0020_gist_invites.sql's definition, plus the live guard.
create or replace function public.gist_respond(p_session_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  s gist_sessions%rowtype;
begin
  -- No live profile, no access (PRD §5.1.2): accepting or declining a Gist invite.
  perform assert_live(auth.uid());
  select * into s from gist_sessions where id = p_session_id for update;
  if not found or s.invitee_id is distinct from auth.uid() then
    raise exception 'That invite doesn''t exist.' using errcode = 'P0002';
  end if;
  if s.status <> 'proposed' then
    raise exception 'This invite has already been answered.' using errcode = '42501';
  end if;
  if s.created_at < now() - interval '3 days' then
    update gist_sessions set status = 'expired' where id = p_session_id;
    raise exception 'This invite has closed.' using errcode = '42501';
  end if;
  if p_accept and not gist_has_room(auth.uid()) then
    raise exception 'Monthly voice Gist allowance reached' using errcode = '42501';
  end if;
  update gist_sessions set status = case when p_accept then 'accepted' else 'declined' end::gist_status
   where id = p_session_id;
  return case when p_accept then 'accepted' else 'declined' end;
end;
$$;

-- gist_propose_time: 0020_gist_invites.sql's definition, plus the live guard.
create or replace function public.gist_propose_time(p_session_id uuid, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s gist_sessions%rowtype;
begin
  -- No live profile, no access (PRD §5.1.2): arranging a Gist.
  perform assert_live(auth.uid());
  select * into s from gist_sessions where id = p_session_id for update;
  if not found or auth.uid() not in (s.proposer_id, s.invitee_id) then
    raise exception 'That session doesn''t exist.' using errcode = 'P0002';
  end if;
  if s.status <> 'accepted' or s.started_at is not null then
    raise exception 'You can pick a time once the invite is accepted.' using errcode = '42501';
  end if;
  if p_at < now() + interval '5 minutes' or p_at > now() + interval '14 days' then
    raise exception 'Pick a time in the next two weeks.' using errcode = '22023';
  end if;
  update gist_sessions
     set scheduled_for = p_at, time_proposed_by = auth.uid(), time_confirmed_at = null
   where id = p_session_id;
end;
$$;

-- gist_confirm_time: 0020_gist_invites.sql's definition, plus the live guard.
create or replace function public.gist_confirm_time(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s gist_sessions%rowtype;
begin
  -- No live profile, no access (PRD §5.1.2): arranging a Gist.
  perform assert_live(auth.uid());
  select * into s from gist_sessions where id = p_session_id for update;
  if not found or auth.uid() not in (s.proposer_id, s.invitee_id) then
    raise exception 'That session doesn''t exist.' using errcode = 'P0002';
  end if;
  if s.time_proposed_by is null or s.time_proposed_by = auth.uid() then
    raise exception 'There''s no time waiting for you to confirm.' using errcode = '42501';
  end if;
  if s.scheduled_for is null or s.scheduled_for < now() then
    raise exception 'That time has passed. Pick another.' using errcode = '42501';
  end if;
  update gist_sessions set time_confirmed_at = now() where id = p_session_id;
end;
$$;

-- gist_join: 0020_gist_invites.sql's definition, plus the live guard.
create or replace function public.gist_join(p_session_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  s gist_sessions%rowtype;
  v_other uuid;
begin
  -- No live profile, no access (PRD §5.1.2): joining a Gist call.
  perform assert_live(auth.uid());
  select * into s from gist_sessions where id = p_session_id for update;
  if not found or auth.uid() not in (s.proposer_id, s.invitee_id) then
    raise exception 'That session doesn''t exist.' using errcode = 'P0002';
  end if;
  if s.status not in ('accepted', 'live')
     or s.proposer_ready_at is null or s.invitee_ready_at is null then
    raise exception 'You can join once you''ve both said you''re ready.' using errcode = '42501';
  end if;
  if s.ends_at is not null and now() >= s.ends_at then
    raise exception 'This Gist has finished.' using errcode = '42501';
  end if;

  if s.started_at is null then
    v_other := case when auth.uid() = s.proposer_id then s.invitee_id else s.proposer_id end;
    if not gist_has_room(auth.uid()) then
      raise exception 'You''ve used your 2 Gists this month.' using errcode = '42501';
    end if;
    -- Never reveal the other person's plan or usage.
    if not gist_has_room(v_other) then
      raise exception 'This Gist can''t start right now.' using errcode = '42501';
    end if;
    update gist_sessions
       set started_at = now(),
           ends_at = now() + interval '18 minutes',
           status = 'live'
     where id = p_session_id
    returning * into s;
  end if;
  return s.ends_at;
end;
$$;

-- date_propose: 0023_coin_balance.sql's definition, plus the live guard.
create or replace function public.date_propose(p_spot_id uuid, p_at timestamptz, p_stake integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  cfg coin_config;
  sp date_spots;
  g gist_sessions;
  v_other uuid;
  c date_commitments;
begin
  -- No live profile, no access (PRD §5.1.2): proposing a date.
  perform assert_live(auth.uid());
  select * into cfg from coin_config;
  select * into sp from date_spots where id = p_spot_id;
  if not found or sp.status <> 'accepted' then
    raise exception 'Accept a spot first.' using errcode = '42501';
  end if;
  select * into g from gist_sessions where id = sp.session_id;
  if v_me is null or v_me not in (g.proposer_id, g.invitee_id) then
    raise exception 'That spot isn''t yours to book.' using errcode = '42501';
  end if;
  if sp.lat is null or sp.lng is null then
    raise exception 'This spot has no map location, so check-in can''t work there. Pick another.' using errcode = '22023';
  end if;
  if p_stake < cfg.stake_min or p_stake > cfg.stake_max then
    raise exception 'Stake between % and % coins.', cfg.stake_min, cfg.stake_max using errcode = '22023';
  end if;
  if p_at < now() + make_interval(hours => cfg.cancel_cutoff_hours) or p_at > now() + interval '14 days' then
    raise exception 'Pick a time at least % hours away, within two weeks.', cfg.cancel_cutoff_hours using errcode = '22023';
  end if;
  v_other := case when v_me = g.proposer_id then g.invitee_id else g.proposer_id end;
  if exists (
    select 1 from date_commitments d
    where ((d.member_a = v_me and d.member_b = v_other) or (d.member_a = v_other and d.member_b = v_me))
      and d.status in ('pending', 'confirmed', 'provisional_no_show', 'under_review')
  ) then
    raise exception 'You already have a date planned with them.' using errcode = '23505';
  end if;

  insert into date_commitments (member_a, member_b, stake_coins, scheduled_for, date_spot_id,
                                venue_name, venue_address, session_id, proposed_by)
  values (v_me, v_other, p_stake, p_at, sp.id, sp.name, sp.address, sp.session_id, v_me)
  returning * into c;

  perform _date_hold(c, v_me);
  update date_commitments set a_staked_at = now() where id = c.id;
  return c.id;
end;
$$;

-- date_stake: 0023_coin_balance.sql's definition, plus the live guard.
create or replace function public.date_stake(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  c date_commitments;
begin
  -- No live profile, no access (PRD §5.1.2): staking a date.
  perform assert_live(auth.uid());
  select * into c from date_commitments where id = p_id for update;
  if not found or auth.uid() is distinct from c.member_b then
    raise exception 'That date isn''t waiting on you.' using errcode = '42501';
  end if;
  if c.status <> 'pending' or c.b_staked_at is not null then
    raise exception 'This date has already been answered.' using errcode = '42501';
  end if;
  perform _date_hold(c, c.member_b);
  update date_commitments set b_staked_at = now() where id = p_id;
end;
$$;

-- queue_from_source: 0026_diaspora_rules_console.sql's definition, with replacement photo checks kept out of the selfie/ID queue.
create or replace function public.queue_from_source()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_other uuid;
begin
  if tg_table_name = 'integrity_reviews' then
    perform _queue('pricing', new.profile_id, 'integrity_reviews', new.id, null);
  elsif tg_table_name = 'reports' then
    perform _queue(case when new.reason = 'user_is_married' then 'married_report'
                        when new.blind then 'blind_report' else 'report' end,
                   new.reported_id, 'reports', new.id, new.reporter_id);
  elsif tg_table_name = 'attendance_reviews' then
    select case when d.member_a = new.contested_by then d.member_b else d.member_a end into v_other
      from date_commitments d where d.id = new.commitment_id;
    perform _queue('attendance', new.contested_by, 'attendance_reviews', new.commitment_id, v_other);
  elsif tg_table_name = 'verification_sessions' then
    -- Main-photo replacement checks reach a person as 'photo_match', through
    -- record_main_photo_match (0029), never as an ID review.
    if new.product = 'photo_match' then return new; end if;
    if new.status = 'attention' and (tg_op = 'INSERT' or old.status is distinct from 'attention') then
      perform _queue(case when new.product = 'smartselfie' then 'selfie_review' else 'id_review' end,
                     new.profile_id, 'verification_sessions', new.id, null);
    end if;
  end if;
  return new;
end;
$$;

-- prepare_account_deletion: 0016_smile_id.sql's definition, holding the blocklist entry while a review is open.
create or replace function public.prepare_account_deletion()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_hash text;
  v_id_hash text;
  v_case uuid;
  c date_commitments;
begin
  if v_me is null then
    raise exception 'Not signed in.';
  end if;

  delete from retained_safety_records where former_profile_id = v_me;
  insert into retained_safety_records (former_profile_id, reason, status, reported_at, retain_until)
  select v_me, r.reason, r.status, r.created_at, now() + interval '2 years'
  from reports r
  where r.reported_id = v_me;

  if exists (select 1 from reports r where r.reported_id = v_me and r.status = 'actioned') then
    select phone_hash into v_hash from phone_identities where profile_id = v_me;
    if v_hash is not null then
      insert into blocked_phone_hashes (phone_hash, former_profile_id, retain_until)
      values (v_hash, v_me, now() + interval '2 years')
      on conflict (phone_hash) do update set retain_until = excluded.retain_until;
    end if;

    select id_hash into v_id_hash from verified_id_hashes where profile_id = v_me;
    if v_id_hash is not null then
      insert into blocked_id_hashes (id_hash, former_profile_id, retain_until)
      values (v_id_hash, v_me, now() + interval '2 years')
      on conflict (id_hash) do update set retain_until = excluded.retain_until;
    end if;
  end if;

  -- The partner first (ported from live-profile-and-prompt-14). A couple row
  -- deleted with the account never fires the un-pause (that runs on update to
  -- 'ended'), so the partner stayed paused — hidden — for good. End it.
  update couples set status = 'ended'
   where (member_a = v_me or member_b = v_me) and status in ('proposed', 'active');
  -- Dates not yet settled are called off with every stake returned: the
  -- partner's coins never go with someone else's account.
  for c in select * from date_commitments
            where (member_a = v_me or member_b = v_me) and settled_at is null for update loop
    perform _date_payout(c, 'return_both');
    update date_commitments set status = 'cancelled', cancel_reason = 'account_deleted', cancelled_by = v_me, settled_at = now()
     where id = c.id;
  end loop;

  -- Deleting while a review is open (decided 5 October 2026): the number and
  -- the ID stay blocked until the review is settled. Cleared, they're freed;
  -- otherwise they stay for two years.
  if not exists (select 1 from reports r where r.reported_id = v_me and r.status = 'actioned') then
    v_case := (select id from review_items where subject_id = v_me and stage <> 'decided' order by created_at limit 1);
    if v_case is not null then
      select phone_hash into v_hash from phone_identities where profile_id = v_me;
      if v_hash is not null then
        insert into blocked_phone_hashes (phone_hash, former_profile_id, retain_until, held_for_review)
        values (v_hash, v_me, now() + interval '2 years', v_case)
        on conflict (phone_hash) do nothing;
      end if;
      select id_hash into v_id_hash from verified_id_hashes where profile_id = v_me;
      if v_id_hash is not null then
        insert into blocked_id_hashes (id_hash, former_profile_id, retain_until, held_for_review)
        values (v_id_hash, v_me, now() + interval '2 years', v_case)
        on conflict (id_hash) do nothing;
      end if;
    end if;
  end if;

  insert into retained_payments (
    former_profile_id, provider, provider_ref, amount_minor, currency,
    status, purpose, paid_at, retain_until
  )
  select v_me, p.provider, p.provider_ref, p.amount_minor, p.currency,
         p.status, p.purpose, p.created_at, now() + interval '6 years'
  from payments p
  where p.profile_id = v_me
  on conflict (provider, provider_ref) do nothing;
end;
$$;


-- Toastly — Prompt 14: profile photos, four minimum, one face-matched.
--
-- 0013 defined what "live" means and the main-photo state it reads. This
-- adds what the approved photo screens (photos-upload, photos-main-check)
-- and the 2026-10-05 rulings need:
--
--   * a photo limit (max from config, default 6);
--   * the two ways a main photo can fail — "face not clear" and "doesn't
--     look like your selfie" — because the screens treat them differently;
--   * "Ask a person to look", which moves a mismatch to human review;
--   * replacing the main photo: once the new one matches, the old one goes;
--   * the face-match job record, which keeps OUTCOMES only — never an image,
--     a score or a face template (PRD §5.1.2);
--   * a Sentinel "verification drift" event when a later main photo doesn't
--     match;
--   * "these photos aren't them" as a first-class report category.
--
-- How a match runs (decided 2026-10-05): every main photo — the first one
-- and every replacement — is checked with a FRESH live selfie, because Smile
-- ID can't compare a still upload against an enrolled face. Two Smile ID
-- jobs per check: Authentication (is this selfie the enrolled member?) and
-- Compare (does it match the new photo?). Toastly passes the selfie through
-- and never stores it.

alter type report_reason add value if not exists 'photos_not_them';
alter type trust_event_kind add value if not exists 'verification_drift';

-- ---------------------------------------------------------------------------
-- Limits
-- ---------------------------------------------------------------------------

-- Six visible photos (0007 already limits position to 0–5). The database
-- allows one more row than that, so a member with six photos can still put
-- a replacement main photo up for checking; the old main photo leaves when
-- the new one matches.
create or replace function public.max_profile_photos()
returns smallint
language sql
immutable
as $$ select 6::smallint $$;

create or replace function public.enforce_photo_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from profile_photos where profile_id = new.profile_id)
     >= max_profile_photos() + 1 then
    raise exception 'photo_limit'
      using errcode = '23514',
            hint = 'Up to six photos (PRD 5.1.2).';
  end if;
  return new;
end;
$$;

create trigger profile_photos_20_limit
  before insert on public.profile_photos
  for each row execute function public.enforce_photo_limit();

-- ---------------------------------------------------------------------------
-- Why a main photo wasn't confirmed
-- ---------------------------------------------------------------------------

alter table public.profile_photos
  add column face_match_reason text
    check (face_match_reason in ('face_not_clear', 'not_matching', 'not_same_person'));

comment on column public.profile_photos.face_match_reason is
  'Why a main photo was not confirmed. A category only — never a score or an image.';

-- 0013's client-write guard covers face_match and face_checked_at; the
-- reason is part of the same server-owned result.
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
    new.face_match_reason := null;
    return new;
  end if;

  if new.face_match is distinct from old.face_match
     or new.face_checked_at is distinct from old.face_checked_at
     or new.face_match_reason is distinct from old.face_match_reason
     or new.storage_path is distinct from old.storage_path
     or new.profile_id is distinct from old.profile_id then
    raise exception 'A photo''s file and face-match result cannot be changed by the client.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Face-match jobs: outcomes only
-- ---------------------------------------------------------------------------

create table public.face_match_jobs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  photo_id uuid not null references public.profile_photos (id) on delete cascade,
  -- One check = one Authentication + one Compare, sharing a check_id.
  check_id uuid not null,
  step text not null check (step in ('authenticate', 'compare')),
  provider text not null default 'smile_id',
  provider_job_id text unique,
  -- The provider's verdict, as categories: clear / attention / block / error
  -- and its reason code. No confidence score, no image, no template.
  provider_status text check (provider_status in ('clear', 'attention', 'block', 'error')),
  provider_reason text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (check_id, step)
);

create index face_match_jobs_photo_idx on public.face_match_jobs (photo_id);

-- Staff and the server only. A member learns the result from their photo's
-- status, never from the provider's raw verdict.
alter table public.face_match_jobs enable row level security;

-- ---------------------------------------------------------------------------
-- Recording the outcome
-- ---------------------------------------------------------------------------
--
-- Replaces 0013's version (same name, a reason added). SERVICE ROLE ONLY.
-- Returns the storage path of a main photo that was REPLACED, so the server
-- can delete that file too.
--
--   matched  -> the pending photo becomes the main photo; the previous main
--               photo is removed — it was replaced, not added to
--   review   -> stays pending; a person decides. Never auto-rejected.
--   mismatch -> dropped as a candidate, with a reason; any matched main
--               photo stays live. A mismatch after the member already had a
--               matched main photo is a Sentinel "verification drift" event.
drop function public.record_main_photo_match(uuid, face_match_status);

create or replace function public.record_main_photo_match(
  p_photo_id uuid,
  p_outcome face_match_status,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_old_main uuid;
  v_old_path text;
begin
  if p_outcome not in ('matched', 'review', 'mismatch') then
    raise exception 'Not a match outcome: %', p_outcome;
  end if;
  if p_outcome = 'mismatch' and p_reason is null then
    raise exception 'A mismatch needs a reason.';
  end if;

  select profile_id into v_owner from profile_photos where id = p_photo_id;
  if v_owner is null then
    raise exception 'No such photo.';
  end if;
  if (select pending_main_photo_id from profiles where id = v_owner) is distinct from p_photo_id then
    raise exception 'That photo is not the pending main photo.';
  end if;

  update profile_photos
     set face_match = p_outcome,
         face_checked_at = now(),
         face_match_reason = case when p_outcome = 'mismatch' then p_reason end
   where id = p_photo_id;

  if p_outcome = 'matched' then
    select main_photo_id into v_old_main from profiles where id = v_owner;
    update profiles
       set main_photo_id = p_photo_id, pending_main_photo_id = null
     where id = v_owner;
    if v_old_main is not null and v_old_main <> p_photo_id then
      delete from profile_photos where id = v_old_main returning storage_path into v_old_path;
    end if;
    -- The new main photo leads the set.
    update profile_photos set position = 0 where id = p_photo_id;

  elsif p_outcome = 'mismatch' then
    if (select main_photo_id from profiles where id = v_owner) is not null then
      perform emit_trust_event(v_owner, null, 'verification_drift',
        jsonb_build_object('reason', p_reason));
    end if;
    update profiles set pending_main_photo_id = null where id = v_owner;
  end if;

  return v_old_path;
end;
$$;

revoke all on function public.record_main_photo_match(uuid, face_match_status, text) from public, anon, authenticated;
grant execute on function public.record_main_photo_match(uuid, face_match_status, text) to service_role;

-- "Ask a person to look" — offered only when the photo didn't look like the
-- selfie (photos-main-check). A face that isn't clear is fixed by choosing
-- another photo, not by review.
create or replace function public.request_photo_review(p_photo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if not exists (
    select 1 from profile_photos
    where id = p_photo_id and profile_id = v_me
      and face_match = 'mismatch' and face_match_reason = 'not_matching'
  ) then
    raise exception 'That photo can''t be sent for review.' using errcode = '42501';
  end if;

  update profile_photos
     set face_match = 'review', face_match_reason = null
   where id = p_photo_id;
  update profiles set pending_main_photo_id = p_photo_id where id = v_me;
end;
$$;

revoke all on function public.request_photo_review(uuid) from public, anon;
grant execute on function public.request_photo_review(uuid) to authenticated;

-- What the photo screens need to show about the member's own main photo
-- check. Takes no argument: only ever the caller.
create or replace function public.main_photo_check()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'main_photo_id', p.main_photo_id,
    'candidate_id', c.id,
    'candidate_state', c.face_match,
    'candidate_reason', c.face_match_reason
  )
  from profiles p
  left join lateral (
    -- The photo being checked, or failing that the latest one that wasn't
    -- confirmed and is still in the set.
    select ph.id, ph.face_match, ph.face_match_reason
    from profile_photos ph
    where ph.profile_id = p.id
      and (ph.id = p.pending_main_photo_id
           or (ph.face_match = 'mismatch' and ph.face_checked_at is not null))
    order by (ph.id = p.pending_main_photo_id) desc, ph.face_checked_at desc nulls last
    limit 1
  ) c on true
  where p.id = auth.uid();
$$;

revoke all on function public.main_photo_check() from public, anon;
grant execute on function public.main_photo_check() to authenticated;

-- ---------------------------------------------------------------------------
-- Candidates are private until they're part of the set
-- ---------------------------------------------------------------------------
--
-- 0013 kept a replacement being checked private to its owner. A candidate
-- that WASN'T confirmed is the same: the member hasn't chosen to show it
-- ("Use it as another photo" is an explicit choice on photos-main-check).
-- So it neither counts toward the four nor shows to anyone else.

create or replace function public.is_hidden_candidate(p_photo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where pending_main_photo_id = p_photo_id)
      or exists (select 1 from profile_photos where id = p_photo_id and face_match = 'mismatch');
$$;

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
    and ph.id is distinct from p.pending_main_photo_id
    and ph.face_match <> 'mismatch';
$$;

drop policy "photos visible per the owner's reveal choice" on public.profile_photos;
create policy "photos visible per the owner's reveal choice"
  on public.profile_photos for select
  using (
    public.can_see_photos(auth.uid(), profile_id)
    and (auth.uid() = profile_id or not public.is_hidden_candidate(id))
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
           where ph.storage_path = p_path and is_hidden_candidate(ph.id)
         )
  end;
$$;

-- "Use it as another photo": a candidate that wasn't confirmed stays in the
-- set as an ordinary photo, with its check result cleared.
create or replace function public.keep_as_other_photo(p_photo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from profile_photos
    where id = p_photo_id and profile_id = auth.uid() and face_match = 'mismatch'
  ) then
    raise exception 'That photo can''t be moved.' using errcode = '42501';
  end if;
  update profile_photos
     set face_match = 'unchecked', face_match_reason = null, face_checked_at = null
   where id = p_photo_id;
end;
$$;

revoke all on function public.keep_as_other_photo(uuid) from public, anon;
grant execute on function public.keep_as_other_photo(uuid) to authenticated;

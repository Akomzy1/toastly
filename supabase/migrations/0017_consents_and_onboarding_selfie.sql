-- Toastly — consent records, and one onboarding selfie (decided 2026-10-05).
--
--   * Onboarding is now photos first, then ONE selfie that does both the
--     liveness check (Verified Real) and the main-photo match. The fresh
--     selfie step is kept only for replacing the main photo later.
--   * Every verification consent is recorded with the VERSION of the wording
--     agreed to (Toastly-Verification-Consent-Wording.md), so a member is
--     asked again whenever the wording changes.

-- ---------------------------------------------------------------------------
-- Consent records
-- ---------------------------------------------------------------------------

create type consent_kind as enum (
  'verification_selfie',  -- onboarding: liveness + main-photo match
  'replace_main_photo',   -- a fresh selfie for a new main photo
  'id_check'              -- the optional NIN / Virtual NIN / BVN check
);

-- Append-only: a consent is a fact about a moment. Nobody edits one; a new
-- agreement is a new row with the version shown at the time.
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind consent_kind not null,
  version text not null check (char_length(version) between 1 and 40),
  agreed_at timestamptz not null default now()
);

create index consents_lookup_idx on public.consents (profile_id, kind, agreed_at desc);

alter table public.consents enable row level security;

create policy "own consents readable" on public.consents for select
  using (auth.uid() = profile_id);

create policy "members record their own consent" on public.consents for insert
  with check (auth.uid() = profile_id);

-- ---------------------------------------------------------------------------
-- The onboarding selfie check
-- ---------------------------------------------------------------------------

alter table public.face_match_jobs drop constraint face_match_jobs_step_check;
alter table public.face_match_jobs add constraint face_match_jobs_step_check
  check (step in ('authenticate', 'compare', 'onboard'));

-- Records the one onboarding selfie's result. SERVICE ROLE ONLY.
--
--   p_live  'passed' -> Verified Real (phone confirmed first, never a skip)
--           'review' -> a person decides; nothing recorded yet
--           'retake' -> the check couldn't run on these images; nothing
--                       recorded, the member takes it again
--   p_match the main photo's outcome, through record_main_photo_match()
--
-- A live person whose photo doesn't match still earns Verified Real — the
-- seal says a real person is behind the phone, which is true — but the
-- profile stays hidden until a main photo that IS them matches.
create or replace function public.record_onboarding_check(
  p_photo_id uuid,
  p_live text,
  p_match face_match_status,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if p_live not in ('passed', 'review', 'retake') then
    raise exception 'Not a liveness outcome: %', p_live;
  end if;

  select profile_id into v_owner from profile_photos where id = p_photo_id;
  if v_owner is null then
    raise exception 'No such photo.';
  end if;

  if p_live = 'passed' then
    update profiles
       set stage = case when stage = 'phone_verified' then 'verified_real' else stage end,
           liveness_verified_at = coalesce(liveness_verified_at, now())
     where id = v_owner and phone_verified_at is not null;
  end if;

  return record_main_photo_match(p_photo_id, p_match, p_reason);
end;
$$;

revoke all on function public.record_onboarding_check(uuid, text, face_match_status, text) from public, anon, authenticated;
grant execute on function public.record_onboarding_check(uuid, text, face_match_status, text) to service_role;

-- 0015's view of the member's main-photo check, plus whether a check is
-- actually running. Before the onboarding selfie, the main photo is waiting
-- for it — "not checked yet", not "checking".
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
    'candidate_reason', c.face_match_reason,
    'check_running', exists (
      select 1 from face_match_jobs j
      where j.photo_id = c.id and j.completed_at is null
    )
  )
  from profiles p
  left join lateral (
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

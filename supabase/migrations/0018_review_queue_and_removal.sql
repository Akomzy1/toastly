-- Toastly — the human review queue, account standing, and the blocklist.
--
-- PRD §9 / CLAUDE.md: one human-review queue with a staff screen is a launch
-- requirement. Every "a person reviews it" path lands here: reports
-- (including locked-inbox and married-user reports), pricing-integrity
-- signals, borderline photo and selfie checks, and — with Prompt 17 —
-- date-attendance disputes. Built against design/prototype/review-queue,
-- review-case and review-history.
--
-- Rules carried in from CLAUDE.md and the privacy policy:
--   * reviewers see the reason and the evidence the rules allow — NEVER
--     message bodies, Gist content, genotype or raw biometric data;
--   * a PERSON makes every decision; nothing here restricts or removes an
--     account on its own;
--   * every decision is audit-logged, append-only, with who and when;
--   * a restricted or removed member is told why, as a reason category.
--
-- Decided 2026-10-05:
--   * removal keeps a BLOCKLIST of hashed identifiers — the phone hash and
--     the ID-number fingerprint (a keyed hash, adopted now) — for two years;
--   * voluntary deletion in good standing frees the number; deletion while a
--     review is open holds the blocklist entry until the review is settled;
--   * while access is paused for PROFILE reasons Couple Mode stays open; it
--     closes if the account is restricted or removed by review.

-- ---------------------------------------------------------------------------
-- 1. Staff
-- ---------------------------------------------------------------------------
--
-- Staff are ordinary sign-ins listed here. Added only with the service role
-- (SQL or an admin script) — there is no self-service path into this table.
create table public.staff_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 60),
  role text not null default 'reviewer' check (role in ('reviewer', 'senior')),
  added_at timestamptz not null default now()
);

alter table public.staff_members enable row level security;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from staff_members where user_id = auth.uid());
$$;

create or replace function public.staff_me()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('name', display_name, 'role', role)
  from staff_members where user_id = auth.uid();
$$;

revoke all on function public.is_staff() from public, anon;
revoke all on function public.staff_me() from public, anon;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.staff_me() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Account standing — decided by a person, told to the member
-- ---------------------------------------------------------------------------

create type account_standing as enum ('good', 'restricted', 'removed');
create type standing_reason as enum ('pricing', 'safety', 'married', 'photos', 'verification', 'other');

alter table public.profiles
  add column standing account_standing not null default 'good',
  add column standing_reason standing_reason,
  add column standing_changed_at timestamptz,
  add column reverification_requested_at timestamptz;

-- 0013's guard, extended to the new server-owned columns.
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
       or new.first_live_at is not null
       or new.standing <> 'good'
       or new.standing_reason is not null
       or new.reverification_requested_at is not null then
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
     or new.first_live_at is distinct from old.first_live_at
     or new.standing is distinct from old.standing
     or new.standing_reason is distinct from old.standing_reason
     or new.standing_changed_at is distinct from old.standing_changed_at
     or new.reverification_requested_at is distinct from old.reverification_requested_at then
    raise exception 'Verification and live-profile state are set by Toastly, not by the client.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- A restricted or removed account is not live: hidden, and no matching,
-- messages or dates — exactly 0013's guard, through its one definition.
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
       and p.standing = 'good'
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

-- 0013's status, plus the standing and its reason category — the member is
-- always told why (CLAUDE.md).
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
    'main_photo', case
      when m.face_match = 'matched' then 'matched'
      when r.face_match in ('pending', 'review') then 'checking'
      else 'missing'
    end,
    'replacement_checking', m.face_match = 'matched' and r.face_match in ('pending', 'review'),
    'standing', p.standing,
    'standing_reason', p.standing_reason,
    'reverification_requested', p.reverification_requested_at is not null
  )
  from profiles p
  left join profile_photos m on m.id = p.main_photo_id and m.profile_id = p.id
  left join profile_photos r on r.id = p.pending_main_photo_id and r.profile_id = p.id
  where p.id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- 3. Identifiers: the ID fingerprint, and the blocklist
-- ---------------------------------------------------------------------------

-- A keyed hash of the NIN / Virtual NIN / BVN, computed by the server
-- (ID_FINGERPRINT_KEY). Never the number. One ID, one account.
create table public.id_fingerprints (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  fingerprint text not null unique check (char_length(fingerprint) between 32 and 128),
  created_at timestamptz not null default now()
);

alter table public.id_fingerprints enable row level security;

-- Removed members' identifiers, kept so they can't simply sign up again.
-- retain_until is NULL while held for a review that isn't settled yet.
create table public.blocked_identifiers (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('phone', 'id_number')),
  fingerprint text not null,
  reason standing_reason,
  case_id bigint,
  created_at timestamptz not null default now(),
  retain_until timestamptz,
  unique (kind, fingerprint)
);

alter table public.blocked_identifiers enable row level security;

create or replace function public.identifier_blocked(p_kind text, p_fingerprint text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from blocked_identifiers
    where kind = p_kind and fingerprint = p_fingerprint
      and (retain_until is null or retain_until > now())
  );
$$;

revoke all on function public.identifier_blocked(text, text) from public, anon, authenticated;

-- 0014's yes/no, now also "yes" for a blocked number — without saying which.
create or replace function public.phone_in_use(p_phone_hash text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from phone_identities
    where phone_hash = p_phone_hash and profile_id is distinct from auth.uid()
  ) or identifier_blocked('phone', p_phone_hash);
$$;

-- 0014's binding, refusing a blocked number.
create or replace function public.record_phone_verified(
  p_profile_id uuid,
  p_phone_hash text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_existing text;
begin
  if not exists (
    select 1 from auth.users u
    where u.id = p_profile_id and u.phone_confirmed_at is not null
  ) then
    raise exception 'Phone not confirmed.' using errcode = '42501';
  end if;

  if identifier_blocked('phone', p_phone_hash) then
    raise exception 'phone_in_use' using errcode = '23505';
  end if;

  if exists (
    select 1 from phone_identities
    where phone_hash = p_phone_hash and profile_id <> p_profile_id
  ) then
    raise exception 'phone_in_use' using errcode = '23505';
  end if;

  select phone_hash into v_existing from phone_identities where profile_id = p_profile_id;
  if v_existing is not null and v_existing <> p_phone_hash then
    raise exception 'account_has_other_phone' using errcode = '23505';
  end if;

  insert into phone_identities (phone_hash, profile_id)
  values (p_phone_hash, p_profile_id)
  on conflict do nothing;

  update profiles
     set stage = case when stage = 'unverified' then 'phone_verified' else stage end,
         phone_verified_at = coalesce(phone_verified_at, now())
   where id = p_profile_id;
end;
$$;

-- The ID check's fingerprint. SERVICE ROLE ONLY, after a pass.
create or replace function public.record_id_fingerprint(p_profile_id uuid, p_fingerprint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if identifier_blocked('id_number', p_fingerprint) then
    raise exception 'id_in_use' using errcode = '23505';
  end if;
  if exists (select 1 from id_fingerprints where fingerprint = p_fingerprint and profile_id <> p_profile_id) then
    raise exception 'id_in_use' using errcode = '23505';
  end if;
  insert into id_fingerprints (profile_id, fingerprint) values (p_profile_id, p_fingerprint)
  on conflict (profile_id) do update set fingerprint = excluded.fingerprint;
end;
$$;

revoke all on function public.record_id_fingerprint(uuid, text) from public, anon, authenticated;
grant execute on function public.record_id_fingerprint(uuid, text) to service_role;

-- Put a member's identifiers on the blocklist (internal).
create or replace function public.block_identifiers_of(
  p_profile_id uuid,
  p_reason standing_reason,
  p_case bigint,
  p_until timestamptz
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into blocked_identifiers (kind, fingerprint, reason, case_id, retain_until)
  select 'phone', phone_hash, p_reason, p_case, p_until from phone_identities where profile_id = p_profile_id
  union all
  select 'id_number', fingerprint, p_reason, p_case, p_until from id_fingerprints where profile_id = p_profile_id
  on conflict (kind, fingerprint) do update
    set retain_until = excluded.retain_until, reason = excluded.reason, case_id = excluded.case_id;
$$;

revoke all on function public.block_identifiers_of(uuid, standing_reason, bigint, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Review cases and decisions
-- ---------------------------------------------------------------------------

create sequence public.review_case_seq start 20000;

create type case_kind as enum ('pricing', 'safety', 'photo', 'selfie', 'blind', 'married', 'date');
create type case_status as enum ('new', 'in_review', 'waiting_on_member', 'decided');

create table public.review_cases (
  id bigint primary key default nextval('public.review_case_seq'),
  kind case_kind not null,
  -- The member the case is about. Set null if they delete their account;
  -- subject_ref keeps the case attached to the right record.
  subject_id uuid references public.profiles (id) on delete set null,
  subject_ref uuid not null,
  -- The other party, where there is one (the reporter, the other dater).
  other_id uuid references public.profiles (id) on delete set null,
  source text not null check (source in ('report', 'integrity_review', 'photo_check', 'selfie_check', 'dispute')),
  source_id uuid,
  -- Plain-language reason, built ONLY from fields reviewers may see.
  summary text not null check (char_length(summary) <= 300),
  status case_status not null default 'new',
  assigned_to uuid references public.staff_members (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_at timestamptz
);

create index review_cases_queue_idx on public.review_cases (status, kind, created_at);
create index review_cases_subject_idx on public.review_cases (subject_ref);

alter table public.review_cases enable row level security;

create table public.review_decisions (
  id uuid primary key default gen_random_uuid(),
  case_id bigint not null references public.review_cases (id),
  staff_id uuid references public.staff_members (user_id) on delete set null,
  staff_name text not null,
  action text not null check (action in (
    'raised', 'assign', 'clear', 'switch', 'reverify', 'restrict', 'remove', 'confirm_match', 'not_match'
  )),
  note text not null,
  created_at timestamptz not null default now(),
  check (action in ('raised', 'assign') or char_length(note) >= 12)
);

create index review_decisions_case_idx on public.review_decisions (case_id, created_at);

alter table public.review_decisions enable row level security;

-- Append-only: a decision is never edited or deleted, by anyone.
create or replace function public.review_decisions_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Decision history is append-only.' using errcode = '42501';
end;
$$;

create trigger review_decisions_no_update
  before update or delete on public.review_decisions
  for each row execute function public.review_decisions_append_only();

-- Raise a case, or add to the open one of the same kind for the same member.
create or replace function public.raise_case(
  p_kind case_kind,
  p_subject uuid,
  p_other uuid,
  p_source text,
  p_source_id uuid,
  p_summary text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case bigint;
begin
  if p_subject is null then
    return null;
  end if;
  select id into v_case from review_cases
   where subject_ref = p_subject and kind = p_kind and status <> 'decided'
   order by created_at limit 1;
  if v_case is not null then
    update review_cases set summary = p_summary, updated_at = now() where id = v_case;
  else
    insert into review_cases (kind, subject_id, subject_ref, other_id, source, source_id, summary)
    values (p_kind, p_subject, p_subject, p_other, p_source, p_source_id, p_summary)
    returning id into v_case;
  end if;
  insert into review_decisions (case_id, staff_name, action, note)
  values (v_case, 'System', 'raised', 'Case raised from ' || replace(p_source, '_', ' '));
  return v_case;
end;
$$;

revoke all on function public.raise_case(case_kind, uuid, uuid, text, uuid, text) from public, anon, authenticated;

-- --- Sources -----------------------------------------------------------------

-- Locked-inbox reports are marked as such, so reviewers know the reporter
-- couldn't read the messages.
alter table public.reports add column from_locked_inbox boolean not null default false;

-- 0012's blind report and block, unchanged except that the report is marked.
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

  insert into reports (reporter_id, reported_id, reason, detail, from_locked_inbox)
  select v_me, m.sender_id, p_reason, p_detail, true
  from messages m
  join threads t on t.id = m.thread_id
  where m.sender_id <> v_me
    and (t.member_a = v_me or t.member_b = v_me)
    and m.read_at is null
  group by m.sender_id;
end;
$$;

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

create or replace function public.report_label(r report_reason)
returns text
language sql
immutable
as $$
  select case r
    when 'user_is_married' then 'Married'
    when 'scam_or_fraud' then 'Scam or fraud'
    when 'asked_for_money' then 'Asking for money'
    when 'fake_profile' then 'Not who they say they are'
    when 'photos_not_them' then 'These photos aren''t them'
    when 'harassment' then 'Harassment'
    when 'threats_or_coercion' then 'Threats or pressure'
    when 'underage' then 'Seems underage'
    else 'Something else'
  end;
$$;

-- Reports -> cases. The reporter's free-text detail is NOT copied into the
-- summary: reviewers read it on the report itself, where the rules allow.
create or replace function public.case_from_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
  v_kind case_kind;
  v_summary text;
begin
  if new.reported_id is null then
    return new;
  end if;
  select count(*) into v_n from reports where reported_id = new.reported_id and reason = new.reason;

  if new.reason = 'user_is_married' then
    v_kind := 'married';
    v_summary := case when v_n = 1
      then 'A match says this member is married. First report on the account.'
      else v_n || ' separate matches say this member is married.' end;
  elsif new.from_locked_inbox then
    v_kind := 'blind';
    v_summary := case when v_n = 1
      then 'Reported from a locked inbox as “' || report_label(new.reason) || '”. The reporter hasn''t read the messages.'
      else v_n || ' locked-inbox reports, all “' || report_label(new.reason) || '”.' end;
  else
    v_kind := 'safety';
    v_summary := case when v_n = 1
      then 'Reported for “' || report_label(new.reason) || '”. First report of this kind.'
      else v_n || ' reports for “' || report_label(new.reason) || '”.' end;
  end if;

  perform raise_case(v_kind, new.reported_id, new.reporter_id, 'report', new.id, v_summary);
  return new;
end;
$$;

create trigger reports_raise_case
  after insert on public.reports
  for each row execute function public.case_from_report();

-- Pricing-integrity signals -> cases (a person decides; never automatic).
create or replace function public.case_from_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform raise_case('pricing', new.profile_id, null, 'integrity_review', new.id,
    case new.signal
      when 'payment_geography_mismatch' then 'Pricing signal: where they pay from doesn''t match their plan.'
      when 'phone_origin_mismatch' then 'Pricing signal: their phone number''s country doesn''t match their plan.'
      else 'Pricing signal: where they sign in from doesn''t match their plan.'
    end);
  return new;
end;
$$;

create trigger integrity_reviews_raise_case
  after insert on public.integrity_reviews
  for each row execute function public.case_from_integrity();

-- Borderline photo and selfie checks -> cases.
create or replace function public.case_from_photo_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_verified boolean;
begin
  if new.face_match <> 'review' or old.face_match = 'review' then
    return new;
  end if;
  select stage in ('verified_real', 'id_confirmed') into v_verified from profiles where id = new.profile_id;
  if v_verified then
    perform raise_case('photo', new.profile_id, null, 'photo_check', new.id,
      case when old.face_match = 'mismatch'
        then 'The member asked a person to look: their new main photo didn''t look like their selfie.'
        else 'Main photo may not match the verified selfie. The automatic check was borderline.' end);
  else
    perform raise_case('selfie', new.profile_id, null, 'selfie_check', new.id,
      case when old.face_match = 'mismatch'
        then 'The member asked a person to look: their main photo didn''t look like their selfie.'
        else 'Onboarding selfie needs a person: the automatic result was uncertain.' end);
  end if;
  return new;
end;
$$;

create trigger profile_photos_raise_case
  after update of face_match on public.profile_photos
  for each row execute function public.case_from_photo_review();

-- --- Deciding ------------------------------------------------------------------

-- End a member's Couple Mode, un-pausing the partner (0006's trigger does it).
create or replace function public.end_couple_of(p_profile_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update couples set status = 'ended'
   where status in ('active', 'proposed') and (member_a = p_profile_id or member_b = p_profile_id);
$$;

revoke all on function public.end_couple_of(uuid) from public, anon, authenticated;

-- A reviewer's decision. STAFF ONLY. Every call writes the decision log
-- first; there is no path that acts without a named person and a reason.
-- Returns the storage path of a replaced main photo, if one was replaced.
create or replace function public.decide_case(p_case bigint, p_action text, p_note text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c review_cases;
  v_me staff_members;
  v_reason standing_reason;
  v_replaced text;
begin
  select * into v_me from staff_members where user_id = auth.uid();
  if v_me.user_id is null then
    raise exception 'Staff only.' using errcode = '42501';
  end if;

  select * into c from review_cases where id = p_case for update;
  if c.id is null then raise exception 'No such case.'; end if;
  if c.status = 'decided' then raise exception 'This case is already decided.'; end if;

  if p_action = 'assign' then
    update review_cases set assigned_to = v_me.user_id, status = 'in_review', updated_at = now() where id = c.id;
    insert into review_decisions (case_id, staff_id, staff_name, action, note)
    values (c.id, v_me.user_id, v_me.display_name, 'assign', 'Assigned to self.');
    return null;
  end if;

  if coalesce(char_length(trim(p_note)), 0) < 12 then
    raise exception 'A reason is required: a short sentence is enough.';
  end if;

  if c.kind in ('photo', 'selfie') then
    if p_action not in ('confirm_match', 'not_match', 'restrict', 'remove') then
      raise exception 'Not a decision for a photo check.';
    end if;
  elsif p_action not in ('clear', 'switch', 'reverify', 'restrict', 'remove')
     or (p_action = 'switch' and c.kind <> 'pricing') then
    raise exception 'Not a decision for this case.';
  end if;

  insert into review_decisions (case_id, staff_id, staff_name, action, note)
  values (c.id, v_me.user_id, v_me.display_name, p_action, trim(p_note));

  v_reason := case c.kind
    when 'pricing' then 'pricing'::standing_reason
    when 'married' then 'married'::standing_reason
    when 'photo' then 'photos'::standing_reason
    when 'selfie' then 'verification'::standing_reason
    else 'safety'::standing_reason end;

  if p_action = 'confirm_match' then
    if c.kind = 'selfie' then
      v_replaced := record_onboarding_check(c.source_id, 'passed', 'matched');
    else
      v_replaced := record_main_photo_match(c.source_id, 'matched');
    end if;
    update review_cases set status = 'decided', decided_at = now(), updated_at = now() where id = c.id;

  elsif p_action = 'not_match' then
    if c.kind = 'selfie' then
      perform record_onboarding_check(c.source_id, 'retake', 'mismatch', 'not_matching');
    else
      perform record_main_photo_match(c.source_id, 'mismatch', 'not_matching');
    end if;
    update review_cases set status = 'decided', decided_at = now(), updated_at = now() where id = c.id;

  elsif p_action = 'clear' then
    -- Cleared: lift any restriction this review placed, and release any
    -- identifiers held for it while the member's deletion waited.
    update profiles set standing = 'good', standing_reason = null, standing_changed_at = now()
     where id = c.subject_id and standing = 'restricted';
    delete from blocked_identifiers where case_id = c.id and retain_until is null;
    update review_cases set status = 'decided', decided_at = now(), updated_at = now() where id = c.id;

  elsif p_action in ('switch', 'reverify') then
    if p_action = 'reverify' then
      update profiles set reverification_requested_at = now() where id = c.subject_id;
    end if;
    update review_cases set status = 'waiting_on_member', updated_at = now() where id = c.id;

  elsif p_action = 'restrict' then
    update profiles set standing = 'restricted', standing_reason = v_reason, standing_changed_at = now()
     where id = c.subject_id and standing = 'good';
    perform end_couple_of(c.subject_id);
    update review_cases set status = 'in_review', assigned_to = v_me.user_id, updated_at = now() where id = c.id;

  elsif p_action = 'remove' then
    update profiles set standing = 'removed', standing_reason = v_reason, standing_changed_at = now()
     where id = c.subject_id;
    perform end_couple_of(c.subject_id);
    -- Two years from removal. If the member already deleted their account,
    -- identifiers held for this case become the two-year entries.
    if c.subject_id is not null then
      perform block_identifiers_of(c.subject_id, v_reason, c.id, now() + interval '2 years');
    end if;
    update blocked_identifiers set retain_until = now() + interval '2 years', reason = v_reason
     where case_id = c.id and retain_until is null;
    update review_cases set status = 'decided', decided_at = now(), updated_at = now() where id = c.id;
  end if;

  return v_replaced;
end;
$$;

revoke all on function public.decide_case(bigint, text, text) from public, anon;
grant execute on function public.decide_case(bigint, text, text) to authenticated;

-- --- What a reviewer may see -------------------------------------------------
--
-- Built field by field from what the rules allow. No message body, no Gist
-- content, no genotype, no raw selfie or ID image, no ID number, no phone
-- number, no free-text profile fields. The reporter's own free-text detail
-- is the one exception: it was written FOR the reviewer.

create or replace function public.review_member_id(p uuid)
returns text
language sql
immutable
as $$ select 'M-' || upper(left(replace(p::text, '-', ''), 6)) $$;

create or replace function public.review_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_staff() then raise exception 'Staff only.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'kind', c.kind, 'summary', c.summary, 'status', c.status,
      'created_at', c.created_at,
      'assignee', (select display_name from staff_members s where s.user_id = c.assigned_to)
    ) order by c.created_at)
    from review_cases c
  ), '[]'::jsonb);
end;
$$;

create or replace function public.review_member_card(p uuid, p_role text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'role', p_role,
    'id', review_member_id(p),
    'plan', current_tier(p),
    'since', pr.created_at,
    'city', pr.city,
    'standing', pr.standing
  )
  from profiles pr where pr.id = p;
$$;

revoke all on function public.review_member_card(uuid, text) from public, anon, authenticated;

create or replace function public.review_case_detail(p_case bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c review_cases;
  s uuid;
begin
  if not is_staff() then raise exception 'Staff only.' using errcode = '42501'; end if;
  select * into c from review_cases where id = p_case;
  if c.id is null then return null; end if;
  s := c.subject_id;

  return jsonb_build_object(
    'id', c.id, 'kind', c.kind, 'summary', c.summary, 'status', c.status,
    'source', c.source, 'created_at', c.created_at,
    'assignee', (select display_name from staff_members st where st.user_id = c.assigned_to),
    'subject_deleted', s is null,
    'members', jsonb_build_array(
      coalesce(review_member_card(s, case when c.kind in ('blind', 'married', 'safety') then 'Reported member' else 'Member' end),
               jsonb_build_object('role', 'Member', 'id', review_member_id(c.subject_ref), 'deleted', true))
    ) || case when c.other_id is not null
              then jsonb_build_array(review_member_card(c.other_id, case when c.source = 'report' then 'Reporter' else 'Other member' end))
              else '[]'::jsonb end,

    -- Verification: outcomes and dates only.
    'verification', (select jsonb_build_object(
        'phone_confirmed', p.phone_verified_at, 'liveness_passed', p.liveness_verified_at,
        'id_check_passed', p.id_confirmed_at, 'reverification_requested', p.reverification_requested_at)
      from profiles p where p.id = s),

    -- Reports ABOUT the subject: categories and counts, plus this report's
    -- own detail (written for the reviewer).
    'report', (select jsonb_build_object(
        'reason', report_label(r.reason), 'detail', r.detail, 'from_locked_inbox', r.from_locked_inbox,
        'reporter_could_read', case when r.reporter_id is null then null else can_read_inbox(r.reporter_id) end,
        'messages_from_reported_to_reporter', (select count(*) from messages m join threads t on t.id = m.thread_id
            where m.sender_id = r.reported_id and r.reporter_id in (t.member_a, t.member_b)))
      from reports r where c.source = 'report' and r.id = c.source_id),
    'report_history', (select coalesce(jsonb_object_agg(lbl, n), '{}'::jsonb) from (
        select report_label(reason) as lbl, count(*) as n from reports where reported_id = s group by reason) x),
    'conversations_opened_30d', (select count(*) from threads t where s in (t.member_a, t.member_b)
        and t.created_at > now() - interval '30 days'),
    'earlier_cases', (select count(*) from review_cases e where e.subject_ref = c.subject_ref and e.id <> c.id),

    -- Pricing: plan, payment geography by currency, time zone and country.
    'pricing', case when c.kind = 'pricing' then (select jsonb_build_object(
        'plan', current_tier(p.id), 'profile_country', p.country_code, 'time_zone', p.time_zone,
        'payments', (select coalesce(jsonb_agg(jsonb_build_object('provider', py.provider, 'currency', py.currency,
            'status', py.status, 'at', py.created_at) order by py.created_at desc), '[]'::jsonb)
          from (select * from payments where profile_id = p.id order by created_at desc limit 5) py),
        'signal', (select jsonb_build_object('signal', ir.signal, 'detail', ir.detail)
          from integrity_reviews ir where ir.id = c.source_id))
      from profiles p where p.id = s) end,

    -- Photo and selfie checks: the profile photos (which other members see
    -- anyway) and their check status — never the selfie.
    'photos', case when c.kind in ('photo', 'selfie') then (select coalesce(jsonb_agg(jsonb_build_object(
        'id', ph.id, 'path', ph.storage_path, 'face_match', ph.face_match,
        'role', case when ph.id = c.source_id then 'Under review'
                     when ph.id = (select main_photo_id from profiles where id = s) then 'Current main photo'
                     else 'Other photo' end) order by (ph.id = c.source_id) desc, ph.position), '[]'::jsonb)
      from profile_photos ph where ph.profile_id = s) end,

    'history', (select coalesce(jsonb_agg(jsonb_build_object(
        'at', d.created_at, 'who', d.staff_name, 'action', d.action, 'note', d.note) order by d.created_at), '[]'::jsonb)
      from review_decisions d where d.case_id = c.id)
  );
end;
$$;

create or replace function public.review_history(p_case bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_staff() then raise exception 'Staff only.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'at', d.created_at, 'who', d.staff_name, 'action', d.action, 'note', d.note,
      'case', c.id, 'kind', c.kind, 'summary', c.summary, 'member', review_member_id(c.subject_ref)
    ) order by d.created_at desc)
    from review_decisions d join review_cases c on c.id = d.case_id
    where p_case is null or c.id = p_case
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.review_queue() from public, anon;
revoke all on function public.review_case_detail(bigint) from public, anon;
revoke all on function public.review_history(bigint) from public, anon;
grant execute on function public.review_queue() to authenticated;
grant execute on function public.review_case_detail(bigint) to authenticated;
grant execute on function public.review_history(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Deleting an account while a review is open
-- ---------------------------------------------------------------------------

-- Told to the member on the deletion screen (account-delete prototype).
create or replace function public.has_open_review()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from review_cases where subject_ref = auth.uid() and status <> 'decided');
$$;

revoke all on function public.has_open_review() from public, anon;
grant execute on function public.has_open_review() to authenticated;

-- 0016's preparation, plus: identifiers are HELD while a review is open,
-- until it is settled (decided 2026-10-05). In good standing with nothing
-- open, nothing is held and the number is free again.
create or replace function public.prepare_account_deletion(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  v_log uuid;
  v_payments integer;
  v_reports integer;
  v_case bigint;
begin
  if not exists (select 1 from profiles where id = p_profile_id) then
    raise exception 'No such account.';
  end if;

  perform end_couple_of(p_profile_id);

  for c in
    select id from date_commitments
    where status in ('pending', 'confirmed')
      and (member_a = p_profile_id or member_b = p_profile_id)
  loop
    perform settle_commitment(c.id, 'cancelled');
  end loop;

  update payments set account_deleted_at = now() where profile_id = p_profile_id;
  get diagnostics v_payments = row_count;
  update reports set account_deleted_at = now()
   where reporter_id = p_profile_id or reported_id = p_profile_id;
  get diagnostics v_reports = row_count;

  select id into v_case from review_cases
   where subject_ref = p_profile_id and status <> 'decided' order by created_at limit 1;
  if v_case is not null then
    perform block_identifiers_of(p_profile_id, null, v_case, null);
  end if;

  insert into account_deletions (profile_id, payments_kept, reports_kept)
  values (p_profile_id, v_payments, v_reports)
  returning id into v_log;

  return jsonb_build_object(
    'log_id', v_log,
    'held_for_review', v_case is not null,
    'photo_paths', coalesce((
      select jsonb_agg(storage_path) from profile_photos where profile_id = p_profile_id
    ), '[]'::jsonb),
    'attachment_paths', coalesce((
      select jsonb_agg(a.storage_path)
      from message_attachments a
      join messages m on m.id = a.message_id
      where m.sender_id = p_profile_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;

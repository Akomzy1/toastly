-- 0050 — the founding-members beta: applications, the invite-only gate, the staff
-- approval functions, founding members, feedback, and retention.
--
-- Decided by the owner (25 October 2026): 200 founding members, Lagos only for
-- now, 3 months of free Premium from PUBLIC LAUNCH DAY, applications open 27
-- October.
--
--   1. beta_settings       the cap, the target split, when applications open,
--                           when the beta closes, Lagos-only. One row.
--   2. beta_applications   what an applicant gives us — nothing else (no photos,
--                           ethnicity, religion, health or income). Insert only
--                           through beta_apply(), service role only. A number
--                           outside Lagos is saved 'waitlisted' and can never be
--                           approved while the beta is Lagos-only (a trigger,
--                           not just the screen).
--   3. the gate            beta_number_approved(): is this number approved?
--                           Asked BEFORE any SMS is sent.
--   4. founding_members    created when an approved applicant confirms their
--                           phone while the beta is open. The perk starts only
--                           when start_founding_perk(launch_date) is run. Nobody
--                           can read the table; nothing reads it for ranking.
--                           No stacking: the women's 30-day offer is not given
--                           to a founding member.
--   5. staff functions     overview, list, decide (single or batch, with a wave),
--                           settings. Staff only, audited, no export.
--   6. beta_feedback       from Settings. Staff view only.
--   7. retention           pg_cron deletes unused applications 90 days after
--                           their last status change.
--
-- What is NOT here, on purpose: the billing entitlement that applies the three
-- months (reported separately — it is built at launch), any badge or label for
-- a founding member, any messaging to applicants.

-- ---------------------------------------------------------------------------
-- 1. Settings
-- ---------------------------------------------------------------------------

create table if not exists public.beta_settings (
  id boolean primary key default true check (id),
  cap integer not null default 200 check (cap between 1 and 100000),
  -- A target for staff to steer by, not a gate: the screen shows how far the
  -- approved list is from it. Whole percent of women.
  women_target_pct integer not null default 55 check (women_target_pct between 0 and 100),
  -- Applications open on 27 October 2026, midnight in Lagos.
  applications_open_at timestamptz not null default timestamptz '2026-10-27 00:00:00+01',
  -- null while the beta is open. Once it is in the past, nobody new becomes a
  -- founding member (an approved applicant can still sign up).
  beta_closes_at timestamptz,
  -- Lagos only for now. Not staff-editable: widening the beta is a decision,
  -- made in a migration, not a switch on a screen.
  lagos_only boolean not null default true,
  -- Set once, by start_founding_perk(). null until public launch.
  founding_perk_starts_on date,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.beta_settings (id) values (true) on conflict do nothing;
alter table public.beta_settings enable row level security;
revoke all on public.beta_settings from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Applications
-- ---------------------------------------------------------------------------

create table if not exists public.beta_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  first_name text not null check (char_length(first_name) between 1 and 40),
  age integer not null check (age between 18 and 99),
  gender text not null check (gender in ('woman', 'man')),
  location_type text not null check (location_type in ('lagos', 'elsewhere_nigeria', 'outside_nigeria')),
  lagos_area text check (lagos_area in
    ('lekki', 'victoria_island_ikoyi', 'ajah', 'yaba', 'surulere', 'ikeja', 'ikorodu', 'maryland', 'festac', 'other_lagos')),
  -- The state or country, for someone not in Lagos.
  other_location text check (char_length(other_location) between 1 and 80),
  -- The number, so staff can send the invite. Removed (set to null) the moment
  -- the number signs up (beta_claim): after that nothing needs it.
  phone_e164 text check (phone_e164 ~ '^\+234[0-9]{10}$'),
  -- Keyed one-way form of the number: one application per number, and the gate
  -- looks the number up by it. The key is made by the server (PHONE_HASH_PEPPER).
  phone_key text not null unique check (char_length(phone_key) = 64),
  source text not null check (source ~ '^[a-z_]{1,30}$'),
  consent_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'waitlisted', 'declined')),
  status_changed_at timestamptz not null default now(),
  wave integer check (wave between 1 and 99),
  approved_at timestamptz,
  used_at timestamptz,
  check ((location_type = 'lagos') = (lagos_area is not null)),
  check ((location_type = 'lagos') = (other_location is null)),
  check (phone_e164 is not null or used_at is not null),
  check (status <> 'approved' or approved_at is not null)
);
create index if not exists beta_applications_status_idx on public.beta_applications (status, created_at);
create index if not exists beta_applications_changed_idx on public.beta_applications (status_changed_at);
alter table public.beta_applications enable row level security;
revoke all on public.beta_applications from anon, authenticated;

-- The two rules that must hold however a row is written (a staff function, a
-- script, a mistake): a number outside Lagos is never approved while the beta
-- is Lagos-only, and approvals never go past the cap. Locking the settings row
-- makes two approvals at once take turns.
create or replace function public.beta_application_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s beta_settings;
  v_taken integer;
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    select * into s from beta_settings for update;
    if s.lagos_only and new.location_type <> 'lagos' then
      raise exception 'The beta is open to Lagos only for now.' using errcode = '23514';
    end if;
    select count(*) into v_taken from beta_applications where status = 'approved' and id <> new.id;
    if v_taken >= s.cap then
      raise exception 'The beta is full (% approved).', s.cap using errcode = '23514';
    end if;
    new.approved_at := coalesce(new.approved_at, now());
  end if;
  if new.status <> 'approved' then
    new.approved_at := null;
  end if;
  return new;
end;
$$;
revoke all on function public.beta_application_guard() from public, anon, authenticated;
drop trigger if exists beta_application_guard on public.beta_applications;
create trigger beta_application_guard before insert or update on public.beta_applications
  for each row execute function public.beta_application_guard();

-- Our own rate limit on the public form: five an hour from one address (and a
-- ceiling for the whole form in case of a flood). The address is only ever
-- stored as a keyed one-way key made by the server, and rows go after a day.
create table if not exists public.beta_apply_attempts (
  id bigint generated always as identity primary key,
  ip_key text not null,
  at timestamptz not null default now()
);
create index if not exists beta_apply_attempts_idx on public.beta_apply_attempts (ip_key, at);
alter table public.beta_apply_attempts enable row level security;
revoke all on public.beta_apply_attempts from anon, authenticated;

create or replace function public.beta_apply_allow(p_ip_key text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_ip_key is null or char_length(p_ip_key) <> 64 then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtext('beta_apply:' || p_ip_key));
  delete from beta_apply_attempts where at < now() - interval '1 day';
  if (select count(*) from beta_apply_attempts where ip_key = p_ip_key and at > now() - interval '1 hour') >= 5 then
    return false;
  end if;
  if (select count(*) from beta_apply_attempts where at > now() - interval '1 hour') >= 600 then
    return false;
  end if;
  insert into beta_apply_attempts (ip_key) values (p_ip_key);
  return true;
end;
$$;
revoke all on function public.beta_apply_allow(text) from public, anon, authenticated;
grant execute on function public.beta_apply_allow(text) to service_role;

-- Store an application. The server has already checked the fields; the table's
-- own checks check them again. Returns 'stored', 'duplicate' (this number has
-- already applied — the server answers exactly as for 'stored', so the form
-- never tells anyone whether a number applied) or 'not_open'.
create or replace function public.beta_apply(
  p_first_name text, p_age integer, p_gender text, p_location_type text, p_lagos_area text,
  p_other_location text, p_phone_e164 text, p_phone_key text, p_source text, p_consent boolean
) returns text language plpgsql security definer set search_path = public as $$
declare
  s beta_settings;
  v_status text;
  v_id uuid;
begin
  select * into s from beta_settings;
  if now() < s.applications_open_at then
    return 'not_open';
  end if;
  if p_consent is not true then
    raise exception 'Consent is required.' using errcode = '22023';
  end if;
  -- Outside Lagos is waitlisted automatically while the beta is Lagos-only.
  v_status := case when s.lagos_only and p_location_type <> 'lagos' then 'waitlisted' else 'pending' end;
  insert into beta_applications (first_name, age, gender, location_type, lagos_area, other_location,
                                 phone_e164, phone_key, source, consent_at, status)
  values (btrim(p_first_name), p_age, p_gender, p_location_type, p_lagos_area, p_other_location,
          p_phone_e164, p_phone_key, p_source, now(), v_status)
  on conflict (phone_key) do nothing
  returning id into v_id;
  return case when v_id is null then 'duplicate' else 'stored' end;
end;
$$;
revoke all on function public.beta_apply(text, integer, text, text, text, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.beta_apply(text, integer, text, text, text, text, text, text, text, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 3. The gate
-- ---------------------------------------------------------------------------

-- Is this number approved? Yes or no, nothing else. Asked before any SMS is
-- sent. A waitlisted, declined or pending application is "no" — and so is a
-- number that never applied: the caller must not be able to tell them apart.
-- The Lagos check is repeated here on purpose: a number outside Lagos cannot
-- pass the gate even if a row somehow said 'approved'.
create or replace function public.beta_number_approved(p_phone_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from beta_applications a, beta_settings s
     where a.phone_key = p_phone_key
       and a.status = 'approved'
       and (a.location_type = 'lagos' or not s.lagos_only)
  );
$$;
revoke all on function public.beta_number_approved(text) from public, anon, authenticated;
grant execute on function public.beta_number_approved(text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Founding members
-- ---------------------------------------------------------------------------

create table if not exists public.founding_members (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  granted_at timestamptz not null default now(),
  perk text not null default 'premium_3_months' check (perk = 'premium_3_months'),
  -- null until start_founding_perk() runs on public launch day.
  starts_at timestamptz
);
-- Nobody reads this through the API: no policy, no grant. Staff see counts
-- through staff_beta_overview(); the billing step at launch runs as the server.
alter table public.founding_members enable row level security;
revoke all on public.founding_members from anon, authenticated;

-- The perk is three months, the same for everyone. One place, so "the same
-- three months" is one definition and not a number in several places.
create or replace function public.founding_perk_ends(p_starts_at timestamptz)
returns timestamptz language sql immutable as $$
  select p_starts_at + interval '3 months';
$$;
revoke all on function public.founding_perk_ends(timestamptz) from public, anon, authenticated;
grant execute on function public.founding_perk_ends(timestamptz) to service_role;

-- No stacking, anywhere (owner, 25 October 2026): a member holds at most one
-- free-Premium grant, and the founding grant replaces the women's 30-day offer
-- and any other launch or promo offer for free time. Every free-time source has
-- to be listed here; a new one that isn't is a gap.
create or replace function public.founding_blocks_free_grants()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from founding_members where user_id = new.profile_id) then
    if new.source = 'womens_launch_offer' then
      return null;
    elsif new.source = 'manual_grant' then
      raise exception 'This member already holds the founding grant; free time does not stack.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.founding_blocks_free_grants() from public, anon, authenticated;
drop trigger if exists founding_blocks_free_grants on public.entitlements;
create trigger founding_blocks_free_grants before insert on public.entitlements
  for each row execute function public.founding_blocks_free_grants();

-- The women's launch offer is skipped for a founding member (the trigger above
-- is the backstop, but this stops the phone-number record being used up for an
-- offer the member never gets).
create or replace function public.grant_launch_offer()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_hash text;
begin
  if old.first_live_at is not null or new.first_live_at is null or new.gender is distinct from 'woman' then
    return new;
  end if;
  if exists (select 1 from founding_members where user_id = new.id) then
    return new;
  end if;
  select phone_hash into v_hash from phone_identities where profile_id = new.id;
  if v_hash is null then
    return new;
  end if;
  insert into launch_offer_grants (phone_hash, profile_id) values (v_hash, new.id)
    on conflict (phone_hash) do nothing;
  if not found then
    return new;
  end if;
  insert into entitlements (profile_id, tier, source, starts_at, ends_at)
  values (new.id,
          case when new.country_code = 'NG' then 'premium_plus'::tier else 'diaspora_plus'::tier end,
          'womens_launch_offer', new.first_live_at, new.first_live_at + interval '30 days');
  return new;
end;
$$;
revoke all on function public.grant_launch_offer() from public, anon, authenticated;

-- An approved number signs up: mark the invitation used, remove the raw number
-- (nothing needs it now), and — while the beta is open — make the member a
-- founding member. Same for every wave: eligibility never depends on when. Safe
-- to run twice: the second run changes nothing.
create or replace function public.beta_claim(p_profile uuid, p_phone_key text)
returns text language plpgsql security definer set search_path = public as $$
declare
  a beta_applications;
  s beta_settings;
  v_start timestamptz;
begin
  select * into a from beta_applications where phone_key = p_phone_key and status = 'approved' for update;
  if not found then
    return 'none';
  end if;
  if a.used_at is not null then
    return 'already_used';
  end if;
  update beta_applications set used_at = now(), phone_e164 = null where id = a.id;

  select * into s from beta_settings;
  if s.beta_closes_at is not null and s.beta_closes_at <= now() then
    return 'used_beta_closed';
  end if;
  -- One free grant at most: a member who somehow already holds free time keeps
  -- that and is not given a second.
  if exists (select 1 from entitlements
              where profile_id = p_profile and source in ('womens_launch_offer', 'manual_grant')
                and (ends_at is null or ends_at > now())) then
    return 'used_has_grant';
  end if;
  -- Before launch the perk has no start; after start_founding_perk() a later
  -- joiner starts at once, so joining late never shortens the three months.
  v_start := case when s.founding_perk_starts_on is null then null
                  else greatest((s.founding_perk_starts_on::timestamp at time zone 'Africa/Lagos'), now()) end;
  insert into founding_members (user_id, starts_at) values (p_profile, v_start)
    on conflict (user_id) do nothing;
  return 'founding';
end;
$$;
revoke all on function public.beta_claim(uuid, text) from public, anon, authenticated;
grant execute on function public.beta_claim(uuid, text) to service_role;

-- Binding a verified number and claiming the invitation in ONE transaction, so
-- a number is never recorded without its invitation being used.
create or replace function public.record_phone_verified_beta(p_profile uuid, p_hash text, p_beta_key text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_result text;
begin
  v_result := record_phone_verified(p_profile, p_hash);
  if v_result = 'ok' and p_beta_key is not null then
    perform beta_claim(p_profile, p_beta_key);
  end if;
  return v_result;
end;
$$;
revoke all on function public.record_phone_verified_beta(uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_phone_verified_beta(uuid, text, text) to service_role;

-- The audit log for everything staff do to the beta. Append-only; no foreign
-- keys, so it outlives an application's deletion. Never holds a phone number.
-- staff_id is null when the server itself acted (start_founding_perk).
create table if not exists public.beta_audit_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  staff_id uuid,
  action text not null,
  application_id uuid,
  detail jsonb not null default '{}'::jsonb
);
alter table public.beta_audit_log enable row level security;
revoke all on public.beta_audit_log from anon, authenticated;
create or replace function public.beta_audit_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'The beta audit log is append-only.' using errcode = '42501';
end;
$$;
revoke all on function public.beta_audit_append_only() from public, anon, authenticated;
drop trigger if exists beta_audit_append_only on public.beta_audit_log;
create trigger beta_audit_append_only before update or delete on public.beta_audit_log
  for each row execute function public.beta_audit_append_only();

-- Public launch day: every founding member's three months start now, together.
-- Run once, by the owner, on the day. A second run changes nothing (the date is
-- set once). Payments stay off until LAUNCH_PAYMENTS_ENABLED is switched on; the
-- billing step that turns this into an entitlement is separate (reported, not built).
create or replace function public.start_founding_perk(p_launch_date date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s beta_settings;
  v_n integer;
begin
  if p_launch_date is null or p_launch_date < current_date - 1 then
    raise exception 'Give the public launch date (today or later).' using errcode = '22023';
  end if;
  select * into s from beta_settings for update;
  if s.founding_perk_starts_on is not null then
    return jsonb_build_object('changed', 0, 'starts_on', s.founding_perk_starts_on);
  end if;
  update beta_settings set founding_perk_starts_on = p_launch_date, updated_at = now() where id;
  update founding_members
     set starts_at = (p_launch_date::timestamp at time zone 'Africa/Lagos')
   where starts_at is null;
  get diagnostics v_n = row_count;
  insert into beta_audit_log (staff_id, action, detail)
  values (null, 'start_founding_perk', jsonb_build_object('launch_date', p_launch_date, 'members', v_n));
  return jsonb_build_object('changed', v_n, 'starts_on', p_launch_date);
end;
$$;
revoke all on function public.start_founding_perk(date) from public, anon, authenticated;
grant execute on function public.start_founding_perk(date) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Staff: the approval screen's functions. Staff only (_require_staff), every
--    change audited. No export and no messaging: the numbers of approved,
--    unused applications are shown so the owner can send invitations by hand.
-- ---------------------------------------------------------------------------

create or replace function public.staff_beta_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  s beta_settings;
  v_approved integer;
  v_women integer;
begin
  perform _require_staff();
  select * into s from beta_settings;
  select count(*), count(*) filter (where gender = 'woman') into v_approved, v_women
    from beta_applications where status = 'approved';
  return jsonb_build_object(
    'settings', jsonb_build_object(
      'cap', s.cap, 'women_target_pct', s.women_target_pct,
      'applications_open_at', s.applications_open_at, 'beta_closes_at', s.beta_closes_at,
      'lagos_only', s.lagos_only, 'founding_perk_starts_on', s.founding_perk_starts_on),
    'approved', jsonb_build_object(
      'total', v_approved, 'women', v_women, 'men', v_approved - v_women,
      'women_pct', case when v_approved = 0 then null else round(100.0 * v_women / v_approved) end,
      'places_left', greatest(s.cap - v_approved, 0)),
    'by_status', coalesce((select jsonb_object_agg(status, n) from
      (select status, count(*) as n from beta_applications group by status) t), '{}'::jsonb),
    'by_gender', coalesce((select jsonb_object_agg(gender, n) from
      (select gender, count(*) as n from beta_applications group by gender) t), '{}'::jsonb),
    'by_area', coalesce((select jsonb_object_agg(area, n) from
      (select coalesce(lagos_area, location_type) as area, count(*) as n from beta_applications group by 1) t), '{}'::jsonb),
    -- The demand signal for opening other places: kept apart from the Lagos list.
    'waitlisted_elsewhere', jsonb_build_object(
      'elsewhere_nigeria', (select count(*) from beta_applications where status = 'waitlisted' and location_type = 'elsewhere_nigeria'),
      'outside_nigeria', (select count(*) from beta_applications where status = 'waitlisted' and location_type = 'outside_nigeria')),
    'founding_member_count', (select count(*) from founding_members)
  );
end;
$$;
revoke all on function public.staff_beta_overview() from public, anon;
grant execute on function public.staff_beta_overview() to authenticated;

create or replace function public.staff_beta_list(
  p_status text default null, p_gender text default null, p_area text default null,
  p_limit integer default 100, p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_rows jsonb;
  v_total integer;
begin
  perform _require_staff();
  select count(*) into v_total from beta_applications a
   where (p_status is null or a.status = p_status)
     and (p_gender is null or a.gender = p_gender)
     and (p_area is null or coalesce(a.lagos_area, a.location_type) = p_area);
  select coalesce(jsonb_agg(r order by r.created_at), '[]'::jsonb) into v_rows from (
    select a.id, a.created_at, a.first_name, a.age, a.gender, a.location_type, a.lagos_area,
           a.other_location, a.source, a.status, a.wave, a.approved_at, a.used_at,
           -- Only an approved, not-yet-used number is shown: that is the one the
           -- owner needs to send an invitation to.
           case when a.status = 'approved' and a.used_at is null then a.phone_e164 end as phone
      from beta_applications a
     where (p_status is null or a.status = p_status)
       and (p_gender is null or a.gender = p_gender)
       and (p_area is null or coalesce(a.lagos_area, a.location_type) = p_area)
     order by a.created_at
     limit least(greatest(coalesce(p_limit, 100), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
  ) r;
  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;
revoke all on function public.staff_beta_list(text, text, text, integer, integer) from public, anon;
grant execute on function public.staff_beta_list(text, text, text, integer, integer) to authenticated;

-- Approve, waitlist or decline — one application or a batch. A batch is all or
-- nothing: if any of it can't be done (over the cap, outside Lagos, already
-- signed up) nothing changes and the reason comes back.
create or replace function public.staff_beta_decide(p_ids uuid[], p_status text, p_wave integer default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a beta_applications;
  s beta_settings;
  v_new_approvals integer := 0;
  v_approved integer;
  v_women integer;
  v_changed integer := 0;
begin
  perform _require_staff();
  if p_status not in ('approved', 'waitlisted', 'declined') then
    raise exception 'Choose approve, waitlist or decline.' using errcode = '22023';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 200 then
    raise exception 'Choose between 1 and 200 applications.' using errcode = '22023';
  end if;
  if p_wave is not null and (p_wave < 1 or p_wave > 99) then
    raise exception 'A wave is a number from 1 to 99.' using errcode = '22023';
  end if;
  select * into s from beta_settings for update;

  for a in select * from beta_applications where id = any (p_ids) order by created_at for update loop
    if a.used_at is not null and a.status <> p_status then
      raise exception 'Someone has already signed up with one of these, so its decision can''t change.' using errcode = '23514';
    end if;
    if p_status = 'approved' and a.status <> 'approved' then
      if s.lagos_only and a.location_type <> 'lagos' then
        raise exception 'The beta is open to Lagos only for now; outside Lagos stays on the waitlist.' using errcode = '23514';
      end if;
      v_new_approvals := v_new_approvals + 1;
    end if;
  end loop;

  select count(*) into v_approved from beta_applications where status = 'approved';
  if v_approved + v_new_approvals > s.cap then
    raise exception 'That would go over the cap of % (% approved so far).', s.cap, v_approved using errcode = '23514';
  end if;

  for a in select * from beta_applications where id = any (p_ids) order by created_at for update loop
    if a.status = p_status and (p_status <> 'approved' or p_wave is not distinct from a.wave or p_wave is null) then
      continue;
    end if;
    update beta_applications
       set status = p_status,
           wave = case when p_status = 'approved' then coalesce(p_wave, wave) else null end
     where id = a.id;
    insert into beta_audit_log (staff_id, action, application_id, detail)
    values (auth.uid(), 'decide', a.id,
            jsonb_build_object('from', a.status, 'to', p_status, 'wave', case when p_status = 'approved' then coalesce(p_wave, a.wave) end));
    v_changed := v_changed + 1;
  end loop;

  select count(*), count(*) filter (where gender = 'woman') into v_approved, v_women
    from beta_applications where status = 'approved';
  return jsonb_build_object(
    'changed', v_changed, 'approved_total', v_approved, 'places_left', greatest(s.cap - v_approved, 0),
    'women_pct', case when v_approved = 0 then null else round(100.0 * v_women / v_approved) end,
    'women_target_pct', s.women_target_pct);
end;
$$;
revoke all on function public.staff_beta_decide(uuid[], text, integer) from public, anon;
grant execute on function public.staff_beta_decide(uuid[], text, integer) to authenticated;

-- The settings staff may change: the cap, the target split, when applications
-- open, and when the beta closes (null = open). A patch: only the keys given.
-- Lagos-only and the launch date are not here on purpose.
create or replace function public.staff_beta_update_settings(p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s beta_settings;
  v_key text;
  v_approved integer;
  v_cap integer;
  v_pct integer;
begin
  perform _require_staff();
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Nothing to change.' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('cap', 'women_target_pct', 'applications_open_at', 'beta_closes_at') then
      raise exception 'That setting can''t be changed here.' using errcode = '22023';
    end if;
  end loop;
  select * into s from beta_settings for update;

  if p_patch ? 'cap' then
    v_cap := (p_patch ->> 'cap')::integer;
    select count(*) into v_approved from beta_applications where status = 'approved';
    if v_cap is null or v_cap < v_approved or v_cap < 1 or v_cap > 100000 then
      raise exception 'The cap can''t be below the % already approved.', v_approved using errcode = '22023';
    end if;
  end if;
  if p_patch ? 'women_target_pct' then
    v_pct := (p_patch ->> 'women_target_pct')::integer;
    if v_pct is null or v_pct < 0 or v_pct > 100 then
      raise exception 'The split is a percentage from 0 to 100.' using errcode = '22023';
    end if;
  end if;

  update beta_settings set
    cap = coalesce(v_cap, cap),
    women_target_pct = coalesce(v_pct, women_target_pct),
    applications_open_at = case when p_patch ? 'applications_open_at'
      then coalesce((p_patch ->> 'applications_open_at')::timestamptz, applications_open_at) else applications_open_at end,
    beta_closes_at = case when p_patch ? 'beta_closes_at' then (p_patch ->> 'beta_closes_at')::timestamptz else beta_closes_at end,
    updated_at = now(), updated_by = auth.uid()
   where id;

  insert into beta_audit_log (staff_id, action, detail)
  select auth.uid(), 'settings',
         jsonb_build_object('before', jsonb_build_object('cap', s.cap, 'women_target_pct', s.women_target_pct,
                                                        'applications_open_at', s.applications_open_at, 'beta_closes_at', s.beta_closes_at),
                            'patch', p_patch);
  return (select to_jsonb(b) - 'id' - 'updated_by' from beta_settings b);
end;
$$;
revoke all on function public.staff_beta_update_settings(jsonb) from public, anon;
grant execute on function public.staff_beta_update_settings(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Feedback (Settings → Send feedback)
-- ---------------------------------------------------------------------------

create table if not exists public.beta_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Goes with the account when it is deleted.
  profile_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (category in ('bug', 'idea', 'safety', 'other')),
  -- The path it was sent from, never the query string.
  page text not null check (char_length(page) between 1 and 120),
  body text not null check (char_length(body) between 1 and 2000)
);
create index if not exists beta_feedback_created_idx on public.beta_feedback (created_at desc);
alter table public.beta_feedback enable row level security;
revoke all on public.beta_feedback from anon, authenticated;

-- Any signed-in member, live or not (feedback is how a stuck new member says
-- so). Ten a day. The page is reduced to a safe path.
create or replace function public.submit_beta_feedback(p_category text, p_page text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_page text;
begin
  if v_me is null or not exists (select 1 from profiles where id = v_me) then
    raise exception 'Please sign in again.' using errcode = '42501';
  end if;
  if p_category not in ('bug', 'idea', 'safety', 'other') then
    raise exception 'Choose a category.' using errcode = '22023';
  end if;
  if p_body is null or char_length(btrim(p_body)) = 0 or char_length(p_body) > 2000 then
    raise exception 'Write a few words (up to 2,000 characters).' using errcode = '22023';
  end if;
  if (select count(*) from beta_feedback where profile_id = v_me and created_at > now() - interval '1 day') >= 10 then
    raise exception 'That''s plenty for today — thank you. Try again tomorrow.' using errcode = '53400';
  end if;
  v_page := split_part(split_part(coalesce(p_page, ''), '?', 1), '#', 1);
  if v_page !~ '^/[A-Za-z0-9/_.\[\]()-]{0,118}$' or v_page like '//%' then
    v_page := '/';
  end if;
  insert into beta_feedback (profile_id, category, page, body) values (v_me, p_category, v_page, btrim(p_body));
end;
$$;
revoke all on function public.submit_beta_feedback(text, text, text) from public, anon;
grant execute on function public.submit_beta_feedback(text, text, text) to authenticated;

create or replace function public.staff_beta_feedback(p_category text default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform _require_staff();
  return jsonb_build_object(
    'total', (select count(*) from beta_feedback where p_category is null or category = p_category),
    'rows', coalesce((select jsonb_agg(r order by r.created_at desc) from (
      select f.id, f.created_at, f.category, f.page, f.body, _staff_label(f.profile_id) as from_member
        from beta_feedback f
       where p_category is null or f.category = p_category
       order by f.created_at desc
       limit least(greatest(coalesce(p_limit, 50), 1), 100) offset greatest(coalesce(p_offset, 0), 0)) r), '[]'::jsonb));
end;
$$;
revoke all on function public.staff_beta_feedback(text, integer, integer) from public, anon;
grant execute on function public.staff_beta_feedback(text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Retention: 90 days after the last status change, an application that
--    never became a member is deleted — declined, waitlisted, still waiting,
--    or approved but never used. An application whose number signed up keeps
--    no phone number (beta_claim removes it) and stays as a count.
-- ---------------------------------------------------------------------------

create or replace function public.purge_beta_applications()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  delete from beta_applications
   where status_changed_at < now() - interval '90 days'
     and (status in ('declined', 'waitlisted', 'pending') or (status = 'approved' and used_at is null));
  get diagnostics v_n = row_count;
  delete from beta_apply_attempts where at < now() - interval '1 day';
  return v_n;
end;
$$;
revoke all on function public.purge_beta_applications() from public, anon, authenticated;
grant execute on function public.purge_beta_applications() to service_role;

do $$ begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule('toastly-purge-beta-applications') where exists (select 1 from cron.job where jobname = 'toastly-purge-beta-applications');
    perform cron.schedule('toastly-purge-beta-applications', '41 3 * * *', 'select public.purge_beta_applications()');
  else
    raise notice 'pg_cron is not enabled: expired beta applications will not be purged until it is.';
  end if;
end $$;

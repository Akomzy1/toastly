-- Toastly — account lifecycle: age, deletion, and what survives deletion.
--
-- Makes three promises in the privacy policy true:
--   1. "You must be 18 or over" — date of birth is collected at signup and
--      an under-18 date is refused by the database, not just the form.
--   2. "You can delete your data" — deletion keeps only what section 8 says
--      is kept, then removes the account (the delete itself is done by the
--      app with the service role; see lib/account-actions.ts).
--   3. "Safety records … so removed members can't simply sign up again" —
--      reports about an account outlive it, and the phone number of an
--      account removed for breaking the rules is blocked from re-registering.
--
-- Safe to run before or after the code that uses it deploys: signup still
-- works without it (the date of birth simply isn't stored yet), and account
-- deletion refuses to proceed until prepare_account_deletion() exists.

-- ---------------------------------------------------------------------------
-- 1. Date of birth — private, and 18 or over
-- ---------------------------------------------------------------------------
--
-- NOT on `profiles`, whose rows every verified member can read. An exact
-- date of birth is more than another member needs, so it gets its own table
-- that only its owner can read.

create table public.profile_birthdates (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  date_of_birth date not null,
  created_at timestamptz not null default now()
);

create or replace function public.enforce_adult()
returns trigger
language plpgsql
as $$
begin
  if new.date_of_birth < date '1900-01-01' or new.date_of_birth > current_date then
    raise exception 'That date of birth is not valid.';
  end if;
  if new.date_of_birth > (current_date - interval '18 years')::date then
    raise exception 'Toastly is for people aged 18 and over.';
  end if;
  return new;
end;
$$;

create trigger profile_birthdates_adult
  before insert or update on public.profile_birthdates
  for each row execute function public.enforce_adult();

-- Carry across any dates already stored, then remove the readable column.
insert into public.profile_birthdates (profile_id, date_of_birth)
select id, date_of_birth
from public.profiles
where date_of_birth is not null
  and date_of_birth >= date '1900-01-01'
  and date_of_birth <= (current_date - interval '18 years')::date;

alter table public.profiles drop column date_of_birth;

alter table public.profile_birthdates enable row level security;

create policy "own birthdate" on public.profile_birthdates
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

-- Signup passes the date in the auth metadata. Once the profile exists, it is
-- copied here — where enforce_adult() refuses an under-18 date and aborts the
-- signup — and then removed from the metadata, which would otherwise travel
-- inside every session token.
create or replace function public.record_signup_birthdate()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_raw text;
  v_dob date;
begin
  select u.raw_user_meta_data ->> 'date_of_birth' into v_raw
  from auth.users u where u.id = new.id;

  if v_raw is null or v_raw = '' then
    return new;
  end if;

  begin
    v_dob := v_raw::date;
  exception when others then
    raise exception 'That date of birth is not valid.';
  end;

  insert into profile_birthdates (profile_id, date_of_birth)
  values (new.id, v_dob)
  on conflict (profile_id) do nothing;

  begin
    update auth.users
       set raw_user_meta_data = raw_user_meta_data - 'date_of_birth'
     where id = new.id;
  exception when others then
    null; -- best effort: never fail a signup over tidying the metadata
  end;

  return new;
end;
$$;

create trigger profiles_record_birthdate
  after insert on public.profiles
  for each row execute function public.record_signup_birthdate();

-- ---------------------------------------------------------------------------
-- 2. What survives an account's deletion
-- ---------------------------------------------------------------------------
--
-- Staff-only: RLS on, no policies. None of these reference `profiles`, so
-- they survive the cascade. They hold the minimum: no reporter identity, no
-- free-text report detail, no name, no email.
--
-- The retention periods mirror privacy policy section 8 — safety records 2
-- years, payment records 6. Change both together.

create table public.retained_safety_records (
  id uuid primary key default gen_random_uuid(),
  former_profile_id uuid not null,
  reason report_reason not null,
  status report_status not null,
  reported_at timestamptz not null,
  retain_until timestamptz not null
);

-- Only for accounts removed for breaking the rules (an 'actioned' report).
-- A report alone never blocks anyone from coming back: reports can be wrong.
create table public.blocked_phone_hashes (
  phone_hash text primary key,
  former_profile_id uuid not null,
  retain_until timestamptz not null
);

create table public.retained_payments (
  id uuid primary key default gen_random_uuid(),
  former_profile_id uuid not null,
  provider payment_provider not null,
  provider_ref text not null,
  amount_minor integer not null,
  currency text not null,
  status payment_status not null,
  purpose text not null,
  paid_at timestamptz not null,
  retain_until timestamptz not null,
  unique (provider, provider_ref)
);

alter table public.retained_safety_records enable row level security;
alter table public.blocked_phone_hashes enable row level security;
alter table public.retained_payments enable row level security;

revoke all on public.retained_safety_records from anon, authenticated;
revoke all on public.blocked_phone_hashes from anon, authenticated;
revoke all on public.retained_payments from anon, authenticated;

-- Called by the member, immediately before their account is deleted. Copies
-- out what section 8 says is kept. Re-running it replaces the earlier copy.
create or replace function public.prepare_account_deletion()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_hash text;
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

revoke all on function public.prepare_account_deletion() from public, anon;
grant execute on function public.prepare_account_deletion() to authenticated;

-- Whether a phone number may verify a new account. Takes the peppered hash,
-- which a client cannot compute, so it cannot be used to probe numbers.
create or replace function public.is_phone_blocked(p_hash text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from blocked_phone_hashes
    where phone_hash = p_hash and retain_until > now()
  );
$$;

revoke all on function public.is_phone_blocked(text) from public, anon;
grant execute on function public.is_phone_blocked(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Retention ends
-- ---------------------------------------------------------------------------

create or replace function public.purge_expired_retention()
returns void
language sql
security definer
set search_path = public
as $$
  delete from retained_safety_records where retain_until < now();
  delete from blocked_phone_hashes where retain_until < now();
  delete from retained_payments where retain_until < now();
$$;

revoke all on function public.purge_expired_retention() from public, anon, authenticated;

-- Runs nightly where pg_cron is enabled. Where it isn't, enable it under
-- Database -> Extensions and re-run this block — otherwise nothing ever
-- reaches the end of its retention period.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('toastly-purge-retention', '17 3 * * *', 'select public.purge_expired_retention()');
  else
    raise notice 'pg_cron is not enabled: expired retention records will not be purged until it is.';
  end if;
end $$;

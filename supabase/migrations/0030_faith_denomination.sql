-- Toastly — religion and denomination (PRD §5.2.3; decided 6 October 2026).
--
-- Toastly is non-religious: faith is something members may show, never
-- something the product sorts people by.
--
--   * Religion (optional): Christian, Muslim, Traditional, Spiritual but not
--     religious, Not religious, Other (up to 30 characters), Prefer not to say.
--   * Denomination (optional, new): only when religion is Christian or Muslim.
--   * One visibility setting covers both — religion_visibility: 'public' is
--     "shown", anything else is hidden, and hiding religion hides
--     denomination. Never on the feed card; full profile only.
--   * Consent: the first time a member adds either, an explicit consent is
--     recorded (consent kind 'faith_display', with its wording version).
--   * Never an input to anything: not the six-a-day selection, not ranking,
--     not the Trust Sentinel, not any model, not PostHog, not the AriyaPlanner
--     handoff. There is no denomination filter, now or planned — a constraint
--     check fails the build if any query filters on it.
--
-- The columns live on profiles, so their row-level security is identical to
-- religion's (as decided). NOTE, reported rather than changed here: that RLS
-- lets any live member read another live member's religion whatever its
-- visibility — visibility is applied by the server code that renders it
-- (lib/faith.ts). Relationship history (0013) shows the stricter pattern.
--
-- Stored religion values are NOT changed. Before this, religion was free text
-- with no option list; the list is checked only when a member changes it.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

do $$ begin
  create type denomination as enum (
    -- Christian
    'catholic', 'anglican', 'methodist', 'baptist', 'presbyterian', 'pentecostal',
    'orthodox', 'white_garment', 'non_denominational',
    -- Muslim
    'sunni', 'shia', 'ahmadiyya',
    -- either
    'other'
  );
exception when duplicate_object then null; end $$;

alter table public.profiles
  add column if not exists religion_other text
    check (religion_other is null or char_length(religion_other) between 1 and 30),
  add column if not exists denomination denomination,
  add column if not exists denomination_other text
    check (denomination_other is null or char_length(denomination_other) between 1 and 30);

comment on column public.profiles.denomination is
  'Optional, display-only (PRD §5.2.3). Only with religion Christian or Muslim; hidden whenever religion is. '
  'Never a filter, never ranked on, never sent to a model, PostHog, the Sentinel or AriyaPlanner.';

-- ---------------------------------------------------------------------------
-- 2. The rules, on every write
-- ---------------------------------------------------------------------------

do $$ begin
  alter type consent_kind add value if not exists 'faith_display';
exception when undefined_object then null; end $$;

-- A consent can be withdrawn, never deleted (decided 6 October 2026): the
-- record stays as evidence of what was agreed and when, stamped with when it
-- was withdrawn. A withdrawn consent no longer counts — adding faith again
-- asks again. Members still can't update or delete consents themselves
-- (0029); remove_faith() below stamps it.
alter table public.consents add column if not exists withdrawn_at timestamptz;

create or replace function public.faith_rules()
returns trigger language plpgsql set search_path = public as $$
declare
  v_religion_changed boolean := tg_op = 'INSERT' or new.religion is distinct from old.religion;
  v_denomination_changed boolean := tg_op = 'INSERT' or new.denomination is distinct from old.denomination;
begin
  -- The option list, checked only when religion changes: values stored
  -- before 0030 (free text) stay exactly as they were.
  if v_religion_changed and new.religion is not null and new.religion not in (
       'Christian', 'Muslim', 'Traditional', 'Spiritual but not religious',
       'Not religious', 'Other', 'Prefer not to say') then
    raise exception 'Choose a religion from the list.' using errcode = '22023';
  end if;

  -- "Other" carries its own text (30 characters at most, shown as typed).
  if new.religion is distinct from 'Other' then
    new.religion_other := null;
  elsif new.religion_other is null then
    raise exception 'Tell us your religion, in 30 characters or fewer.' using errcode = '22023';
  end if;

  -- Changing religion clears denomination — unless the same save picks one
  -- for the new religion.
  if tg_op = 'UPDATE' and v_religion_changed and not v_denomination_changed then
    new.denomination := null;
    new.denomination_other := null;
  end if;

  -- Denomination only with Christian or Muslim, and only from that list.
  if new.denomination is not null and not (
       (new.religion = 'Christian' and new.denomination in (
          'catholic', 'anglican', 'methodist', 'baptist', 'presbyterian', 'pentecostal',
          'orthodox', 'white_garment', 'non_denominational', 'other'))
    or (new.religion = 'Muslim' and new.denomination in ('sunni', 'shia', 'ahmadiyya', 'other'))) then
    raise exception 'That denomination doesn''t go with the religion chosen.' using errcode = '22023';
  end if;
  if new.denomination is distinct from 'other' then
    new.denomination_other := null;
  elsif new.denomination_other is null then
    raise exception 'Tell us your denomination, in 30 characters or fewer.' using errcode = '22023';
  end if;

  -- Consent first: adding either field needs the member's explicit consent
  -- on record (the server records it, with its wording version, when they
  -- tick the line). Removing a value never needs it.
  if ((v_religion_changed and new.religion is not null)
      or (v_denomination_changed and new.denomination is not null))
     and not exists (select 1 from consents c
                      where c.profile_id = new.id and c.kind = 'faith_display' and c.withdrawn_at is null) then
    raise exception 'Agree to show your faith on your profile first.' using errcode = '42501';
  end if;

  return new;
end;
$$;
revoke all on function public.faith_rules() from public, anon, authenticated;
drop trigger if exists faith_rules on public.profiles;
create trigger faith_rules before insert or update of religion, religion_other, denomination, denomination_other
  on public.profiles for each row execute function public.faith_rules();

-- "Remove faith from my profile" (faith-editor.slim.html): deletes religion
-- and denomination, and WITHDRAWS the permission — the consent record is
-- kept, stamped withdrawn_at, as evidence of what was agreed and when
-- (decided 6 October 2026). Adding faith again asks again. For the caller's
-- own row only.
create or replace function public.remove_faith()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in.' using errcode = '42501'; end if;
  update profiles
     set religion = null, religion_other = null, denomination = null, denomination_other = null
   where id = auth.uid();
  update consents set withdrawn_at = now()
   where profile_id = auth.uid() and kind = 'faith_display' and withdrawn_at is null;
end;
$$;
revoke all on function public.remove_faith() from public, anon;
grant execute on function public.remove_faith() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Never an input
-- ---------------------------------------------------------------------------

-- One guard for both: no faith key in a trust event's metadata or the
-- AriyaPlanner brief's loose `aesthetic` field. (0009/0014's own metadata
-- guard already refuses 'religion' and health data; it is left untouched.)
create or replace function public.faith_meta_is_clean(p jsonb)
returns boolean
language sql
immutable
as $$
  select not exists (
    select 1
    from jsonb_object_keys(coalesce(p, '{}'::jsonb)) k
    where k = any (array['religion', 'religion_other', 'denomination', 'denomination_other', 'faith'])
  );
$$;

-- The Trust Sentinel: no trust event can carry faith, even by mistake.
alter table public.trust_events drop constraint if exists trust_meta_has_no_faith;
alter table public.trust_events add constraint trust_meta_has_no_faith check (public.faith_meta_is_clean(meta));

-- The AriyaPlanner brief: never faith.
alter table public.couple_briefs drop constraint if exists brief_has_no_faith;
alter table public.couple_briefs add constraint brief_has_no_faith check (public.faith_meta_is_clean(aesthetic));

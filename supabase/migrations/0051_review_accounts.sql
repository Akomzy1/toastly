-- 0051 — review accounts: a test account for Meta's dating-advertiser review,
-- and the fictional companions that fill its Today's six.
--
-- Decided by the owner (26 October 2026). A review account is a profile with
-- review_account = true. Only the server can set the flag; a member can never
-- set or clear it.
--
--   1. Isolation        can_meet() — the one pair rule behind the feed, opening a
--                        profile (answers, photos, photo files), replies, Gist
--                        invites and therefore dates — now also requires both
--                        sides to be review accounts or both to be members. A
--                        review account never appears in a member's six, and a
--                        member never appears in a review account's six. The
--                        message policy checks the pair too, as a second wall.
--   2. The gate          review_numbers: the review account's number passes the
--                        invite-only gate (beta_number_approved) without being
--                        an application. It takes none of the 200 places, never
--                        appears in the staff lists or counts, and never makes a
--                        founding member.
--   3. Going live        review_account_go_live() records phone, Verified Real and
--                        the main photo's match FOR REVIEW ACCOUNTS ONLY, with no
--                        Smile ID call: no selfie, no face, no template exists.
--                        It refuses any profile that isn't a review account.
--   4. Kept out          the women's launch offer, the "Tonight on Toastly" counts.
--   5. Retiring          review_accounts_retire(): pauses every review account for
--                        good (out of every six, no profile opens), ends their
--                        grants and removes their numbers from the gate, in one
--                        call. The script then bans their sign-ins. Not a
--                        restriction: restrictions are staff decisions about
--                        members (0025), and this is the owner retiring test data.
--   6. The log           review_account_log: append-only, every step above.
--
-- None of these functions is callable by a member or staff screen: service
-- role only, run from scripts/db/review-accounts.mjs. Last-active is never
-- read here; the script marks the companions seen (they never sign in).

-- ---------------------------------------------------------------------------
-- 0. The flag
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists review_account boolean not null default false;
alter table public.profiles add column if not exists review_retired_at timestamptz;
comment on column public.profiles.review_account is
  'A test account for platform review (0051). Set only by the server; never meets a member.';
comment on column public.profiles.review_retired_at is
  'When a review account was retired (0051). It stays paused from then on.';

create or replace function public.protect_review_account()
returns trigger language plpgsql as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.review_account := false;
    new.review_retired_at := null;
    return new;
  end if;
  if new.review_account is distinct from old.review_account
     or new.review_retired_at is distinct from old.review_retired_at
     or (old.review_retired_at is not null and new.paused is distinct from old.paused) then
    raise exception 'This is recorded by Toastly.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_review_account() from public, anon, authenticated;
drop trigger if exists profiles_protect_review_account on public.profiles;
create trigger profiles_protect_review_account before insert or update on public.profiles
  for each row execute function public.protect_review_account();

-- The log. No foreign key, so it outlives a deleted profile.
create table if not exists public.review_account_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  profile_id uuid,
  action text not null,
  detail jsonb not null default '{}'::jsonb
);
alter table public.review_account_log enable row level security;
revoke all on public.review_account_log from anon, authenticated;

create or replace function public.review_account_log_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'The review account log is append-only.' using errcode = '42501';
end;
$$;
revoke all on function public.review_account_log_append_only() from public, anon, authenticated;
drop trigger if exists review_account_log_append_only on public.review_account_log;
create trigger review_account_log_append_only before update or delete on public.review_account_log
  for each row execute function public.review_account_log_append_only();

-- ---------------------------------------------------------------------------
-- 1. Isolation
-- ---------------------------------------------------------------------------

-- 0036's rule (a man and a woman), plus: the same side of the review line.
create or replace function public.can_meet(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles a, profiles b
     where a.id = p_a and b.id = p_b
       and is_gender_option(a.gender) and is_gender_option(b.gender)
       and a.gender <> b.gender
       and a.review_account = b.review_account);  -- rule:review
$$;
revoke all on function public.can_meet(uuid, uuid) from public, anon, authenticated;

-- 0029's policy, plus the pair rule between the two people in the thread.
drop policy if exists "entitled members send" on public.messages;
create policy "entitled members send" on public.messages for insert
  with check (
    auth.uid() = sender_id and public.profile_is_live(auth.uid())
    and exists (select 1 from public.threads t
                 where t.id = messages.thread_id
                   and (t.member_a = auth.uid() or t.member_b = auth.uid())
                   and public.can_meet_with(case when t.member_a = auth.uid() then t.member_b else t.member_a end)));

-- ---------------------------------------------------------------------------
-- 2. The gate
-- ---------------------------------------------------------------------------

-- The keyed form of the number (lib/beta.ts betaPhoneKey), never the number.
create table if not exists public.review_numbers (
  phone_key text primary key check (char_length(phone_key) = 64),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.review_numbers enable row level security;
revoke all on public.review_numbers from anon, authenticated;

-- 0050's gate, plus a review account's own number until it is retired.
create or replace function public.beta_number_approved(p_phone_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from beta_applications a, beta_settings s
     where a.phone_key = p_phone_key
       and a.status = 'approved'
       and (a.location_type = 'lagos' or not s.lagos_only)
  ) or exists (
    select 1 from review_numbers r join profiles p on p.id = r.profile_id
     where r.phone_key = p_phone_key and p.review_account and p.review_retired_at is null
  );
$$;
revoke all on function public.beta_number_approved(text) from public, anon, authenticated;
grant execute on function public.beta_number_approved(text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Making a review account and taking it live
-- ---------------------------------------------------------------------------

-- Flag a freshly created profile. Refuses anything that has ever been live or
-- has a confirmed number: a member is never turned into a review account.
create or replace function public.review_account_mark(p_profile uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  p profiles;
begin
  select * into p from profiles where id = p_profile for update;
  if not found then raise exception 'No such profile.' using errcode = 'P0002'; end if;
  if p.review_account then return 'already'; end if;
  if p.first_live_at is not null or p.phone_verified_at is not null
     or exists (select 1 from phone_identities where profile_id = p_profile) then
    raise exception 'Only a new, unverified profile can become a review account.' using errcode = '42501';
  end if;
  update profiles set review_account = true where id = p_profile;
  insert into review_account_log (profile_id, action) values (p_profile, 'mark');
  return 'marked';
end;
$$;
revoke all on function public.review_account_mark(uuid) from public, anon, authenticated;
grant execute on function public.review_account_mark(uuid) to service_role;

-- Record what Smile ID and the phone code would have recorded, for a review
-- account only. p_phone_hash binds a number (the reviewer); null leaves the
-- profile without one (a companion: nobody signs in as it). The photos must
-- already be uploaded (scripts/db/review-accounts.mjs). The lowest-placed
-- photo becomes the main photo, marked matched. Where that result came from
-- is said by review_account and the log (face_match_reason is for mismatches).
create or replace function public.review_account_go_live(p_profile uuid, p_phone_hash text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  p profiles;
  v_bound text;
  v_main uuid;
begin
  select * into p from profiles where id = p_profile for update;
  if not found or not p.review_account then
    raise exception 'Not a review account.' using errcode = '42501';
  end if;
  if p.review_retired_at is not null then
    raise exception 'This review account is retired.' using errcode = '42501';
  end if;
  if p_phone_hash is not null then
    v_bound := record_phone_verified(p_profile, p_phone_hash);
    if v_bound <> 'ok' then return v_bound; end if;
  end if;
  if (select count(*) from profile_photos where profile_id = p_profile) < min_live_photos() then
    raise exception 'Upload at least % photos first.', min_live_photos() using errcode = '22023';
  end if;

  update profiles
     set phone_verified_at = coalesce(phone_verified_at, now()),
         liveness_verified_at = coalesce(liveness_verified_at, now()),
         stage = case when stage in ('verified_real', 'id_confirmed') then stage else 'verified_real' end
   where id = p_profile;

  if p.main_photo_id is null then
    select id into v_main from profile_photos where profile_id = p_profile order by position, created_at limit 1;
    update profiles set pending_main_photo_id = v_main where id = p_profile;
    perform record_main_photo_match(v_main, 'matched');
  end if;

  insert into review_account_log (profile_id, action, detail)
  values (p_profile, 'go_live', jsonb_build_object('phone_bound', p_phone_hash is not null));
  return case when profile_is_live(p_profile) then 'live' else 'not_live' end;
end;
$$;
revoke all on function public.review_account_go_live(uuid, text) from public, anon, authenticated;
grant execute on function public.review_account_go_live(uuid, text) to service_role;

-- The reviewer's number at the gate (only needed if the phone step is shown).
create or replace function public.review_account_allow_number(p_profile uuid, p_phone_key text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = p_profile and review_account) then
    raise exception 'Not a review account.' using errcode = '42501';
  end if;
  insert into review_numbers (phone_key, profile_id) values (p_phone_key, p_profile)
  on conflict (phone_key) do update set profile_id = excluded.profile_id;
  insert into review_account_log (profile_id, action) values (p_profile, 'allow_number');
  return 'ok';
end;
$$;
revoke all on function public.review_account_allow_number(uuid, text) from public, anon, authenticated;
grant execute on function public.review_account_allow_number(uuid, text) to service_role;

-- A plan for the reviewer, so Meta can see messaging. A dated manual grant,
-- review accounts only.
create or replace function public.review_account_grant(p_profile uuid, p_tier tier, p_until timestamptz)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = p_profile and review_account) then
    raise exception 'Not a review account.' using errcode = '42501';
  end if;
  if p_until is null or p_until <= now() or p_until > now() + interval '120 days' then
    raise exception 'Give an end date within 120 days.' using errcode = '22023';
  end if;
  insert into entitlements (profile_id, tier, source, starts_at, ends_at)
  values (p_profile, p_tier, 'manual_grant', now(), p_until);
  insert into review_account_log (profile_id, action, detail)
  values (p_profile, 'grant', jsonb_build_object('tier', p_tier, 'until', p_until));
  return 'ok';
end;
$$;
revoke all on function public.review_account_grant(uuid, tier, timestamptz) from public, anon, authenticated;
grant execute on function public.review_account_grant(uuid, tier, timestamptz) to service_role;

-- The six cools down for 30 days. Before the reviewer looks again: forget who
-- review accounts have shown or passed EACH OTHER. Never touches a member's
-- row. (The six also shows only members seen in 14 days: the script marks the
-- companions seen, as the heartbeat would if they signed in.)
create or replace function public.review_accounts_refresh()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_shown integer;
  v_passes integer;
begin
  delete from feed_shown fs
   using profiles a, profiles b
   where a.id = fs.profile_id and b.id = fs.candidate_id and a.review_account and b.review_account;
  get diagnostics v_shown = row_count;
  delete from feed_passes fp
   using profiles a, profiles b
   where a.id = fp.profile_id and b.id = fp.candidate_id and a.review_account and b.review_account;
  get diagnostics v_passes = row_count;
  insert into review_account_log (action, detail)
  values ('refresh', jsonb_build_object('shown_forgotten', v_shown, 'passes_forgotten', v_passes));
  return jsonb_build_object('shown_forgotten', v_shown, 'passes_forgotten', v_passes);
end;
$$;
revoke all on function public.review_accounts_refresh() from public, anon, authenticated;
grant execute on function public.review_accounts_refresh() to service_role;

-- ---------------------------------------------------------------------------
-- 4. Kept out of offers and counts
-- ---------------------------------------------------------------------------

-- Never the women's launch offer for a review account: it gets a dated manual
-- grant instead, and must not use up an offer record for its number. Skipping
-- the record makes grant_launch_offer (0050) stop before the entitlement.
create or replace function public.launch_offer_skips_review_accounts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from profiles where id = new.profile_id and review_account) then
    return null;
  end if;
  return new;
end;
$$;
revoke all on function public.launch_offer_skips_review_accounts() from public, anon, authenticated;
drop trigger if exists launch_offer_skips_review_accounts on public.launch_offer_grants;
create trigger launch_offer_skips_review_accounts before insert on public.launch_offer_grants
  for each row execute function public.launch_offer_skips_review_accounts();
drop trigger if exists womens_offer_skips_review_accounts on public.entitlements;
create trigger womens_offer_skips_review_accounts before insert on public.entitlements
  for each row when (new.source = 'womens_launch_offer')
  execute function public.launch_offer_skips_review_accounts();

-- 0043's numbers, without review accounts.
create or replace function public.home_live_stats()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_verified bigint;
  v_min integer;
begin
  select count(*) into v_verified from profiles
   where stage in ('verified_real', 'id_confirmed') and not review_account;
  select value into v_min from site_config where name = 'tonight_min_verified_members';
  if v_verified < coalesce(v_min, 500) then
    return null;
  end if;
  return jsonb_build_object(
    'verified_members', v_verified,
    'gists_this_week', (select count(*) from gist_sessions g join profiles p on p.id = g.proposer_id
                         where g.started_at >= now() - interval '7 days' and not p.review_account),
    'couples', (select count(*) from couples c join profiles p on p.id = c.member_a
                 where c.status = 'active' and not p.review_account)
  );
end;
$$;
revoke all on function public.home_live_stats() from public, anon, authenticated;
grant execute on function public.home_live_stats() to service_role;

-- ---------------------------------------------------------------------------
-- 5. Retiring every review account in one call
-- ---------------------------------------------------------------------------

-- Paused for good: out of every six and no profile opens (0045, 0032), and the
-- account can't un-pause itself (protect_review_account). Grants end now; the
-- numbers leave the gate, so once the test code is gone no SMS can be asked
-- for that number either. Returns every review account's id so the script
-- bans the sign-ins too. A second run changes nothing.
create or replace function public.review_accounts_retire()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
  v_retired integer;
  v_numbers integer;
begin
  select coalesce(array_agg(id order by id), '{}') into v_ids from profiles where review_account;
  update profiles set paused = true, review_retired_at = now()
   where review_account and review_retired_at is null;
  get diagnostics v_retired = row_count;
  update entitlements set ends_at = now()
   where profile_id = any (v_ids) and source = 'manual_grant' and (ends_at is null or ends_at > now());
  delete from review_numbers where profile_id = any (v_ids);
  get diagnostics v_numbers = row_count;
  insert into review_account_log (action, detail)
  values ('retire', jsonb_build_object('accounts', cardinality(v_ids), 'retired', v_retired, 'numbers_removed', v_numbers));
  return jsonb_build_object('profile_ids', to_jsonb(v_ids), 'retired', v_retired, 'numbers_removed', v_numbers);
end;
$$;
revoke all on function public.review_accounts_retire() from public, anon, authenticated;
grant execute on function public.review_accounts_retire() to service_role;

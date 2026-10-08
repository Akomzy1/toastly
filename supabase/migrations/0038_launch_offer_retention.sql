-- Toastly — how long the women's launch offer remembers a phone number after
-- the account is deleted: 12 months (owner, 8 October 2026). Follows 0037.
--
-- launch_offer_grants (0035) keeps the phone number's one-way hash — never
-- the number — so the offer is given once per number. When the account is
-- deleted, profile_id goes to null and the hash stays; from now on it is
-- deleted 12 months after that, by the nightly purge. Until then, deleting
-- and signing up again with the same number doesn't bring the offer back.

set search_path = public;

alter table public.launch_offer_grants add column if not exists released_at timestamptz;

-- The account is gone (0035's foreign key sets profile_id to null): start
-- the clock.
create or replace function public.launch_offer_grant_released()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.profile_id is null and old.profile_id is not null then
    new.released_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.launch_offer_grant_released() from public, anon, authenticated;
drop trigger if exists launch_offer_grant_released on public.launch_offer_grants;
create trigger launch_offer_grant_released before update of profile_id on public.launch_offer_grants
  for each row execute function public.launch_offer_grant_released();

-- Any already released before this migration start their 12 months now.
update public.launch_offer_grants set released_at = now() where profile_id is null and released_at is null;

-- 365 days, in the retention config like the other periods (0018).
insert into public.retention_config (name, days) values ('launch_offer_phone', 365)
  on conflict (name) do nothing;

-- The nightly purge: 0025's definition, plus the released offer hashes.
create or replace function public.purge_expired_retention()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer;
  v_offer_days integer;
begin
  delete from retained_safety_records where retain_until < now();
  delete from blocked_phone_hashes where retain_until < now();
  delete from blocked_id_hashes where retain_until < now();
  delete from retained_payments where retain_until < now();
  update verification_sessions set id_hash = null
   where id_hash is not null
     and status in ('started', 'submitted')
     and created_at < now() - interval '1 day';

  select days into v_days from retention_config where name = 'support_transcripts';
  v_days := coalesce(v_days, 30);
  delete from support_conversations
   where last_active_at < now() - make_interval(days => v_days);
  update support_tickets set summary = null
   where summary is not null
     and created_at < now() - make_interval(days => v_days);
  delete from agent_requests where created_at < now() - interval '7 days';

  -- 0038: a deleted account's launch-offer phone hash, 12 months on.
  select days into v_offer_days from retention_config where name = 'launch_offer_phone';
  v_offer_days := coalesce(v_offer_days, 365);
  delete from launch_offer_grants
   where profile_id is null
     and released_at < now() - make_interval(days => v_offer_days);

  -- Removed accounts: the banned sign-in is deleted once retention ends.
  delete from auth.users where id in (select former_profile_id from account_removals where retain_until < now());
  delete from account_removals where retain_until < now();

  perform gist_expire_invites();
end;
$$;
revoke all on function public.purge_expired_retention() from public, anon, authenticated;

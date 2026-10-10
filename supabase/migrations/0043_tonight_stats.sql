-- Toastly — "Tonight on Toastly" shows real numbers, and only from 500
-- verified members (owner, 10 October 2026).
--
-- The Home hero card listed fixed prototype figures. It now reads three live
-- counts, and stays hidden until the platform has the threshold number of
-- Verified Real members — then it appears by itself, no deploy.
--
-- Below the threshold the function returns NULL, not the counts, so a small
-- early number is never published. The threshold lives in site_config.

create table if not exists public.site_config (
  name text primary key,
  value integer not null check (value >= 0)
);
insert into public.site_config (name, value) values ('tonight_min_verified_members', 500)
on conflict (name) do nothing;
alter table public.site_config enable row level security;
revoke all on public.site_config from anon, authenticated;

-- Verified members: Verified Real (liveness passed), with or without the ID
-- ring. Gist sessions this week: calls that connected (started_at is set when
-- both have joined, 0019) in the last 7 days. Couples: Couple Mode active.
create or replace function public.home_live_stats()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_verified bigint;
  v_min integer;
begin
  select count(*) into v_verified from profiles where stage in ('verified_real', 'id_confirmed');
  select value into v_min from site_config where name = 'tonight_min_verified_members';
  if v_verified < coalesce(v_min, 500) then
    return null;
  end if;
  return jsonb_build_object(
    'verified_members', v_verified,
    'gists_this_week', (select count(*) from gist_sessions where started_at >= now() - interval '7 days'),
    'couples', (select count(*) from couples where status = 'active')
  );
end;
$$;
revoke all on function public.home_live_stats() from public, anon, authenticated;
grant execute on function public.home_live_stats() to service_role;

-- Toastly — our own rate limit on verification-code SMS. Follows 0048.
--
-- The Supabase "Send SMS" hook (app/api/auth/send-sms) asks sms_code_allow()
-- before it spends an SMS: at most `per_hour` codes per number per hour and
-- never two within `min_gap_seconds`. The number is never stored — only a keyed
-- one-way hash the server computes — and rows older than a day are deleted.
-- Service role only. This sits on top of Supabase's own SMS rate limits.

create table if not exists public.sms_limits (
  id boolean primary key default true check (id),
  per_hour smallint not null default 5 check (per_hour between 1 and 100),
  min_gap_seconds smallint not null default 30 check (min_gap_seconds between 0 and 3600)
);
insert into public.sms_limits (id) values (true) on conflict (id) do nothing;
alter table public.sms_limits enable row level security;
revoke all on public.sms_limits from anon, authenticated;

create table if not exists public.sms_code_sends (
  phone_key text not null,
  sent_at timestamptz not null default now()
);
create index if not exists sms_code_sends_key_idx on public.sms_code_sends (phone_key, sent_at desc);
alter table public.sms_code_sends enable row level security;
revoke all on public.sms_code_sends from anon, authenticated;

create or replace function public.sms_code_allow(p_phone_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hour smallint;
  v_gap smallint;
begin
  if p_phone_key is null or length(p_phone_key) < 32 then
    raise exception 'A phone key is required.' using errcode = '22023';
  end if;
  select per_hour, min_gap_seconds into v_hour, v_gap from sms_limits;
  -- Two requests for the same number at once must not both pass.
  perform pg_advisory_xact_lock(hashtext(p_phone_key));

  delete from sms_code_sends where sent_at < now() - interval '1 day';

  if v_gap > 0 and exists (
    select 1 from sms_code_sends where phone_key = p_phone_key and sent_at > now() - make_interval(secs => v_gap)
  ) then
    return false;
  end if;
  if (select count(*) from sms_code_sends where phone_key = p_phone_key and sent_at > now() - interval '1 hour') >= v_hour then
    return false;
  end if;
  insert into sms_code_sends (phone_key) values (p_phone_key);
  return true;
end;
$$;
revoke all on function public.sms_code_allow(text) from public, anon, authenticated;
grant execute on function public.sms_code_allow(text) to service_role;

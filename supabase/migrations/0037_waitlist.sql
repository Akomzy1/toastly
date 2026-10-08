-- Toastly — the waitlist (decided 8 October 2026). Follows 0036.
--
-- While sign-up is closed (the launch switch, lib/launch.ts), the public can
-- join a waitlist: email, city, woman or man (from gender_options, 0036).
-- Nobody outside the server can read it. Joining again updates the entry
-- and returns the same answer, so it can't reveal whether an email is on it.
-- The privacy policy says what it's for and how long it's kept.

create table if not exists public.waitlist (
  email text primary key
    check (email = lower(email) and char_length(email) between 3 and 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  city text not null check (char_length(city) between 2 and 80),
  gender text not null,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.waitlist enable row level security;
revoke all on public.waitlist from anon, authenticated;

create or replace function public.join_waitlist(p_email text, p_city text, p_gender text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_gender_option(p_gender) then
    raise exception 'Choose a gender from the list.' using errcode = '22023';
  end if;
  insert into waitlist (email, city, gender)
  values (lower(btrim(p_email)), btrim(p_city), p_gender)
  on conflict (email) do update set city = excluded.city, gender = excluded.gender, updated_at = now();
end;
$$;
revoke all on function public.join_waitlist(text, text, text) from public;
grant execute on function public.join_waitlist(text, text, text) to anon, authenticated;

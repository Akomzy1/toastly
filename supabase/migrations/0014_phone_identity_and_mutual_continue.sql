-- Toastly — two bugs fixed with the minimum disclosure (decided 2026-10-05).
--
-- Both were found while wiring the live-profile guard (0013). Each is fixed
-- with a security-definer function that answers one yes/no question and
-- returns nothing else.

-- ---------------------------------------------------------------------------
-- 1. "Is this phone already in use?"
-- ---------------------------------------------------------------------------
--
-- 0001 promises one phone number, one account, permanently — that is what
-- makes a block stick. It never worked: phone_identities has no client
-- policies (correctly — the hashes must not be readable), so the duplicate
-- check in the verify action always read zero rows, and its insert was
-- silently refused. Nothing was ever bound.

-- The question, and only the question. True when this hash belongs to a
-- DIFFERENT account. Never says which account, never returns the hash.
create or replace function public.phone_in_use(p_phone_hash text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from phone_identities
    where phone_hash = p_phone_hash
      and profile_id is distinct from auth.uid()
  );
$$;

revoke all on function public.phone_in_use(text) from public, anon;
grant execute on function public.phone_in_use(text) to authenticated;

-- Binding the number and recording the stage. SERVICE ROLE ONLY.
--
-- Why not member-callable: the hash is peppered on the server. A member who
-- could submit their own hash could register any junk value and leave their
-- real number free for a second account. So the server computes the hash
-- from the number Supabase Auth has just confirmed, and calls this.
--
-- One number per account, permanently: an account already bound to a
-- different number is refused rather than rebound, because rebinding would
-- free the old number for a new account — the block-evasion this table
-- exists to stop. Changing number is a support action.
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

  -- Never a downgrade: re-confirming a phone does not undo Verified Real.
  update profiles
     set stage = case when stage = 'unverified' then 'phone_verified' else stage end,
         phone_verified_at = coalesce(phone_verified_at, now())
   where id = p_profile_id;
end;
$$;

revoke all on function public.record_phone_verified(uuid, text) from public, anon, authenticated;
grant execute on function public.record_phone_verified(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. "Did both say continue?"
-- ---------------------------------------------------------------------------
--
-- 0003 defined gist_mutual_continue() as an ordinary (invoker) function over
-- gist_outcomes, whose policy rightly lets a member read only their own
-- answer. Called by a member it could therefore only ever count one row, so
-- it was always false: date spots never appeared and the "after_gist" photo
-- reveal never opened.
--
-- Now security definer, still returning one boolean. It is true only when
-- both said yes, and false in every other case — "not answered yet" and "said
-- no" are deliberately the same answer, so it never discloses the other
-- person's choice. A member who is not in the session, or whose own profile
-- isn't live (0013), always gets false.
create or replace function public.gist_mutual_continue(p_session_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  -- A member's request: only about their own session, only while live.
  -- (auth.uid() is null for the service role and for internal callers.)
  if v_me is not null then
    if not exists (
      select 1 from gist_sessions g
      where g.id = p_session_id
        and (g.proposer_id = v_me or g.invitee_id = v_me)
    ) or not profile_is_live(v_me) then
      return false;
    end if;
  end if;

  return coalesce((
    select count(*) = 2 and bool_and(wants_to_continue)
    from gist_outcomes
    where session_id = p_session_id
  ), false);
end;
$$;

revoke all on function public.gist_mutual_continue(uuid) from public, anon;
grant execute on function public.gist_mutual_continue(uuid) to authenticated, service_role;

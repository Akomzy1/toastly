-- Toastly — fix infinite recursion in the profiles read policy.
--
-- "verified members see other verified profiles" (0001) checked the viewer's
-- own stage with a subquery on public.profiles — inside a policy ON
-- public.profiles. Postgres refuses that with 42P17 "infinite recursion
-- detected in policy for relation profiles", and it fails EVERY read of the
-- table by a member or visitor, not just reads of other people. Nobody saw it
-- until production was connected to the database (2 October 2026): the verify
-- page could not read a member's own stage and fell back to "unverified".
--
-- Same rule, same meaning: a verified viewer sees other verified, unpaused
-- profiles. Only the viewer check moves into a security-definer function,
-- which reads the viewer's own row without re-entering the policy.

create or replace function public.viewer_is_verified()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles me
    where me.id = auth.uid()
      and me.stage in ('verified_real', 'id_confirmed')
  );
$$;

-- Policies run as the querying role, so it needs EXECUTE. The function only
-- ever answers about the caller's own account.
revoke all on function public.viewer_is_verified() from public;
grant execute on function public.viewer_is_verified() to anon, authenticated, service_role;

drop policy if exists "verified members see other verified profiles" on public.profiles;

create policy "verified members see other verified profiles"
  on public.profiles for select
  using (
    paused = false
    and stage in ('verified_real', 'id_confirmed')
    and public.viewer_is_verified()
  );

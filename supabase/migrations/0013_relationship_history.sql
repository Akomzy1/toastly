-- Toastly — relationship history: enforce the visibility members were promised.
--
-- 0001 put `history`, `has_children` and `history_visibility` on `profiles`,
-- defaulting to 'on_match' — "Revealed when we match" in the profile form.
-- Nothing enforced it. `profiles` is readable by every verified member (the
-- "verified members see other verified profiles" policy), so anyone could
-- read anyone's relationship history straight from the API, whatever they had
-- chosen. The app simply never asked for it: a promise kept by omission.
--
-- This moves the three columns into their own table behind RLS, so the
-- member's choice is enforced where the data lives.
--
-- It also defines "match" ONCE, for everything that reveals on match. The
-- genotype migration (0014) uses the same function. It deliberately has no
-- dependency on Supabase Vault, so this fix can ship while 0014 waits.

-- ---------------------------------------------------------------------------
-- What a match is
-- ---------------------------------------------------------------------------
--
-- Mutual engagement: each has replied to the other, or a Gist between them
-- was accepted, or they are an active couple. Being in someone's daily six is
-- NOT a match. A blocked pair is never matched, whichever way the block goes.

create or replace function public.are_matched(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_a is not null and p_b is not null and p_a <> p_b
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = p_a and b.blocked_id = p_b)
         or (b.blocker_id = p_b and b.blocked_id = p_a)
    )
    and (
      (
        exists (select 1 from replies r where r.sender_id = p_a and r.recipient_id = p_b)
        and exists (select 1 from replies r where r.sender_id = p_b and r.recipient_id = p_a)
      )
      or exists (
        select 1 from gist_sessions s
        where s.status in ('accepted', 'live', 'completed')
          and ((s.proposer_id = p_a and s.invitee_id = p_b)
            or (s.proposer_id = p_b and s.invitee_id = p_a))
      )
      or exists (
        select 1 from couples c
        where c.status = 'active'
          and ((c.member_a = p_a and c.member_b = p_b)
            or (c.member_a = p_b and c.member_b = p_a))
      )
    );
$$;

-- Two arbitrary ids would let a client ask whether any two OTHER members are
-- matched. Internal only.
revoke all on function public.are_matched(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The history table
-- ---------------------------------------------------------------------------

create table public.profile_history (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  history relationship_history,
  has_children boolean,
  -- Governs history AND has_children, as the profile form always grouped
  -- them. Still defaults to 'on_match', never 'public'.
  visibility field_visibility not null default 'on_match',
  updated_at timestamptz not null default now()
);

comment on table public.profile_history is
  'Relationship history and has_children, visible per the owner''s choice. Moved off profiles in 0013 because profiles rows are readable by every verified member.';

-- Carry existing answers across before the columns go.
insert into public.profile_history (profile_id, history, has_children, visibility)
select id, history, has_children, history_visibility
from public.profiles
where history is not null or has_children is not null;

alter table public.profiles
  drop column history,
  drop column has_children,
  drop column history_visibility;

-- ---------------------------------------------------------------------------
-- Who may read a row
-- ---------------------------------------------------------------------------
--
-- Takes the owner and the row's visibility, and asks only about the CALLER
-- (auth.uid()) — never about a pair of other people.
--
--   private  -> the owner only
--   on_match -> the owner, and members they are matched with
--   public   -> any verified member who is not blocked either way

create or replace function public.history_visible_to_me(
  p_owner uuid,
  p_visibility field_visibility
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null or p_owner is null then false
    when auth.uid() = p_owner then true
    when p_visibility = 'on_match' then are_matched(auth.uid(), p_owner)
    when p_visibility = 'public' then
      exists (
        select 1 from profiles v
        where v.id = auth.uid() and v.stage in ('verified_real', 'id_confirmed')
      )
      and not exists (
        select 1 from blocks b
        where (b.blocker_id = p_owner and b.blocked_id = auth.uid())
           or (b.blocker_id = auth.uid() and b.blocked_id = p_owner)
      )
    else false
  end;
$$;

-- RLS evaluates this as the querying member, so it must be executable.
revoke all on function public.history_visible_to_me(uuid, field_visibility) from public, anon;
grant execute on function public.history_visible_to_me(uuid, field_visibility) to authenticated;

alter table public.profile_history enable row level security;

create policy "own history writable" on public.profile_history
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create policy "history visible per its owner's choice" on public.profile_history
  for select using (history_visible_to_me(profile_id, visibility));

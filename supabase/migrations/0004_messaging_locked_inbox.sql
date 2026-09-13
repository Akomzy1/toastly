-- Toastly — messaging and the locked Starter inbox.
--
-- CLAUDE.md calls this out as "easy to implement wrong", so the design here
-- is deliberately blunt: a Starter member's client CANNOT receive a message
-- body or a sender identity, because no policy and no function will ever
-- return one to them. It is not hidden in the UI; it is not sent.
--
--   Starter:  cannot send free text. CAN receive. Sees a bare count only —
--             no sender name, no avatar, no initials, no preview, not even
--             blurred.
--   Paid:     unlimited send and receive.
--
-- And a hard privacy boundary, from CLAUDE.md: message content is NEVER
-- scanned, parsed or flagged for phone numbers or contact information. There
-- is no trigger, no check constraint and no moderation hook on `body` in this
-- file, and none may be added for that purpose.

create table public.threads (
  id uuid primary key default gen_random_uuid(),
  member_a uuid not null references public.profiles (id) on delete cascade,
  member_b uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (member_a < member_b),          -- canonical ordering, one row per pair
  unique (member_a, member_b)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index messages_thread_idx on public.messages (thread_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Sending
-- ---------------------------------------------------------------------------

-- Starter cannot send free text. Enforced on write so a modified client
-- cannot post one.
create or replace function public.enforce_send_entitlement()
returns trigger
language plpgsql
as $$
begin
  if current_tier(new.sender_id) = 'starter' then
    raise exception 'Starter cannot send text messages';
  end if;
  return new;
end;
$$;

create trigger messages_send_entitlement
  before insert on public.messages
  for each row execute function public.enforce_send_entitlement();

-- ---------------------------------------------------------------------------
-- Reading — the locked inbox
-- ---------------------------------------------------------------------------

create or replace function public.can_read_inbox(p_profile_id uuid)
returns boolean
language sql
stable
as $$ select current_tier(p_profile_id) <> 'starter' $$;

-- THE critical policy.
--
-- A member may select a message row only if they are a participant AND their
-- tier can read the inbox. A Starter recipient matches the participant test
-- and fails the entitlement test, so the row is simply not returned — no
-- body, no sender_id, no timestamp, nothing to reconstruct an identity from.
--
-- Note what is NOT done here: there is no "return the row but blank the body"
-- branch. Redaction in a policy is how sender identity leaks.
alter table public.threads enable row level security;
alter table public.messages enable row level security;

create policy "participants see their threads" on public.threads for select
  using (auth.uid() = member_a or auth.uid() = member_b);

create policy "readable only by entitled participants" on public.messages for select
  using (
    can_read_inbox(auth.uid())
    and exists (
      select 1 from public.threads t
      where t.id = messages.thread_id
        and (t.member_a = auth.uid() or t.member_b = auth.uid())
    )
  );

create policy "entitled members send" on public.messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.threads t
      where t.id = messages.thread_id
        and (t.member_a = auth.uid() or t.member_b = auth.uid())
    )
  );

-- The ONLY thing a Starter member may learn: how many are waiting.
--
-- Returns a single integer. It takes no arguments that could be used to probe
-- an individual thread, and it deliberately does not expose which threads the
-- count came from — a per-thread count would let a client infer who messaged
-- by cross-referencing their own matches.
create or replace function public.unread_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.messages m
  join public.threads t on t.id = m.thread_id
  where m.read_at is null
    and m.sender_id <> auth.uid()
    and (t.member_a = auth.uid() or t.member_b = auth.uid());
$$;

revoke all on function public.unread_count() from public;
grant execute on function public.unread_count() to authenticated;

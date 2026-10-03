-- Toastly — the two launch AI agents (PRD §5.9; build prompts 15 and 16).
--
--   Toastly Help (Verification & Support Concierge): conversation state lives
--   here, not with the model vendor. Calls are stateless; each request reads
--   the recent turns back from these tables.
--   Answer Mirror: stores nothing. The draft answer goes to the model and the
--   feedback label comes back; neither is kept. Only its request counter is.
--
-- HARD RULES, enforced by shape:
--   * Support transcripts are kept for a short, disclosed period (30 days by
--     default, set in retention_config) and then deleted by the nightly purge.
--   * Members read their own support rows; every write is the server's, so a
--     member cannot forge an assistant turn or a ticket in their own history.
--   * No agent table holds a protected attribute, a genotype, a message body
--     from member-to-member chat, Gist data, a selfie or an ID number.

-- ---------------------------------------------------------------------------
-- Retention, configurable without a migration
-- ---------------------------------------------------------------------------

create table if not exists public.retention_config (
  name text primary key,
  days integer not null check (days between 1 and 3650)
);

insert into public.retention_config (name, days)
values ('support_transcripts', 30)
on conflict (name) do nothing;

alter table public.retention_config enable row level security;
revoke all on public.retention_config from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Toastly Help conversations
-- ---------------------------------------------------------------------------

create table public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

create index support_conversations_profile_idx
  on public.support_conversations (profile_id, last_active_at desc);

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('member', 'assistant')),
  -- Member text is stored as typed, for the conversation view; what reaches
  -- the model is redacted first (lib/ai/redact.ts).
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index support_messages_conversation_idx
  on public.support_messages (conversation_id, created_at);
create index support_messages_profile_idx
  on public.support_messages (profile_id, created_at desc);

-- Hand-offs to a person. Created only when the member taps "Pass this to our
-- team" — the assistant can propose one, never file one by itself.
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (reference ~ '^TH-[0-9]{5,8}$'),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid references public.support_conversations (id) on delete set null,
  category text not null
    check (category in ('refund', 'dispute', 'appeal', 'payment', 'verification', 'safety', 'other')),
  -- The member's own words, cleared with the transcript at the end of the
  -- retention period. The reference, category and status stay for staff.
  summary text check (char_length(summary) <= 2000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now()
);

create index support_tickets_profile_idx on public.support_tickets (profile_id, created_at desc);

alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_tickets enable row level security;

create policy "own support conversations readable" on public.support_conversations
  for select using (auth.uid() = profile_id);
create policy "own support messages readable" on public.support_messages
  for select using (auth.uid() = profile_id);
create policy "own support tickets readable" on public.support_tickets
  for select using (auth.uid() = profile_id);

-- ---------------------------------------------------------------------------
-- Agent request counter — metadata only, for rate limits
-- ---------------------------------------------------------------------------

create table public.agent_requests (
  id bigint primary key generated always as identity,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  agent text not null check (agent in ('help', 'answer_mirror')),
  created_at timestamptz not null default now()
);

create index agent_requests_profile_idx on public.agent_requests (profile_id, agent, created_at desc);

alter table public.agent_requests enable row level security;
revoke all on public.agent_requests from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The nightly purge gains the support transcripts
-- ---------------------------------------------------------------------------
--
-- Re-creates 0016's function with two additions; everything else unchanged.

create or replace function public.purge_expired_retention()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer;
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
  -- Conversations go whole once quiet for the period (messages cascade).
  delete from support_conversations
   where last_active_at < now() - make_interval(days => v_days);
  -- Tickets keep their reference, category and status; the member's words go.
  update support_tickets set summary = null
   where summary is not null
     and created_at < now() - make_interval(days => v_days);
  -- Rate-limit counters are only ever read for the last day.
  delete from agent_requests where created_at < now() - interval '7 days';
end;
$$;

revoke all on function public.purge_expired_retention() from public, anon, authenticated;

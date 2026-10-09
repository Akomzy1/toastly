-- Toastly — Toastly Help hands over to a person (owner, 9 October 2026).
--
--   * A ticket is filed by the server, not only by a member's tap: when the
--     member asks for a person, on a rule topic (refunds, disputes, charged
--     with no plan, appeals, restrictions, repeated verification failure,
--     data access or deletion), and at once, URGENT, on a safety topic.
--     The decision is made in app code (lib/help-escalation.ts); this file
--     holds the tickets, the staff side and the clocks.
--   * Staff work tickets in the review console's Support tab and reply from
--     it; the reply reaches the member in the app and by email.
--   * Alerts carry the ticket number, its urgency and a console link only.
--   * Retention follows privacy policy section 8: a Help transcript, and the
--     team's replies, go 30 days after the last message (retention_config
--     'support_transcripts'). Tickets go with the account, except urgent
--     (safety) ones, whose reference, category and outcome are kept as a
--     safety record for 2 years. Never the words.
--
-- Members still only READ their own support rows; every write is the
-- server's or a staff function's.

-- ---------------------------------------------------------------------------
-- 1. Config: the reply times promised to the member, and when to offer a person
-- ---------------------------------------------------------------------------

create table if not exists public.support_config (
  name text primary key,
  value integer not null check (value > 0)
);
insert into public.support_config (name, value) values
  ('sla_urgent_minutes', 60),
  ('sla_normal_minutes', 1440),
  ('offer_person_after_turns', 4)
on conflict (name) do nothing;
alter table public.support_config enable row level security;
revoke all on public.support_config from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Tickets gain urgency, the trigger, a snapshot and the clocks
-- ---------------------------------------------------------------------------

alter table public.support_tickets drop constraint if exists support_tickets_category_check;
alter table public.support_tickets add constraint support_tickets_category_check check (category in (
  -- safety: always urgent
  'threat', 'harassed', 'unsafe', 'money_request', 'scam', 'under_18', 'self_harm',
  -- rule topics: a person decides
  'refund', 'dispute', 'charged_no_plan', 'appeal', 'restriction', 'verification_repeat', 'data_request',
  -- everyday questions, when the member asks for a person
  'verification', 'payment', 'coins', 'plan', 'how_it_works', 'other',
  -- before 0042
  'safety'
));

alter table public.support_tickets drop constraint if exists support_tickets_status_check;
alter table public.support_tickets add constraint support_tickets_status_check
  check (status in ('open', 'replied', 'resolved'));

alter table public.support_tickets
  add column if not exists urgency text not null default 'normal' check (urgency in ('normal', 'urgent')),
  add column if not exists trigger text check (trigger in ('member_asked', 'rule_topic', 'safety', 'not_resolved')),
  -- What staff need to answer without opening the member's profile.
  add column if not exists plan_at_open text,
  add column if not exists verification_at_open text,
  -- Toastly Help turns only: [{role, content, at}]. Never member-to-member
  -- messages, Gist data, photos, selfies or ID numbers (Help has none).
  add column if not exists transcript jsonb,
  add column if not exists last_message_at timestamptz not null default now(),
  add column if not exists sla_due_at timestamptz,
  add column if not exists alerted_at timestamptz,
  add column if not exists first_opened_at timestamptz,
  add column if not exists first_opened_by uuid,
  add column if not exists realerted_at timestamptz,
  add column if not exists replied_at timestamptz,
  add column if not exists resolved_at timestamptz;

update public.support_tickets set urgency = 'urgent', trigger = 'safety' where category = 'safety';

-- A member reads their own tickets (RLS, 0018) — but not which staff member
-- opened one, or the alert clocks.
revoke all on public.support_tickets from anon, authenticated;
grant select (id, reference, profile_id, conversation_id, category, urgency, status, summary, transcript,
              created_at, sla_due_at, replied_at, resolved_at)
  on public.support_tickets to authenticated;

create index if not exists support_tickets_queue_idx on public.support_tickets (status, urgency, created_at);
create index if not exists support_tickets_conversation_idx on public.support_tickets (conversation_id) where conversation_id is not null;

-- ---------------------------------------------------------------------------
-- 3. The team's replies
-- ---------------------------------------------------------------------------

create table if not exists public.support_ticket_replies (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  staff_id uuid not null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists support_ticket_replies_ticket_idx on public.support_ticket_replies (ticket_id, created_at);
create index if not exists support_ticket_replies_profile_idx on public.support_ticket_replies (profile_id, created_at desc);
alter table public.support_ticket_replies enable row level security;
revoke all on public.support_ticket_replies from anon, authenticated;
drop policy if exists "own support replies readable" on public.support_ticket_replies;
create policy "own support replies readable" on public.support_ticket_replies
  for select using (auth.uid() = profile_id);
-- The member reads the words and the time, never which staff member wrote it.
grant select (id, ticket_id, profile_id, body, created_at, read_at) on public.support_ticket_replies to authenticated;

-- Read in Toastly Help: the replies are marked read and the notice goes.
create or replace function public.mark_support_replies_read(p_ticket uuid)
returns void language sql security definer set search_path = public as $$
  update support_ticket_replies set read_at = now()
   where ticket_id = p_ticket and profile_id = auth.uid() and read_at is null;
  update member_notices set dismissed_at = now()
   where profile_id = auth.uid() and kind = 'support_reply' and dismissed_at is null
     and reason_category = (select reference from support_tickets where id = p_ticket and profile_id = auth.uid());
$$;
revoke all on function public.mark_support_replies_read(uuid) from public, anon;
grant execute on function public.mark_support_replies_read(uuid) to authenticated;

-- An in-app notice per reply, pointing to Toastly Help. Carries the ticket
-- reference only (reason_category), never the reply.
alter table public.member_notices drop constraint if exists member_notices_kind_check;
alter table public.member_notices add constraint member_notices_kind_check
  check (kind in ('switch_plan', 'offer_ending', 'support_reply'));

-- ---------------------------------------------------------------------------
-- 4. Filing: one function, called by the server with the service role
-- ---------------------------------------------------------------------------

create or replace function public._support_transcript(p_conversation uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('role', m.role, 'content', m.content, 'at', m.created_at) order by m.created_at), '[]'::jsonb)
    from (select role, content, created_at from support_messages
           where conversation_id = p_conversation
           order by created_at desc limit 60) m;
$$;
revoke all on function public._support_transcript(uuid) from public, anon, authenticated;

create or replace function public._support_sla_minutes(p_urgency text)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(
    (select value from support_config where name = case when p_urgency = 'urgent' then 'sla_urgent_minutes' else 'sla_normal_minutes' end),
    case when p_urgency = 'urgent' then 60 else 1440 end);
$$;
revoke all on function public._support_sla_minutes(text) from public, anon, authenticated;

-- Files a ticket for the conversation, or — if one is already open for it —
-- refreshes its transcript and raises it to urgent when asked to (never
-- lowers it). Returns the ticket, whether it is new, whether it was raised
-- (both mean "alert the team"), and the SLA in minutes for the member.
create or replace function public.file_support_ticket(
  p_profile uuid,
  p_conversation uuid,
  p_category text,
  p_urgency text,
  p_trigger text
)
returns table (id uuid, reference text, urgency text, sla_minutes integer, created boolean, raised boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  t support_tickets;
  v_ref text;
  v_transcript jsonb;
begin
  if p_urgency not in ('normal', 'urgent') then
    raise exception 'urgency must be normal or urgent';
  end if;
  if p_conversation is not null and not exists (
    select 1 from support_conversations c where c.id = p_conversation and c.profile_id = p_profile
  ) then
    raise exception 'Not your conversation.' using errcode = '42501';
  end if;

  -- One filing at a time per member, so two quick messages can't make two tickets.
  perform pg_advisory_xact_lock(hashtext('support_ticket:' || p_profile::text));

  v_transcript := case when p_conversation is null then null else _support_transcript(p_conversation) end;

  select * into t from support_tickets s
   where s.profile_id = p_profile
     and s.status <> 'resolved'
     and s.conversation_id is not distinct from p_conversation
     and p_conversation is not null
   order by s.created_at desc limit 1
   for update;

  if found then
    if t.urgency = 'normal' and p_urgency = 'urgent' then
      update support_tickets s set
        urgency = 'urgent', category = p_category, trigger = p_trigger,
        transcript = v_transcript, last_message_at = now(),
        sla_due_at = now() + make_interval(mins => _support_sla_minutes('urgent')),
        alerted_at = null, realerted_at = null, status = 'open'
       where s.id = t.id;
      return query select t.id, t.reference, 'urgent'::text, _support_sla_minutes('urgent'), false, true;
    else
      update support_tickets s set transcript = v_transcript, last_message_at = now() where s.id = t.id;
      return query select t.id, t.reference, t.urgency, _support_sla_minutes(t.urgency), false, false;
    end if;
    return;
  end if;

  for attempt in 1..8 loop
    v_ref := 'TH-' || (10000 + floor(random() * 90000))::int::text;
    begin
      insert into support_tickets (
        reference, profile_id, conversation_id, category, urgency, trigger,
        plan_at_open, verification_at_open, transcript, last_message_at, sla_due_at
      ) values (
        v_ref, p_profile, p_conversation, p_category, p_urgency, p_trigger,
        current_tier(p_profile)::text,
        (select p.stage::text from profiles p where p.id = p_profile),
        v_transcript, now(),
        now() + make_interval(mins => _support_sla_minutes(p_urgency))
      ) returning * into t;
      return query select t.id, t.reference, t.urgency, _support_sla_minutes(t.urgency), true, false;
      return;
    exception when unique_violation then
      -- a reference collision; try another
    end;
  end loop;
  raise exception 'Could not allocate a ticket reference.';
end;
$$;
revoke all on function public.file_support_ticket(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.file_support_ticket(uuid, uuid, text, text, text) to service_role;

-- After a hand-off the member may keep writing: keep the open ticket's
-- transcript current. Service role only.
create or replace function public.touch_support_ticket(p_conversation uuid)
returns void language sql security definer set search_path = public as $$
  update support_tickets set transcript = _support_transcript(p_conversation), last_message_at = now()
   where conversation_id = p_conversation and status <> 'resolved';
$$;
revoke all on function public.touch_support_ticket(uuid) from public, anon, authenticated;
grant execute on function public.touch_support_ticket(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. The staff side: the Support tab
-- ---------------------------------------------------------------------------

-- Open (and replied) tickets: urgent ones pinned first, then oldest first.
create or replace function public.staff_support_queue(p_status text default 'open')
returns table (
  id uuid, reference text, category text, urgency text, status text, trigger text,
  created_at timestamptz, sla_due_at timestamptz, first_opened_at timestamptz,
  replied_at timestamptz, resolved_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform _require_staff();
  return query
    select t.id, t.reference, t.category, t.urgency, t.status, t.trigger,
           t.created_at, t.sla_due_at, t.first_opened_at, t.replied_at, t.resolved_at
      from support_tickets t
     where case p_status
             when 'open' then t.status <> 'resolved'
             when 'resolved' then t.status = 'resolved'
             else true
           end
     order by (t.urgency = 'urgent' and t.status <> 'resolved') desc, t.created_at asc
     limit 500;
end;
$$;
revoke all on function public.staff_support_queue(text) from public, anon;
grant execute on function public.staff_support_queue(text) to authenticated;

-- One ticket, for the console. Opening it stops the urgent re-alert clock and
-- is recorded. What staff see: the reference, category, urgency, the plan and
-- verification status when it was filed, the Toastly Help transcript, and the
-- replies. No profile, photos, messages or Gist data.
create or replace function public.staff_support_ticket(p_ref text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t support_tickets;
begin
  perform _require_staff();
  select * into t from support_tickets where reference = p_ref;
  if not found then
    raise exception 'Not found.' using errcode = 'P0002';
  end if;
  if t.first_opened_at is null then
    update support_tickets set first_opened_at = now(), first_opened_by = auth.uid() where id = t.id;
    insert into staff_audit_log (staff_id, item_kind, subject_id, action, reason_category)
    values (auth.uid(), 'support_ticket', t.profile_id, 'support_opened', t.category);
    t.first_opened_at := now();
  end if;
  return jsonb_build_object(
    'id', t.id,
    'reference', t.reference,
    'category', t.category,
    'urgency', t.urgency,
    'status', t.status,
    'trigger', t.trigger,
    'plan', coalesce(t.plan_at_open, current_tier(t.profile_id)::text),
    'verification', coalesce(t.verification_at_open, (select p.stage::text from profiles p where p.id = t.profile_id)),
    'created_at', t.created_at,
    'sla_due_at', t.sla_due_at,
    'first_opened_at', t.first_opened_at,
    'replied_at', t.replied_at,
    'resolved_at', t.resolved_at,
    -- Before 0042 a ticket held the member's words in summary; show them as
    -- the member's turn when there is no transcript.
    'transcript', coalesce(t.transcript,
      case when t.summary is null then '[]'::jsonb
           else jsonb_build_array(jsonb_build_object('role', 'member', 'content', t.summary, 'at', t.created_at)) end),
    'replies', coalesce((
      select jsonb_agg(jsonb_build_object('body', r.body, 'at', r.created_at, 'by', _staff_label(r.staff_id), 'read', r.read_at is not null) order by r.created_at)
        from support_ticket_replies r where r.ticket_id = t.id), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.staff_support_ticket(text) from public, anon;
grant execute on function public.staff_support_ticket(text) to authenticated;

-- A reply. The words go to the member (in the app here, by email from the
-- server); the audit log records that a reply was sent, not what it said.
-- Returns the member's id and the reference so the server can email them.
create or replace function public.staff_support_reply(p_id uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t support_tickets;
  v_body text := btrim(coalesce(p_body, ''));
begin
  perform _require_staff();
  if char_length(v_body) = 0 or char_length(v_body) > 4000 then
    raise exception 'A reply is 1 to 4,000 characters.';
  end if;
  select * into t from support_tickets where id = p_id for update;
  if not found then
    raise exception 'Not found.' using errcode = 'P0002';
  end if;
  insert into support_ticket_replies (ticket_id, profile_id, staff_id, body) values (t.id, t.profile_id, auth.uid(), v_body);
  update support_tickets set
    status = case when status = 'resolved' then 'resolved' else 'replied' end,
    replied_at = now(), last_message_at = now(),
    first_opened_at = coalesce(first_opened_at, now()), first_opened_by = coalesce(first_opened_by, auth.uid())
   where id = t.id;
  insert into member_notices (profile_id, kind, reason_category)
  select t.profile_id, 'support_reply', t.reference
   where not exists (
     select 1 from member_notices n
      where n.profile_id = t.profile_id and n.kind = 'support_reply' and n.reason_category = t.reference and n.dismissed_at is null);
  insert into staff_audit_log (staff_id, item_kind, subject_id, action, reason_category)
  values (auth.uid(), 'support_ticket', t.profile_id, 'support_reply', t.category);
  return jsonb_build_object('profile_id', t.profile_id, 'reference', t.reference);
end;
$$;
revoke all on function public.staff_support_reply(uuid, text) from public, anon;
grant execute on function public.staff_support_reply(uuid, text) to authenticated;

create or replace function public.staff_support_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare
  t support_tickets;
begin
  perform _require_staff();
  if p_status not in ('resolved', 'open') then
    raise exception 'resolved or open';
  end if;
  select * into t from support_tickets where id = p_id for update;
  if not found then
    raise exception 'Not found.' using errcode = 'P0002';
  end if;
  update support_tickets set
    status = p_status,
    resolved_at = case when p_status = 'resolved' then now() else null end,
    first_opened_at = coalesce(first_opened_at, now()), first_opened_by = coalesce(first_opened_by, auth.uid())
   where id = p_id;
  insert into staff_audit_log (staff_id, item_kind, subject_id, action, reason_category)
  values (auth.uid(), 'support_ticket', t.profile_id, case when p_status = 'resolved' then 'support_resolved' else 'support_reopened' end, t.category);
end;
$$;
revoke all on function public.staff_support_status(uuid, text) from public, anon;
grant execute on function public.staff_support_status(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The alert clocks (called by the cron routes with the service role)
-- ---------------------------------------------------------------------------

-- Urgent tickets nobody has opened within the SLA, each returned ONCE: the
-- row is stamped in the same statement, so a second run returns nothing.
create or replace function public.support_tickets_to_realert()
returns table (id uuid, reference text, urgency text)
language sql security definer set search_path = public as $$
  update support_tickets t set realerted_at = now()
   where t.urgency = 'urgent'
     and t.status <> 'resolved'
     and t.first_opened_at is null
     and t.realerted_at is null
     and t.sla_due_at < now()
  returning t.id, t.reference, t.urgency;
$$;
revoke all on function public.support_tickets_to_realert() from public, anon, authenticated;
grant execute on function public.support_tickets_to_realert() to service_role;

-- The morning digest: every ticket waiting on the team, oldest first.
create or replace function public.support_open_digest()
returns table (reference text, urgency text, created_at timestamptz, opened boolean)
language sql stable security definer set search_path = public as $$
  select t.reference, t.urgency, t.created_at, t.first_opened_at is not null
    from support_tickets t
   where t.status = 'open'
   order by t.created_at asc;
$$;
revoke all on function public.support_open_digest() from public, anon, authenticated;
grant execute on function public.support_open_digest() to service_role;

-- ---------------------------------------------------------------------------
-- 7. Retention
-- ---------------------------------------------------------------------------

-- Urgent (safety) tickets outlive the account as a safety record: reference,
-- category and outcome only, for 2 years (privacy policy section 8). Fires on
-- the cascade when an account is deleted, by the member or by staff.
-- Its own id: a reference is unique only among live tickets, so a later
-- ticket may reuse one, and must never overwrite an older safety record.
create table if not exists public.retained_safety_tickets (
  id uuid primary key default gen_random_uuid(),
  reference text not null,
  former_profile_id uuid not null,
  category text not null,
  status text not null,
  created_at timestamptz not null,
  resolved_at timestamptz,
  retain_until timestamptz not null
);
alter table public.retained_safety_tickets enable row level security;
revoke all on public.retained_safety_tickets from anon, authenticated;

create or replace function public.retain_safety_ticket()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.urgency = 'urgent' then
    insert into retained_safety_tickets (reference, former_profile_id, category, status, created_at, resolved_at, retain_until)
    values (old.reference, old.profile_id, old.category, old.status, old.created_at, old.resolved_at, now() + interval '2 years');
  end if;
  return old;
end;
$$;
drop trigger if exists retain_safety_ticket on public.support_tickets;
create trigger retain_safety_ticket before delete on public.support_tickets
  for each row execute function public.retain_safety_ticket();

-- The nightly purge: 0038's definition, plus the ticket transcripts, the
-- team's replies and the retained safety tickets.
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
  delete from retained_safety_tickets where retain_until < now();
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
  -- 0042: the words on a ticket, both ways, 30 days after the last message.
  update support_tickets set transcript = null
   where transcript is not null
     and last_message_at < now() - make_interval(days => v_days);
  delete from support_ticket_replies r
   using support_tickets t
   where t.id = r.ticket_id
     and t.last_message_at < now() - make_interval(days => v_days);
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

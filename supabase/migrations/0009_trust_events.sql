-- Toastly — Trust Sentinel, Phase 1: instrumentation only.
--
-- PRD §5.1.1 splits this feature in two. Phase 1 captures the behavioural
-- signals as structured events; Phase 2 adds the scoring agent and the human
-- review queue, once there is enough data to set thresholds from evidence
-- rather than invention.
--
-- THIS FILE IS PHASE 1 AND NOTHING MORE. There is deliberately no score
-- column, no threshold, no restriction, no reviewer table and no agent. An
-- account is never acted on here; nothing reads these rows yet.
--
-- Two boundaries are enforced structurally, not by convention:
--
--   1. NEVER message content. The Sentinel does not read, parse, classify or
--      score free text — this extends CLAUDE.md's existing "never scan chat"
--      rule to all content analysis. Gist audio and transcripts are equally
--      out of bounds.
--   2. NEVER protected attributes. Tribe, religion, language, relationship
--      history, profession and diaspora status are not inputs. A signal that
--      correlates with them is a defect, not a finding.
--
-- Both are enforced by a CHECK on every row's metadata, so a future caller
-- cannot quietly start attaching them.

create type trust_event_kind as enum (
  -- Gist refusal pattern (§5.1.1: the strongest single signal)
  'gist_invitation_sent',
  'gist_invitation_declined',
  'gist_invitation_cancelled',
  'gist_session_completed',
  -- Escalation velocity
  'couple_mode_requested',
  'date_request_created',
  -- Report clustering
  'report_filed',
  -- Verification drift
  'verification_recheck',
  -- Coin-deposit no-show pattern, recorded per party
  'stake_forfeited',
  'stake_credit_received',
  -- Cross-tier arbitrage overlap — the SAME signals as pricing integrity.
  -- PRD §5.1.1: "same signals, same queue; do not build two pipelines."
  'payment_geography_mismatch',
  'phone_origin_mismatch',
  'ip_country_mismatch'
);

-- Metadata guard. Rejects any key that would carry message content, session
-- audio, or a protected attribute.
create or replace function public.trust_meta_is_clean(p jsonb)
returns boolean
language sql
immutable
as $$
  select not exists (
    select 1
    from jsonb_object_keys(coalesce(p, '{}'::jsonb)) k
    where k = any (array[
      -- content
      'body', 'message', 'text', 'content', 'snippet', 'preview',
      'transcript', 'audio', 'recording',
      -- protected attributes
      'tribe', 'religion', 'language', 'languages', 'history',
      'relationship_history', 'profession', 'education', 'diaspora'
    ])
  );
$$;

create table public.trust_events (
  id uuid primary key default gen_random_uuid(),
  -- Whose behaviour this describes.
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- The other party, where the signal involves one.
  subject_id uuid references public.profiles (id) on delete set null,
  kind trust_event_kind not null,
  occurred_at timestamptz not null default now(),
  -- Behavioural metadata only: counts, elapsed times, category labels.
  meta jsonb not null default '{}'::jsonb,
  constraint trust_meta_has_no_content_or_protected_attributes
    check (public.trust_meta_is_clean(meta))
);

create index trust_events_profile_idx
  on public.trust_events (profile_id, occurred_at desc);
create index trust_events_kind_idx
  on public.trust_events (kind, occurred_at desc);

-- Emission happens in triggers rather than application code, so a signal is
-- captured whichever client wrote the row, and cannot be skipped by one.
create or replace function public.emit_trust_event(
  p_profile_id uuid,
  p_subject_id uuid,
  p_kind trust_event_kind,
  p_meta jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_profile_id is null then
    return;
  end if;
  insert into trust_events (profile_id, subject_id, kind, meta)
  values (p_profile_id, p_subject_id, p_kind, coalesce(p_meta, '{}'::jsonb));
end;
$$;

-- Seconds since these two first interacted, for escalation-velocity signals.
-- Elapsed time is behaviour, not content: the reply bodies are never read.
--
-- Returns NULL when the pair has never exchanged a reply. Deliberately not
-- zero — zero would read to Phase 2 as "escalated instantly", which is the
-- opposite of "there is no conversation to measure from", and would make the
-- fastest-looking scammers out of people who matched through another route.
create or replace function public.seconds_since_match(a uuid, b uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select extract(epoch from (now() - min(r.created_at)))::int
  from replies r
  where (r.sender_id = a and r.recipient_id = b)
     or (r.sender_id = b and r.recipient_id = a);
$$;

-- ---------------------------------------------------------------------------
-- Gist invitations: sent, declined, cancelled, completed
-- ---------------------------------------------------------------------------

create or replace function public.trust_on_gist_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform emit_trust_event(
    new.proposer_id, new.invitee_id, 'gist_invitation_sent',
    jsonb_build_object('medium', new.medium)
  );
  return new;
end;
$$;

create trigger trust_gist_insert
  after insert on public.gist_sessions
  for each row execute function public.trust_on_gist_insert();

create or replace function public.trust_on_gist_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'declined' then
    -- Attributed to the invitee: declining is their behaviour.
    perform emit_trust_event(new.invitee_id, new.proposer_id,
      'gist_invitation_declined', jsonb_build_object('medium', new.medium));
  elsif new.status = 'cancelled' then
    -- The schema does not record who cancelled, so this is attributed to the
    -- proposer and says so. Phase 2 must not read it as certain.
    perform emit_trust_event(new.proposer_id, new.invitee_id,
      'gist_invitation_cancelled',
      jsonb_build_object('medium', new.medium, 'actor', 'unrecorded'));
  elsif new.status = 'completed' then
    -- The counterweight to refusal: without it, "declined 4" has no
    -- denominator and a busy member looks like a scammer.
    perform emit_trust_event(new.proposer_id, new.invitee_id,
      'gist_session_completed', jsonb_build_object('medium', new.medium));
    perform emit_trust_event(new.invitee_id, new.proposer_id,
      'gist_session_completed', jsonb_build_object('medium', new.medium));
  end if;
  return new;
end;
$$;

create trigger trust_gist_status
  after update on public.gist_sessions
  for each row execute function public.trust_on_gist_status();

-- ---------------------------------------------------------------------------
-- Escalation velocity: Couple Mode requests and date requests
-- ---------------------------------------------------------------------------

create or replace function public.trust_on_couple_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_other uuid := case when new.proposed_by = new.member_a
                       then new.member_b else new.member_a end;
begin
  perform emit_trust_event(
    new.proposed_by, v_other, 'couple_mode_requested',
    jsonb_build_object('seconds_since_match',
                       seconds_since_match(new.proposed_by, v_other))
  );
  return new;
end;
$$;

create trigger trust_couple_insert
  after insert on public.couples
  for each row execute function public.trust_on_couple_insert();

-- date_commitments records both parties but not who proposed. Escalation
-- velocity is per person, so attributing it to the wrong one would be worse
-- than not recording it.
alter table public.date_commitments
  add column if not exists created_by uuid references public.profiles (id);

create or replace function public.trust_on_date_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := coalesce(new.created_by, new.member_a);
  v_other uuid := case when coalesce(new.created_by, new.member_a) = new.member_a
                       then new.member_b else new.member_a end;
begin
  perform emit_trust_event(
    v_actor, v_other, 'date_request_created',
    jsonb_build_object(
      'seconds_since_match', seconds_since_match(v_actor, v_other),
      'actor', case when new.created_by is null then 'assumed' else 'recorded' end
    )
  );
  return new;
end;
$$;

create trigger trust_date_request
  after insert on public.date_commitments
  for each row execute function public.trust_on_date_request();

-- ---------------------------------------------------------------------------
-- Report clustering — category only, never the reporter's free text
-- ---------------------------------------------------------------------------

create or replace function public.trust_on_report()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- The event is about the REPORTED account's behaviour. `detail` is free
  -- text written by a member and is deliberately not copied.
  perform emit_trust_event(
    new.reported_id, new.reporter_id, 'report_filed',
    jsonb_build_object('reason', new.reason)
  );
  return new;
end;
$$;

create trigger trust_report_filed
  after insert on public.reports
  for each row execute function public.trust_on_report();

-- ---------------------------------------------------------------------------
-- Verification drift — re-checks after the first pass
-- ---------------------------------------------------------------------------

create or replace function public.trust_on_verification_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stage is distinct from old.stage
     and old.stage in ('verified_real', 'id_confirmed') then
    perform emit_trust_event(
      new.id, null, 'verification_recheck',
      jsonb_build_object('from_stage', old.stage, 'to_stage', new.stage)
    );
  end if;
  return new;
end;
$$;

create trigger trust_verification_change
  after update on public.profiles
  for each row execute function public.trust_on_verification_change();

-- ---------------------------------------------------------------------------
-- Coin-deposit no-show pattern, recorded per party
-- ---------------------------------------------------------------------------

create or replace function public.trust_on_commitment_settled()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_present uuid;
begin
  if new.status = 'no_show' and old.status is distinct from 'no_show'
     and new.no_show_member is not null then
    v_present := case when new.no_show_member = new.member_a
                      then new.member_b else new.member_a end;
    perform emit_trust_event(new.no_show_member, v_present, 'stake_forfeited',
      jsonb_build_object('party', 'absent', 'stake_coins', new.stake_coins));
    perform emit_trust_event(v_present, new.no_show_member, 'stake_credit_received',
      jsonb_build_object('party', 'present', 'stake_coins', new.stake_coins));
  end if;
  return new;
end;
$$;

create trigger trust_commitment_settled
  after update on public.date_commitments
  for each row execute function public.trust_on_commitment_settled();

-- ---------------------------------------------------------------------------
-- Cross-tier arbitrage — the same signals as pricing integrity, one pipeline
-- ---------------------------------------------------------------------------

create or replace function public.trust_on_integrity_signal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform emit_trust_event(
    new.profile_id, null,
    (new.signal::text)::trust_event_kind,
    jsonb_build_object('review_id', new.id)
  );
  return new;
end;
$$;

create trigger trust_integrity_signal
  after insert on public.integrity_reviews
  for each row execute function public.trust_on_integrity_signal();

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
--
-- RLS is on with NO policies: no client may read or write these rows, not
-- even about themselves. Rows arrive only through the security-definer
-- triggers above, and Phase 2 staff tooling will read them with the service
-- role. A member-readable trust log would teach a scammer exactly which
-- behaviours are counted.

alter table public.trust_events enable row level security;

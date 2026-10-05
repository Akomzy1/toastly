-- Toastly — download your data, delete your account (privacy policy §8, §10).
--
-- Both are promised in the privacy policy and are launch blockers (decided
-- 2026-10-05). Both are ALWAYS available: neither reads a tier, and neither
-- calls assert_live() — a member whose access is paused can still take
-- their data or leave (PRD §5.1.2).
--
-- Retention, from the privacy policy §8:
--   * account and profile data — deleted (we delete immediately, inside the
--     policy's [30] days);
--   * safety records (reports) — kept up to [2] years after the account
--     closes;
--   * payment and financial records — kept [6] years, as tax law requires.
-- Before this file, deleting a member would either have failed (several
-- foreign keys had no delete rule) or destroyed the records the policy says
-- are kept (payments and reports cascaded). Kept records are now DE-LINKED:
-- the row survives, the pointer to the deleted person does not.

-- ---------------------------------------------------------------------------
-- 1. Foreign keys that blocked deletion or destroyed kept records
-- ---------------------------------------------------------------------------

-- Payments: kept, de-linked.
alter table public.payments alter column profile_id drop not null;
alter table public.payments drop constraint payments_profile_id_fkey;
alter table public.payments add constraint payments_profile_id_fkey
  foreign key (profile_id) references public.profiles (id) on delete set null;
alter table public.payments add column account_deleted_at timestamptz;

-- Reports: kept as safety records, de-linked on whichever side was deleted.
alter table public.reports alter column reporter_id drop not null;
alter table public.reports alter column reported_id drop not null;
alter table public.reports drop constraint reports_reporter_id_fkey;
alter table public.reports drop constraint reports_reported_id_fkey;
alter table public.reports add constraint reports_reporter_id_fkey
  foreign key (reporter_id) references public.profiles (id) on delete set null;
alter table public.reports add constraint reports_reported_id_fkey
  foreign key (reported_id) references public.profiles (id) on delete set null;
alter table public.reports add column account_deleted_at timestamptz;

-- References with no delete rule, which would make deletion fail.
alter table public.date_commitments drop constraint date_commitments_no_show_member_fkey;
alter table public.date_commitments add constraint date_commitments_no_show_member_fkey
  foreign key (no_show_member) references public.profiles (id) on delete set null;
alter table public.date_commitments drop constraint date_commitments_created_by_fkey;
alter table public.date_commitments add constraint date_commitments_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;
alter table public.couples alter column proposed_by drop not null;
alter table public.couples drop constraint couples_proposed_by_fkey;
alter table public.couples add constraint couples_proposed_by_fkey
  foreign key (proposed_by) references public.profiles (id) on delete set null;
alter table public.couple_milestones alter column created_by drop not null;
alter table public.couple_milestones drop constraint couple_milestones_created_by_fkey;
alter table public.couple_milestones add constraint couple_milestones_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 2. The erasure log
-- ---------------------------------------------------------------------------
--
-- Proof that a deletion happened and when, holding nothing about the person:
-- the id is a bare uuid that no longer resolves to anyone. Staff only.
create table public.account_deletions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  payments_kept integer not null default 0,
  reports_kept integer not null default 0
);

alter table public.account_deletions enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Before the account is deleted
-- ---------------------------------------------------------------------------
--
-- SERVICE ROLE ONLY — called by the deletion action after it has confirmed
-- the signed-in member asked. Leaves nobody else worse off:
--   * an active Couple Mode is ended first, which un-pauses the partner
--     (0006) — otherwise their profile would stay paused for ever;
--   * a date with stakes down is called off with every stake returned
--     (settle_commitment 'cancelled'), so the other person keeps theirs;
--   * kept records are stamped before they are de-linked.
-- Returns the storage paths the server must delete, since SQL can't reach
-- storage: the member's photos and the images they sent.
create or replace function public.prepare_account_deletion(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  v_log uuid;
  v_payments integer;
  v_reports integer;
begin
  if not exists (select 1 from profiles where id = p_profile_id) then
    raise exception 'No such account.';
  end if;

  update couples set status = 'ended'
   where status = 'active' and (member_a = p_profile_id or member_b = p_profile_id);
  update couples set status = 'ended'
   where status = 'proposed' and (member_a = p_profile_id or member_b = p_profile_id);

  for c in
    select id from date_commitments
    where status in ('pending', 'confirmed')
      and (member_a = p_profile_id or member_b = p_profile_id)
  loop
    perform settle_commitment(c.id, 'cancelled');
  end loop;

  update payments set account_deleted_at = now() where profile_id = p_profile_id;
  get diagnostics v_payments = row_count;
  update reports set account_deleted_at = now()
   where reporter_id = p_profile_id or reported_id = p_profile_id;
  get diagnostics v_reports = row_count;

  insert into account_deletions (profile_id, payments_kept, reports_kept)
  values (p_profile_id, v_payments, v_reports)
  returning id into v_log;

  return jsonb_build_object(
    'log_id', v_log,
    'photo_paths', coalesce((
      select jsonb_agg(storage_path) from profile_photos where profile_id = p_profile_id
    ), '[]'::jsonb),
    'attachment_paths', coalesce((
      select jsonb_agg(a.storage_path)
      from message_attachments a
      join messages m on m.id = a.message_id
      where m.sender_id = p_profile_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Download your data
-- ---------------------------------------------------------------------------
--
-- Everything Toastly holds about the caller, in one portable JSON document.
-- Only ever the caller: it takes no argument.
--
-- What it deliberately does NOT contain:
--   * another member's personal data beyond what the member already sees
--     in the app — the other side of a Gist "continue?" is never included
--     (0003), nor who reported them;
--   * on Starter, the content or sender of messages they can't yet read: the
--     locked inbox is locked in the export too (CLAUDE.md) — a count only;
--   * Trust Sentinel events and pricing-integrity signals: by design no
--     member can read these (0009), because a readable trust log teaches a
--     scammer what is counted. Requests for them go to support, where a
--     person decides — flagged as a legal question, not settled here.
create or replace function public.export_my_data()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with me as (select auth.uid() as id)
  select jsonb_build_object(
    'generated_at', now(),
    'profile', (select to_jsonb(p) - 'main_photo_id' - 'pending_main_photo_id'
                from profiles p, me where p.id = me.id),
    'plans', (select coalesce(jsonb_agg(jsonb_build_object(
                'tier', e.tier, 'source', e.source, 'starts_at', e.starts_at, 'ends_at', e.ends_at)
                order by e.starts_at), '[]')
              from entitlements e, me where e.profile_id = me.id),
    'prompt_answers', (select coalesce(jsonb_agg(jsonb_build_object(
                'prompt', pr.text, 'answer', pa.answer, 'updated_at', pa.updated_at)), '[]')
              from prompt_answers pa join prompts pr on pr.id = pa.prompt_id, me
              where pa.profile_id = me.id),
    'photos', (select coalesce(jsonb_agg(jsonb_build_object(
                'path', ph.storage_path, 'position', ph.position,
                'main_photo', ph.id = (select main_photo_id from profiles, me where profiles.id = me.id),
                'face_match', ph.face_match, 'added_at', ph.created_at)
                order by ph.position), '[]')
              from profile_photos ph, me where ph.profile_id = me.id),
    'matches_shown', (select coalesce(jsonb_agg(jsonb_build_object('date', d.feed_date, 'count', d.n)
                order by d.feed_date), '[]')
              from (select feed_date, count(*) as n from daily_feed, me
                    where daily_feed.profile_id = me.id group by feed_date) d),
    'replies_sent', (select coalesce(jsonb_agg(jsonb_build_object(
                'kind', r.kind, 'body', r.body, 'sent_at', r.created_at)), '[]')
              from replies r, me where r.sender_id = me.id),
    'gist_sessions', (select coalesce(jsonb_agg(jsonb_build_object(
                'medium', g.medium, 'status', g.status, 'scheduled_for', g.scheduled_for,
                'started_at', g.started_at, 'ended_at', g.ended_at,
                'you_proposed', g.proposer_id = me.id,
                'your_answer_to_continue', (select o.wants_to_continue from gist_outcomes o
                                            where o.session_id = g.id and o.profile_id = me.id))
                order by g.created_at), '[]')
              from gist_sessions g, me where me.id in (g.proposer_id, g.invitee_id)),
    'messages', case
      when can_read_inbox((select id from me)) then
        (select coalesce(jsonb_agg(jsonb_build_object(
            'thread', m.thread_id, 'from_you', m.sender_id = me.id,
            'body', m.body, 'sent_at', m.created_at)
            order by m.created_at), '[]')
         from messages m join threads t on t.id = m.thread_id, me
         where me.id in (t.member_a, t.member_b))
      else
        (select coalesce(jsonb_agg(jsonb_build_object(
            'thread', m.thread_id, 'body', m.body, 'sent_at', m.created_at)
            order by m.created_at), '[]')
         from messages m, me where m.sender_id = me.id)
    end,
    'messages_waiting_unread', case
      when can_read_inbox((select id from me)) then null
      else (select count(*) from messages m join threads t on t.id = m.thread_id, me
            where m.sender_id <> me.id and me.id in (t.member_a, t.member_b))
    end,
    'dates', (select coalesce(jsonb_agg(jsonb_build_object(
                'scheduled_for', dc.scheduled_for, 'status', dc.status,
                'venue', dc.venue_name, 'stake_coins', dc.stake_coins)), '[]')
              from date_commitments dc, me where me.id in (dc.member_a, dc.member_b)),
    'coins', (select coalesce(jsonb_agg(jsonb_build_object(
                'change', l.delta, 'kind', l.kind, 'note', l.note, 'at', l.created_at)
                order by l.created_at), '[]')
              from coin_ledger l, me where l.profile_id = me.id),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object(
                'provider', py.provider, 'amount_minor', py.amount_minor, 'currency', py.currency,
                'status', py.status, 'purpose', py.purpose, 'at', py.created_at)), '[]')
              from payments py, me where py.profile_id = me.id),
    'couple_mode', (select coalesce(jsonb_agg(jsonb_build_object(
                'status', c.status, 'started_at', c.started_at, 'ended_at', c.ended_at,
                'milestones', (select coalesce(jsonb_agg(jsonb_build_object(
                    'kind', cm.kind, 'on', cm.occurred_on, 'note', cm.note)), '[]')
                  from couple_milestones cm where cm.couple_id = c.id))), '[]')
              from couples c, me where me.id in (c.member_a, c.member_b)),
    'reports_you_filed', (select coalesce(jsonb_agg(jsonb_build_object(
                'reason', rp.reason, 'detail', rp.detail, 'status', rp.status, 'at', rp.created_at)), '[]')
              from reports rp, me where rp.reporter_id = me.id),
    'blocks', (select count(*) from blocks b, me where b.blocker_id = me.id),
    'emergency_contact', (select jsonb_build_object('label', ec.label, 'phone', ec.phone_e164,
                'confirmed_at', ec.confirmed_at)
              from emergency_contacts ec, me where ec.profile_id = me.id),
    'not_included', jsonb_build_array(
      'Safety and fraud-prevention records (Trust Sentinel events, pricing-integrity signals) and reports about you. Ask support@trytoastly.com.',
      'Other members'' answers and personal details.',
      'Your verification selfie and ID number: Toastly never stores them, only the result.'
    )
  );
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

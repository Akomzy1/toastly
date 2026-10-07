-- Toastly — "Threatening or pressuring me" reports go to the top of the
-- review queue (decided 7 October 2026). Follows 0033.
--
-- A report with reason threats_or_coercion — from a profile, a card, a Gist,
-- a date or the locked inbox (blind) — is marked urgent when it is filed,
-- and the queue lists urgent cases first, oldest first among them, then
-- everything else as before. Nothing else about the case changes: a person
-- still reviews it, with the same evidence and the same decisions.

alter table public.review_items add column if not exists urgent boolean not null default false;
create index if not exists review_items_urgent_idx on public.review_items (urgent desc, created_at) where stage <> 'decided';

-- queue_from_source: 0029_photos_face_match_live_profile.sql's definition,
-- with threat reports marked urgent.
create or replace function public.queue_from_source()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_other uuid;
begin
  if tg_table_name = 'integrity_reviews' then
    perform _queue('pricing', new.profile_id, 'integrity_reviews', new.id, null);
  elsif tg_table_name = 'reports' then
    perform _queue(case when new.reason = 'user_is_married' then 'married_report'
                        when new.blind then 'blind_report' else 'report' end,
                   new.reported_id, 'reports', new.id, new.reporter_id);
    if new.reason = 'threats_or_coercion' then
      update review_items set urgent = true where source_table = 'reports' and source_id = new.id;
    end if;
  elsif tg_table_name = 'attendance_reviews' then
    select case when d.member_a = new.contested_by then d.member_b else d.member_a end into v_other
      from date_commitments d where d.id = new.commitment_id;
    perform _queue('attendance', new.contested_by, 'attendance_reviews', new.commitment_id, v_other);
  elsif tg_table_name = 'verification_sessions' then
    -- Main-photo replacement checks reach a person as 'photo_match', through
    -- record_main_photo_match (0029), never as an ID review.
    if new.product = 'photo_match' then return new; end if;
    if new.status = 'attention' and (tg_op = 'INSERT' or old.status is distinct from 'attention') then
      perform _queue(case when new.product = 'smartselfie' then 'selfie_review' else 'id_review' end,
                     new.profile_id, 'verification_sessions', new.id, null);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.queue_from_source() from public, anon, authenticated;

-- Threat reports already waiting move up too.
update public.review_items i set urgent = true
  from public.reports r
 where i.source_table = 'reports' and i.source_id = r.id and r.reason = 'threats_or_coercion' and not i.urgent;

-- staff_queue: 0026_diaspora_rules_console.sql's definition, returning
-- urgent and listing urgent cases first.
drop function if exists public.staff_queue(text);
create or replace function public.staff_queue(p_group text default 'open')
returns table (id uuid, case_no bigint, kind text, reason text, created_at timestamptz, stage text, assigned_name text, urgent boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform _require_staff();
  return query
  select i.id, i.case_no, i.kind, _case_reason(i), i.created_at, i.stage,
         case when i.assigned_to is null then null else _staff_label(i.assigned_to) end,
         i.urgent
    from review_items i
   where case p_group
           when 'open' then i.stage <> 'decided'
           when 'all' then true
           else i.stage = p_group end
   order by i.urgent desc, i.created_at asc
   limit 500;
end;
$$;
revoke all on function public.staff_queue(text) from public, anon;
grant execute on function public.staff_queue(text) to authenticated;

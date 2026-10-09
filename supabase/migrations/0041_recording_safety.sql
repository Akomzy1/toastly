-- Toastly — being recorded on video (decided 9 October 2026; PRD §5.4).
-- Follows 0040.
--
-- A web app can't block screenshots or screen recording, so Toastly never
-- claims to. Instead:
--   - the first time video would turn on for a member, they're told, once:
--     "Toastly never records calls, but we can't stop someone recording their
--     screen. Only turn on video if you're comfortable." (profiles
--     .video_notice_seen_at — once per member, across devices);
--   - a faint watermark of the VIEWER's first name and the date moves over
--     the incoming video, drawn on the viewer's screen only (the app; never
--     in the stream);
--   - "They recorded or shared me" is a report reason, and goes to the top
--     of the review queue like threats (0034).
--
-- New enum values can't be used until the migration commits, so the new
-- reason is compared as text below.

set search_path = public;

alter type report_reason add value if not exists 'recorded_or_shared';

-- queue_from_source: 0034's definition, with "They recorded or shared me"
-- marked urgent alongside threats.
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
    if new.reason::text in ('threats_or_coercion', 'recorded_or_shared') then
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

-- The reviewer's label for each reason: 0026's, plus "These photos aren't
-- them" (0029 — it was showing as "Other") and the new reason.
create or replace function public._report_label(p report_reason)
returns text language sql immutable as $$
  select case p::text
    when 'user_is_married' then 'Married'
    when 'scam_or_fraud' then 'Scam or fraud'
    when 'asked_for_money' then 'Asking for money'
    when 'fake_profile' then 'Fake profile'
    when 'harassment' then 'Harassment'
    when 'threats_or_coercion' then 'Threats or coercion'
    when 'underage' then 'Under 18'
    when 'photos_not_them' then 'Photos aren''t them'
    when 'recorded_or_shared' then 'Recorded or shared them'
    else 'Other' end;
$$;

-- The one-time recording notice: once per member, wherever they are.
alter table public.profiles add column if not exists video_notice_seen_at timestamptz;

create or replace function public.acknowledge_video_notice()
returns void language sql security definer set search_path = public as $$
  update profiles set video_notice_seen_at = coalesce(video_notice_seen_at, now()) where id = auth.uid();
$$;
revoke all on function public.acknowledge_video_notice() from public, anon;
grant execute on function public.acknowledge_video_notice() to authenticated;

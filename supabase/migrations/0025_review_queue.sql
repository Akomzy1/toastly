-- Toastly — the staff review queue, member restrictions, and two pricing
-- rules on the member's track.
--
-- Decided 4 October 2026:
--   1. Every Naira plan bought by a member whose profile country is outside
--      Nigeria — by card, bank, USSD or coins — raises a pricing review.
--      Checked in the database, not only on the plan page. Signal only.
--   2. Diaspora-to-diaspora matching needs an active Diaspora or Diaspora
--      Plus plan. 0012 already enforces it in build_daily_feed; this file
--      keeps that and adds what restriction requires. The women's 30-day
--      launch offer follows the member's track: Diaspora Plus abroad,
--      Premium Plus at home.
--   3. One staff queue for every human-review item — pricing signals,
--      reports (married-user and blind reports among them), attendance
--      disputes, borderline selfie and ID checks, and slots for photo
--      matches (Prompt 14, parked) and Sentinel flags (Phase 2: CLAUDE.md
--      keeps the Sentinel events-only, so nothing creates one yet).
--      Actions: clear, ask to switch plan, request re-verification,
--      restrict, remove — and, for attendance, attended / no-show. Every
--      decision is written to an append-only audit log.
--
-- Staff are ordinary accounts listed in staff_members (added by the owner in
-- SQL). Members can't read any of the staff tables, can't call any staff
-- function, and can't tell the queue exists. Evidence shown to staff never
-- includes message content, Gist audio or transcripts, selfies or ID
-- numbers — none of which Toastly keeps anyway.
--
-- Nothing here acts on its own. A signal opens an item; a person decides.

-- ---------------------------------------------------------------------------
-- 1. A Naira plan bought from a profile abroad
-- ---------------------------------------------------------------------------

alter type integrity_signal add value if not exists 'profile_country_mismatch';
alter type trust_event_kind add value if not exists 'profile_country_mismatch';

create or replace function public.trust_naira_plan_abroad()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_country text;
  v_route text;
begin
  select country_code into v_country from profiles where id = new.profile_id;
  if v_country is null or v_country = 'NG' then return new; end if;
  if tg_table_name = 'payments' then
    if new.currency <> 'NGN' or new.kind not in ('plan_pass', 'plan_recurring', 'plan_remainder') then return new; end if;
    v_route := new.kind;
  else
    if new.source <> 'coins' or new.tier not in ('premium', 'premium_plus') then return new; end if;
    v_route := 'coins';
  end if;
  perform _integrity_signal(new.profile_id, 'profile_country_mismatch',
    jsonb_build_object('track', 'ngn', 'route', v_route, 'country', v_country));
  return new;
end;
$$;
revoke all on function public.trust_naira_plan_abroad() from public, anon, authenticated;

drop trigger if exists naira_plan_abroad on public.payments;
create trigger naira_plan_abroad after insert on public.payments
  for each row execute function public.trust_naira_plan_abroad();
drop trigger if exists naira_plan_abroad on public.entitlements;
create trigger naira_plan_abroad after insert on public.entitlements
  for each row execute function public.trust_naira_plan_abroad();

-- ---------------------------------------------------------------------------
-- 2. The women's launch offer follows the track
-- ---------------------------------------------------------------------------
--
-- Signup doesn't ask for a country, so the grant starts as Premium Plus and
-- switches when the member sets a country outside Nigeria (or back). Same
-- end date; the days already used are not given back or taken away.

create or replace function public.womens_offer_follows_track()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  g entitlements;
  v_tier tier;
begin
  if new.country_code is not distinct from old.country_code then return new; end if;
  select * into g from entitlements
   where profile_id = new.id and source = 'womens_launch_offer' and ends_at > now()
   order by ends_at desc limit 1;
  if not found then return new; end if;
  v_tier := case when new.country_code = 'NG' then 'premium_plus'::tier else 'diaspora_plus'::tier end;
  if g.tier = v_tier then return new; end if;
  update entitlements set ends_at = now() where id = g.id;
  insert into entitlements (profile_id, tier, source, starts_at, ends_at)
  values (new.id, v_tier, 'womens_launch_offer', now(), g.ends_at);
  return new;
end;
$$;
revoke all on function public.womens_offer_follows_track() from public, anon, authenticated;

drop trigger if exists womens_offer_follows_track on public.profiles;
create trigger womens_offer_follows_track after update of country_code on public.profiles
  for each row execute function public.womens_offer_follows_track();

-- ---------------------------------------------------------------------------
-- 3. Staff, the queue, and what staff can do
-- ---------------------------------------------------------------------------

create table if not exists public.staff_members (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.staff_members enable row level security;
revoke all on public.staff_members from anon, authenticated;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff_members where profile_id = auth.uid());
$$;
revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

create or replace function public._require_staff()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from staff_members where profile_id = auth.uid()) then
    raise exception 'Not available.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public._require_staff() from public, anon, authenticated;

-- What a member is told: a category, never the signal, the reporter or a
-- score (CLAUDE.md, PRD §5.1.1).
create or replace function public._reason_category(p_kind text)
returns text language sql immutable as $$
  select case p_kind
    when 'pricing' then 'plan_track'
    when 'married_report' then 'community_standards'
    when 'report' then 'report'
    when 'blind_report' then 'report'
    when 'attendance' then 'date_attendance'
    when 'selfie_review' then 'verification'
    when 'id_review' then 'verification'
    when 'photo_match' then 'verification'
    else 'safety' end;
$$;

create table if not exists public.review_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('pricing', 'report', 'married_report', 'blind_report', 'attendance',
                                     'selfie_review', 'id_review', 'photo_match', 'sentinel')),
  subject_id uuid not null references public.profiles (id) on delete cascade,
  source_table text not null,
  source_id uuid not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  decision text,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_table, source_id)
);
create index if not exists review_items_queue_idx on public.review_items (status, created_at);
create index if not exists review_items_subject_idx on public.review_items (subject_id, status);
alter table public.review_items enable row level security;
revoke all on public.review_items from anon, authenticated;

-- Restrictions: hidden from every feed, no new contact. Safety tools, Help,
-- verification and your own data keep working. Staff can lift it.
create table if not exists public.account_restrictions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  reason_category text not null,
  review_item_id uuid,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid references public.profiles (id) on delete set null
);
create unique index if not exists account_restrictions_one_active on public.account_restrictions (profile_id) where lifted_at is null;
alter table public.account_restrictions enable row level security;
revoke all on public.account_restrictions from anon, authenticated;
drop policy if exists "own restriction readable" on public.account_restrictions;
create policy "own restriction readable" on public.account_restrictions for select using (auth.uid() = profile_id);
grant select (id, profile_id, reason_category, created_at, lifted_at) on public.account_restrictions to authenticated;

-- A request to take the selfie check again. Hidden from new feeds until a
-- fresh selfie passes; conversations carry on. Members read their own row
-- and can't write it.
create table if not exists public.reverification_requests (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  reason_category text not null,
  requested_at timestamptz not null default now(),
  requested_by uuid references public.profiles (id) on delete set null
);
alter table public.reverification_requests enable row level security;
revoke all on public.reverification_requests from anon, authenticated;
drop policy if exists "own reverification readable" on public.reverification_requests;
create policy "own reverification readable" on public.reverification_requests for select using (auth.uid() = profile_id);
grant select (profile_id, reason_category, requested_at) on public.reverification_requests to authenticated;

-- A passing selfie taken after the request clears it.
create or replace function public.reverification_passed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.product = 'smartselfie' and new.passed is true and old.passed is distinct from true then
    delete from reverification_requests where profile_id = new.profile_id and requested_at <= new.created_at;
  end if;
  return new;
end;
$$;
revoke all on function public.reverification_passed() from public, anon, authenticated;
drop trigger if exists reverification_passed on public.verification_sessions;
create trigger reverification_passed after update on public.verification_sessions
  for each row execute function public.reverification_passed();

-- Notices a member sees in the app (today: "please switch plan").
create table if not exists public.member_notices (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('switch_plan')),
  reason_category text not null,
  created_at timestamptz not null default now(),
  dismissed_at timestamptz
);
alter table public.member_notices enable row level security;
revoke all on public.member_notices from anon, authenticated;
drop policy if exists "own notices readable" on public.member_notices;
create policy "own notices readable" on public.member_notices for select using (auth.uid() = profile_id);
grant select on public.member_notices to authenticated;

create or replace function public.dismiss_notice(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update member_notices set dismissed_at = now() where id = p_id and profile_id = auth.uid() and dismissed_at is null;
$$;
revoke all on function public.dismiss_notice(uuid) from public, anon;
grant execute on function public.dismiss_notice(uuid) to authenticated;

-- Every staff decision, forever. No foreign keys to the subject, so the
-- record outlives a removed account.
create table if not exists public.staff_audit_log (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null,
  review_item_id uuid,
  item_kind text,
  subject_id uuid not null,
  action text not null,
  reason_category text,
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists staff_audit_subject_idx on public.staff_audit_log (subject_id, created_at desc);
alter table public.staff_audit_log enable row level security;
revoke all on public.staff_audit_log from anon, authenticated;

create or replace function public.staff_audit_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'The staff audit log is append-only.' using errcode = '42501';
end;
$$;
drop trigger if exists staff_audit_append_only on public.staff_audit_log;
create trigger staff_audit_append_only before update or delete on public.staff_audit_log
  for each row execute function public.staff_audit_append_only();

-- Removed accounts: the sign-in stays blocked (banned in Auth) until the
-- retention period ends, then the auth user is deleted too.
create table if not exists public.account_removals (
  former_profile_id uuid primary key,
  reason_category text not null,
  removed_by uuid,
  removed_at timestamptz not null default now(),
  retain_until timestamptz not null
);
alter table public.account_removals enable row level security;
revoke all on public.account_removals from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Feeding the queue
-- ---------------------------------------------------------------------------

alter table public.reports add column if not exists blind boolean not null default false;

create or replace function public._queue(p_kind text, p_subject uuid, p_table text, p_id uuid)
returns void language sql security definer set search_path = public as $$
  insert into review_items (kind, subject_id, source_table, source_id)
  values (p_kind, p_subject, p_table, p_id)
  on conflict (source_table, source_id) do nothing;
$$;
revoke all on function public._queue(text, uuid, text, uuid) from public, anon, authenticated;

create or replace function public.queue_from_source()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'integrity_reviews' then
    perform _queue('pricing', new.profile_id, 'integrity_reviews', new.id);
  elsif tg_table_name = 'reports' then
    perform _queue(case when new.reason = 'user_is_married' then 'married_report'
                        when new.blind then 'blind_report' else 'report' end,
                   new.reported_id, 'reports', new.id);
  elsif tg_table_name = 'attendance_reviews' then
    perform _queue('attendance', new.contested_by, 'attendance_reviews', new.commitment_id);
  elsif tg_table_name = 'verification_sessions' then
    if new.status = 'attention' and (tg_op = 'INSERT' or old.status is distinct from 'attention') then
      perform _queue(case when new.product = 'smartselfie' then 'selfie_review' else 'id_review' end,
                     new.profile_id, 'verification_sessions', new.id);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.queue_from_source() from public, anon, authenticated;

drop trigger if exists queue_item on public.integrity_reviews;
create trigger queue_item after insert on public.integrity_reviews for each row execute function public.queue_from_source();
drop trigger if exists queue_item on public.reports;
create trigger queue_item after insert on public.reports for each row execute function public.queue_from_source();
drop trigger if exists queue_item on public.attendance_reviews;
create trigger queue_item after insert on public.attendance_reviews for each row execute function public.queue_from_source();
drop trigger if exists queue_item on public.verification_sessions;
create trigger queue_item after insert or update of status on public.verification_sessions for each row execute function public.queue_from_source();

-- Blind reports are marked, so the queue can say the reporter never saw who
-- they were reporting (0012).
create or replace function public.blind_report_locked(
  p_reason report_reason,
  p_detail text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Not signed in.';
  end if;
  insert into reports (reporter_id, reported_id, reason, detail, blind)
  select v_me, m.sender_id, p_reason, p_detail, true
  from messages m
  join threads t on t.id = m.thread_id
  where m.sender_id <> v_me
    and (t.member_a = v_me or t.member_b = v_me)
    and m.read_at is null
  group by m.sender_id;
end;
$$;

-- Everything already waiting.
insert into review_items (kind, subject_id, source_table, source_id, created_at)
select 'pricing', profile_id, 'integrity_reviews', id, created_at from integrity_reviews where status in ('open', 'reviewing')
on conflict do nothing;
insert into review_items (kind, subject_id, source_table, source_id, created_at)
select case when reason = 'user_is_married' then 'married_report' else 'report' end, reported_id, 'reports', id, created_at
  from reports where status in ('open', 'reviewing')
on conflict do nothing;
insert into review_items (kind, subject_id, source_table, source_id, created_at)
select 'attendance', contested_by, 'attendance_reviews', commitment_id, opened_at from attendance_reviews where resolved_at is null
on conflict do nothing;
insert into review_items (kind, subject_id, source_table, source_id, created_at)
select case when product = 'smartselfie' then 'selfie_review' else 'id_review' end, profile_id, 'verification_sessions', id, created_at
  from verification_sessions where status = 'attention' and created_at > now() - interval '30 days'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Restriction, enforced where contact starts
-- ---------------------------------------------------------------------------

create or replace function public.is_restricted(p_profile uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from account_restrictions where profile_id = p_profile and lifted_at is null);
$$;
revoke all on function public.is_restricted(uuid) from public, anon;
grant execute on function public.is_restricted(uuid) to authenticated;

create or replace function public.block_restricted_contact()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_who uuid;
begin
  -- One statement per table: a field named in a CASE is checked against
  -- every table's row, so they can't share one expression.
  if tg_table_name in ('messages', 'replies') then
    v_who := new.sender_id;
  elsif tg_table_name = 'gist_sessions' then
    v_who := new.proposer_id;
  end if;
  if tg_table_name = 'date_commitments' then
    if is_restricted(new.member_a) or (new.b_staked_at is not null and is_restricted(new.member_b)) then
      raise exception 'Your account is restricted while we review it, so you can''t arrange dates right now.' using errcode = '42501';
    end if;
    return new;
  end if;
  if v_who is not null and is_restricted(v_who) then
    raise exception 'Your account is restricted while we review it, so you can''t start new conversations right now.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.block_restricted_contact() from public, anon, authenticated;

drop trigger if exists block_restricted on public.messages;
create trigger block_restricted before insert on public.messages for each row execute function public.block_restricted_contact();
drop trigger if exists block_restricted on public.replies;
create trigger block_restricted before insert on public.replies for each row execute function public.block_restricted_contact();
drop trigger if exists block_restricted on public.gist_sessions;
create trigger block_restricted before insert on public.gist_sessions for each row execute function public.block_restricted_contact();
drop trigger if exists block_restricted on public.date_commitments;
create trigger block_restricted before insert or update of b_staked_at on public.date_commitments
  for each row execute function public.block_restricted_contact();

-- The daily six, as 0012 built it, plus: a restricted member gets no new
-- six, and restricted members or members asked to re-verify are in nobody's.
create or replace function public.build_daily_feed(p_profile_id uuid)
returns setof public.daily_feed
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := current_date;
  v_tier tier;
  v_pool match_pool;
  v_country text;
  v_city_open boolean;
begin
  if exists (select 1 from daily_feed where profile_id = p_profile_id and feed_date = v_today) then
    return query select * from daily_feed where profile_id = p_profile_id and feed_date = v_today order by position;
    return;
  end if;

  if is_restricted(p_profile_id) then
    return;
  end if;

  select pool, country_code into v_pool, v_country from profiles where id = p_profile_id;
  v_tier := current_tier(p_profile_id);
  v_city_open := diaspora_pool_open(p_profile_id);

  -- The paid Diaspora tiers unlock diaspora-to-diaspora (0012). Everyone else
  -- matches back home, whatever their stored preference says — and the feed
  -- and the pool choice say so (pool_restriction).
  if v_tier not in ('diaspora', 'diaspora_plus') then
    v_pool := 'back_home';
    v_city_open := false;
  end if;

  insert into daily_feed (profile_id, feed_date, position, candidate_id)
  select p_profile_id, v_today, row_number() over (), c.id
  from (
    select p.id,
           (
             case when v_tier in ('premium', 'premium_plus', 'diaspora', 'diaspora_plus')
                  then 1.0 else 0.0 end
             + case when p.intent is not distinct from (select intent from profiles where id = p_profile_id)
                    then 0.5 else 0.0 end
             + case when p.city is not distinct from (select city from profiles where id = p_profile_id)
                    then 0.4 else 0.0 end
             + (select count(*) * 0.1 from prompt_answers pa where pa.profile_id = p.id)
             + random() * 0.3
           ) as score
    from profiles p
    where p.id <> p_profile_id
      and p.stage in ('verified_real', 'id_confirmed')
      and p.paused = false
      and not exists (select 1 from account_restrictions r where r.profile_id = p.id and r.lifted_at is null)
      and not exists (select 1 from reverification_requests v where v.profile_id = p.id)
      and (
        (
          (v_pool in ('back_home', 'both') or not v_city_open)
          and p.country_code = 'NG'
        )
        or (
          v_pool in ('diaspora', 'both')
          and v_city_open
          and exists (
            select 1 from diaspora_cities dc
            where dc.slug = p.diaspora_city and dc.active
          )
        )
      )
      and not exists (select 1 from seen_candidates s where s.profile_id = p_profile_id and s.candidate_id = p.id)
      and not exists (select 1 from blocks b where (b.blocker_id = p_profile_id and b.blocked_id = p.id)
                                                or (b.blocker_id = p.id and b.blocked_id = p_profile_id))
      --
      -- NOTHING BELOW THIS LINE. Do not add religion, tribe, language,
      -- relationship history, has_children, profession or education to this
      -- WHERE clause. They are display-only and must never silently exclude
      -- anyone from anyone's feed (CLAUDE.md). Opt-in filters belong on the
      -- member's own search, applied to their own results, not here.
      --
    order by score desc
    limit daily_match_count()
  ) c;

  insert into seen_candidates (profile_id, candidate_id)
  select p_profile_id, candidate_id from daily_feed
  where profile_id = p_profile_id and feed_date = v_today
  on conflict do nothing;

  return query select * from daily_feed where profile_id = p_profile_id and feed_date = v_today order by position;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff functions
-- ---------------------------------------------------------------------------

create or replace function public.staff_queue(p_kind text default null, p_status text default 'open')
returns table (id uuid, kind text, subject_id uuid, subject_name text, created_at timestamptz, decision text, member_open integer)
language plpgsql stable security definer set search_path = public as $$
begin
  perform _require_staff();
  return query
  select i.id, i.kind, i.subject_id, coalesce(p.display_name, 'Member'), i.created_at, i.decision,
         (select count(*)::int from review_items o where o.subject_id = i.subject_id and o.status = 'open')
    from review_items i
    left join profiles p on p.id = i.subject_id
   where i.status = p_status and (p_kind is null or i.kind = p_kind)
   order by i.created_at asc
   limit 200;
end;
$$;

-- One item with the evidence the rules allow. Never message bodies, Gist
-- content, selfies or ID numbers.
create or replace function public.staff_item(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  i review_items;
  p profiles;
  v_evidence jsonb := '{}'::jsonb;
  v_actions jsonb;
  ir integrity_reviews;
  r reports;
  d date_commitments;
  ar attendance_reviews;
  vs verification_sessions;
begin
  perform _require_staff();
  select * into i from review_items where id = p_id;
  if not found then raise exception 'No such item.' using errcode = 'P0002'; end if;
  select * into p from profiles where id = i.subject_id;

  if i.kind = 'pricing' then
    select * into ir from integrity_reviews where id = i.source_id;
    v_evidence := jsonb_build_object(
      'signal', ir.signal, 'detail', ir.detail, 'raised_at', ir.created_at,
      'profile_country', p.country_code,
      'payments_90_days', (select coalesce(jsonb_agg(jsonb_build_object(
          'currency', x.currency, 'kind', x.kind, 'status', x.status, 'card_country', x.card_country,
          'request_country', x.ip_country, 'at', x.created_at) order by x.created_at desc), '[]'::jsonb)
        from payments x where x.profile_id = i.subject_id and x.created_at > now() - interval '90 days'));
  elsif i.kind in ('report', 'married_report', 'blind_report') then
    select * into r from reports where id = i.source_id;
    v_evidence := jsonb_build_object(
      'reason', r.reason, 'reporter_note', r.detail, 'reported_at', r.created_at, 'blind', r.blind,
      'reporter', (select jsonb_build_object('name', q.display_name, 'stage', q.stage) from profiles q where q.id = r.reporter_id),
      'had_gist_together', exists (select 1 from gist_sessions g where (g.proposer_id = r.reporter_id and g.invitee_id = r.reported_id)
                                                           or (g.proposer_id = r.reported_id and g.invitee_id = r.reporter_id)),
      'had_thread_together', exists (select 1 from threads t where (t.member_a = r.reporter_id and t.member_b = r.reported_id)
                                                         or (t.member_a = r.reported_id and t.member_b = r.reporter_id)),
      'reports_against_member', (select coalesce(jsonb_object_agg(reason, n), '{}'::jsonb)
        from (select reason, count(*) n from reports where reported_id = i.subject_id group by reason) s),
      'distinct_reporters', (select count(distinct reporter_id) from reports where reported_id = i.subject_id));
  elsif i.kind = 'attendance' then
    select * into ar from attendance_reviews where commitment_id = i.source_id;
    select * into d from date_commitments where id = i.source_id;
    v_evidence := jsonb_build_object(
      'venue', d.venue_name, 'agreed_time', d.scheduled_for, 'stake_coins', d.stake_coins,
      'proposer', (select display_name from profiles where id = d.member_a),
      'other', (select display_name from profiles where id = d.member_b),
      'proposer_checked_in_at', d.a_checked_in_at, 'other_checked_in_at', d.b_checked_in_at,
      'contested_by', (select display_name from profiles where id = ar.contested_by),
      'contested_at', d.contested_at, 'status', d.status);
  elsif i.kind in ('selfie_review', 'id_review') then
    select * into vs from verification_sessions where id = i.source_id;
    v_evidence := jsonb_build_object(
      'product', vs.product, 'environment', vs.environment, 'result_code', vs.result_code, 'at', vs.created_at,
      'attempts', (select coalesce(jsonb_agg(jsonb_build_object('status', s.status, 'code', s.result_code, 'at', s.created_at)
                    order by s.created_at desc), '[]'::jsonb)
                   from verification_sessions s where s.profile_id = i.subject_id and s.product = vs.product));
  end if;

  v_actions := case
    when i.status <> 'open' then '[]'::jsonb
    when i.kind = 'attendance' then '["attended", "no_show"]'::jsonb
    when i.kind = 'pricing' then '["clear", "ask_switch_plan", "request_reverification", "restrict", "remove"]'::jsonb
    else '["clear", "request_reverification", "restrict", "remove"]'::jsonb end;
  if is_restricted(i.subject_id) then
    v_actions := (v_actions - 'restrict') || '["lift_restriction"]'::jsonb;
  end if;

  return jsonb_build_object(
    'id', i.id, 'kind', i.kind, 'status', i.status, 'decision', i.decision, 'created_at', i.created_at,
    'decided_at', i.decided_at, 'reason_category', _reason_category(i.kind),
    'subject', jsonb_build_object(
      'id', i.subject_id, 'name', p.display_name, 'country', p.country_code, 'stage', p.stage,
      'tier', current_tier(i.subject_id), 'joined', p.created_at,
      'restricted', is_restricted(i.subject_id),
      'reverification_requested', exists (select 1 from reverification_requests where profile_id = i.subject_id),
      'open_items', (select count(*) from review_items where subject_id = i.subject_id and status = 'open')),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('action', a.action, 'kind', a.item_kind, 'at', a.created_at)
                 order by a.created_at desc), '[]'::jsonb)
                from staff_audit_log a where a.subject_id = i.subject_id),
    'evidence', v_evidence,
    'actions', v_actions);
end;
$$;

-- Keep the source record in step with the decision.
create or replace function public._close_source(i review_items, p_cleared boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if i.source_table = 'integrity_reviews' then
    update integrity_reviews set status = case when p_cleared then 'cleared' else 'actioned' end where id = i.source_id;
  elsif i.source_table = 'reports' then
    update reports set status = case when p_cleared then 'dismissed'::report_status else 'actioned'::report_status end where id = i.source_id;
  end if;
end;
$$;
revoke all on function public._close_source(review_items, boolean) from public, anon, authenticated;

-- Remove: keep what retention requires (as account deletion does), block the
-- phone and ID from verifying again, then delete the profile. The sign-in is
-- banned by the server before this runs; the auth user is deleted when the
-- retention period ends (purge_expired_retention).
create or replace function public._remove_account(p_profile uuid, p_category text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_hash text;
begin
  update reports set status = 'actioned' where reported_id = p_profile and status in ('open', 'reviewing');
  insert into retained_safety_records (former_profile_id, reason, status, reported_at, retain_until)
  select p_profile, r.reason, r.status, r.created_at, now() + interval '2 years' from reports r where r.reported_id = p_profile;

  select phone_hash into v_hash from phone_identities where profile_id = p_profile;
  if v_hash is not null then
    insert into blocked_phone_hashes (phone_hash, former_profile_id, retain_until)
    values (v_hash, p_profile, now() + interval '2 years')
    on conflict (phone_hash) do update set retain_until = excluded.retain_until;
  end if;
  select id_hash into v_hash from verified_id_hashes where profile_id = p_profile;
  if v_hash is not null then
    insert into blocked_id_hashes (id_hash, former_profile_id, retain_until)
    values (v_hash, p_profile, now() + interval '2 years')
    on conflict (id_hash) do update set retain_until = excluded.retain_until;
  end if;

  insert into retained_payments (former_profile_id, provider, provider_ref, amount_minor, currency, status, purpose, paid_at, retain_until)
  select p_profile, x.provider, x.provider_ref, x.amount_minor, x.currency, x.status, x.purpose, x.created_at, now() + interval '6 years'
    from payments x where x.profile_id = p_profile
  on conflict (provider, provider_ref) do nothing;

  insert into account_removals (former_profile_id, reason_category, removed_by, retain_until)
  values (p_profile, p_category, auth.uid(), now() + interval '2 years')
  on conflict (former_profile_id) do nothing;

  delete from profiles where id = p_profile;
end;
$$;
revoke all on function public._remove_account(uuid, text) from public, anon, authenticated;

-- Decide an item. Returns what the server should tell the member.
create or replace function public.staff_decide(p_id uuid, p_action text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  i review_items;
  v_cat text;
  v_allowed jsonb;
begin
  perform _require_staff();
  select * into i from review_items where id = p_id for update;
  if not found then raise exception 'No such item.' using errcode = 'P0002'; end if;
  v_allowed := staff_item(p_id) -> 'actions';
  if not (v_allowed ? p_action) then
    raise exception 'That action isn''t available for this item.' using errcode = '22023';
  end if;
  v_cat := _reason_category(i.kind);

  -- Written first, so even a removal leaves its record.
  insert into staff_audit_log (staff_id, review_item_id, item_kind, subject_id, action, reason_category, note)
  values (auth.uid(), i.id, i.kind, i.subject_id, p_action, v_cat, left(p_note, 1000));

  if p_action = 'lift_restriction' then
    update account_restrictions set lifted_at = now(), lifted_by = auth.uid()
     where profile_id = i.subject_id and lifted_at is null;
    return jsonb_build_object('action', p_action, 'subject_id', i.subject_id, 'reason_category', v_cat);
  end if;

  if p_action = 'clear' then
    perform _close_source(i, true);
  elsif p_action = 'ask_switch_plan' then
    insert into member_notices (profile_id, kind, reason_category) values (i.subject_id, 'switch_plan', v_cat);
    perform _close_source(i, false);
  elsif p_action = 'request_reverification' then
    insert into reverification_requests (profile_id, reason_category, requested_by)
    values (i.subject_id, v_cat, auth.uid())
    on conflict (profile_id) do update set reason_category = excluded.reason_category, requested_at = now(), requested_by = excluded.requested_by;
    perform _close_source(i, false);
  elsif p_action = 'restrict' then
    insert into account_restrictions (profile_id, reason_category, review_item_id, created_by)
    values (i.subject_id, v_cat, i.id, auth.uid());
    perform _close_source(i, false);
  elsif p_action in ('attended', 'no_show') then
    perform resolve_attendance_review(i.source_id, p_action = 'attended');
  elsif p_action = 'remove' then
    perform _close_source(i, false);
    perform _remove_account(i.subject_id, v_cat);
    return jsonb_build_object('action', p_action, 'subject_id', i.subject_id, 'reason_category', v_cat);
  end if;

  update review_items set status = 'closed', decision = p_action, decided_by = auth.uid(), decided_at = now()
   where id = i.id;
  return jsonb_build_object('action', p_action, 'subject_id', i.subject_id, 'reason_category', v_cat);
end;
$$;

revoke all on function public.staff_queue(text, text) from public, anon;
revoke all on function public.staff_item(uuid) from public, anon;
revoke all on function public.staff_decide(uuid, text, text) from public, anon;
grant execute on function public.staff_queue(text, text) to authenticated;
grant execute on function public.staff_item(uuid) to authenticated;
grant execute on function public.staff_decide(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Retention: a removed account's sign-in goes when its period ends
-- ---------------------------------------------------------------------------

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
  delete from support_conversations
   where last_active_at < now() - make_interval(days => v_days);
  update support_tickets set summary = null
   where summary is not null
     and created_at < now() - make_interval(days => v_days);
  delete from agent_requests where created_at < now() - interval '7 days';

  -- Removed accounts: the banned sign-in is deleted once retention ends.
  delete from auth.users where id in (select former_profile_id from account_removals where retain_until < now());
  delete from account_removals where retain_until < now();

  perform gist_expire_invites();
end;
$$;
revoke all on function public.purge_expired_retention() from public, anon, authenticated;

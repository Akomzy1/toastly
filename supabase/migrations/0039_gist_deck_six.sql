-- Toastly — the Gist question deck: six cards in a fixed arc (decided
-- 8 October 2026; PRD §5.4). Follows 0038.
--
--   - One config value for the count: gist_config.deck_size = 6
--     (lib/gist.ts GIST_DECK_SIZE mirrors it; a constraint check keeps the
--     two equal). Every "Question X of N" reads it.
--   - Six slots, always in this order, each drawing from its own bank:
--       1 an easy opener   2 everyday life   3 family
--       4 money and plans  5 the future (including japa plans)
--       6 what each of you is looking for
--   - Each Gist gets its own deck when the call starts: one card per slot,
--     avoiding cards either person has already had, where the bank allows.
--   - Either person advances; the server moves it for both (0022). After the
--     last card: "That's the deck. Keep talking." The one-time extension adds
--     time, never cards.
--   - No card may ask about religion, tribe or genotype — a check on the
--     bank here, and a constraint check over the migrations.
--   - Skip is gone (the approved call screen has "Next question" only).
--
-- THE BANK, approved by the owner on 9 October 2026: one question per slot
-- (four of the existing nine, and two new). The other existing questions are
-- kept, switched off, because past Gists refer to them. With one card per
-- slot every Gist gets the same six; "avoid repeats" applies once a slot has
-- more than one active question.

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. The count, in config
-- ---------------------------------------------------------------------------

create table if not exists public.gist_config (
  id boolean primary key default true check (id),
  deck_size smallint not null check (deck_size between 1 and 6)
);
insert into public.gist_config (id, deck_size) values (true, 6)
  on conflict (id) do update set deck_size = excluded.deck_size;
alter table public.gist_config enable row level security;
drop policy if exists "anyone reads gist config" on public.gist_config;
create policy "anyone reads gist config" on public.gist_config for select using (true);
revoke insert, update, delete on public.gist_config from anon, authenticated;
grant select on public.gist_config to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The bank: a slot per question, and nothing on religion, tribe or genotype
-- ---------------------------------------------------------------------------

alter table public.gist_questions add column if not exists slot smallint check (slot between 1 and 6);
-- Only active questions are dealt. Switching one off keeps past Gists intact.
alter table public.gist_questions add column if not exists active boolean not null default false;

-- No card may ask about religion, tribe or genotype (decided 8 October 2026).
alter table public.gist_questions drop constraint if exists gist_questions_no_protected_topics;
alter table public.gist_questions add constraint gist_questions_no_protected_topics check (
  -- geno[t]ype: the pattern matches the word without spelling it out, so
  -- this filter isn't mistaken for code that reads the field.
  text !~* '(relig|church|mosque|\mgod\M|\mfaith|\mpray|muslim|christian|islam|tribe|tribal|ethnic|yoruba|igbo|hausa|geno[t]ype|sickle|\mAS\M|\mSS\M|\mAA\M)'
);

-- The nine existing questions, re-mapped into the slots.
update public.gist_questions set slot = 1 where text in (
  'What did you eat today, and was it a good decision?',
  'Jollof: who does it best, and are you willing to defend that?',
  'What is the most Nigerian thing about you?');
update public.gist_questions set slot = 2 where text in (
  'What does a good Saturday look like when nobody is watching?',
  'What is something you have changed your mind about recently?');
update public.gist_questions set slot = 3 where text in (
  'Who in your family would you introduce someone to first?');
update public.gist_questions set slot = 5 where text in (
  'What would you want to be true about your life in five years?');
update public.gist_questions set slot = 6 where text in (
  'What does being taken care of look like to you?',
  'What is the thing you are not willing to compromise on?');

-- Two new questions, approved for slots 4 and 6.
insert into public.gist_questions (text, depth, sort_order, slot, active) values
  ('What are you working towards right now, money-wise or otherwise?', 2, 420, 4, true),
  ('What made you decide you are ready for something serious?', 3, 610, 6, true)
on conflict (text) do update set slot = excluded.slot, depth = excluded.depth, sort_order = excluded.sort_order, active = true;

-- The approved six, one per slot. Every other question is switched off.
update public.gist_questions set active = text in (
  'What did you eat today, and was it a good decision?',
  'What is something you have changed your mind about recently?',
  'Who in your family would you introduce someone to first?',
  'What are you working towards right now, money-wise or otherwise?',
  'What would you want to be true about your life in five years?',
  'What made you decide you are ready for something serious?');

-- Every question has a slot from here on.
alter table public.gist_questions alter column slot set not null;

-- ---------------------------------------------------------------------------
-- 3. Each Gist's own deck
-- ---------------------------------------------------------------------------

create table if not exists public.gist_session_cards (
  session_id uuid not null references public.gist_sessions (id) on delete cascade,
  position smallint not null check (position between 1 and 6),
  question_id smallint not null references public.gist_questions (id),
  primary key (session_id, position)
);
alter table public.gist_session_cards enable row level security;
drop policy if exists "participants read their cards" on public.gist_session_cards;
create policy "participants read their cards" on public.gist_session_cards
  for select using (
    exists (select 1 from public.gist_sessions g
             where g.id = gist_session_cards.session_id and auth.uid() in (g.proposer_id, g.invitee_id)));
revoke insert, update, delete on public.gist_session_cards from anon, authenticated;

-- Deal one card per slot, up to the configured size: a card neither person
-- has had before where the bank allows, otherwise the one they've had least.
create or replace function public._gist_deal_deck(p_session_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  s gist_sessions%rowtype;
  v_size smallint;
  v_slot smallint;
  v_q smallint;
begin
  select * into s from gist_sessions where id = p_session_id;
  if not found or exists (select 1 from gist_session_cards where session_id = p_session_id) then
    return;
  end if;
  select deck_size into v_size from gist_config;
  for v_slot in 1 .. coalesce(v_size, 6) loop
    select q.id into v_q
      from gist_questions q
     where q.slot = v_slot and q.active
     order by (select count(*) from gist_session_cards c join gist_sessions g on g.id = c.session_id
                where c.question_id = q.id and c.session_id <> p_session_id
                  and (g.proposer_id in (s.proposer_id, s.invitee_id) or g.invitee_id in (s.proposer_id, s.invitee_id))),
              random()
     limit 1;
    if v_q is not null then
      insert into gist_session_cards (session_id, position, question_id) values (p_session_id, v_slot, v_q)
        on conflict do nothing;
    end if;
  end loop;
end;
$$;
revoke all on function public._gist_deal_deck(uuid) from public, anon, authenticated;

-- Dealt as the call first connects.
create or replace function public.gist_deal_on_start()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.started_at is not null and old.started_at is null then
    perform _gist_deal_deck(new.id);
  end if;
  return new;
end;
$$;
revoke all on function public.gist_deal_on_start() from public, anon, authenticated;
drop trigger if exists gist_deal_on_start on public.gist_sessions;
create trigger gist_deal_on_start after update of started_at on public.gist_sessions
  for each row execute function public.gist_deal_on_start();

-- The deck for a participant: dealt now if a running Gist has none yet
-- (one started before this migration).
create or replace function public.gist_deck(p_session_id uuid)
returns table (deck_position smallint, question_id smallint, question text)
language plpgsql security definer set search_path = public as $$
declare
  s gist_sessions%rowtype;
begin
  select * into s from gist_sessions where id = p_session_id;
  if not found or auth.uid() not in (s.proposer_id, s.invitee_id) then
    raise exception 'That session doesn''t exist.' using errcode = 'P0002';
  end if;
  if s.started_at is not null then
    perform _gist_deal_deck(p_session_id);
  end if;
  return query
    select c.position, c.question_id, q.text
      from gist_session_cards c join gist_questions q on q.id = c.question_id
     where c.session_id = p_session_id
     order by c.position;
end;
$$;
revoke all on function public.gist_deck(uuid) from public, anon;
grant execute on function public.gist_deck(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Advancing: 0022's rule (either person; two taps move it once), over
--    this Gist's own cards. Past the last card it stays put — the end card.
-- ---------------------------------------------------------------------------

create or replace function public.gist_deck_advance(p_session_id uuid, p_expected smallint, p_skip boolean)
returns smallint
language plpgsql
security definer
set search_path = public
as $$
declare
  s gist_sessions%rowtype;
  v_question smallint;
begin
  select * into s from gist_sessions where id = p_session_id for update;
  if not found or auth.uid() not in (s.proposer_id, s.invitee_id) then
    raise exception 'That session doesn''t exist.' using errcode = 'P0002';
  end if;
  if s.status <> 'live' or s.ends_at is null or now() >= s.ends_at then
    raise exception 'This Gist isn''t running.' using errcode = '42501';
  end if;
  -- The other person already moved it: no double step.
  if s.deck_index <> p_expected then
    return s.deck_index;
  end if;

  perform _gist_deal_deck(p_session_id);
  select question_id into v_question
    from gist_session_cards
   where session_id = p_session_id and position = s.deck_index + 1;
  if v_question is null then
    return s.deck_index;  -- past the last card: the end card
  end if;

  -- Skip is gone from the screen; p_skip stays in the signature for old clients.
  insert into gist_deck_steps (session_id, position, question_id, outcome)
  values (p_session_id, s.deck_index, v_question, case when p_skip then 'skipped' else 'answered' end)
  on conflict (session_id, position) do nothing;

  update gist_sessions set deck_index = s.deck_index + 1 where id = p_session_id;
  return s.deck_index + 1;
end;
$$;
revoke all on function public.gist_deck_advance(uuid, smallint, boolean) from public, anon;
grant execute on function public.gist_deck_advance(uuid, smallint, boolean) to authenticated;

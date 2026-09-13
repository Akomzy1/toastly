-- Toastly — prompts, the daily feed, and replies.
--
-- The two rules that shape this whole file:
--
--   1. The feed is SIX people a day on every tier. Scarcity is a brand
--      principle (PRD §5.2), not a monetisable limit. A paid tier may change the
--      ORDER of the six; nothing may change the COUNT.
--   2. Optional profile fields never exclude anyone. Religion, tribe,
--      language, relationship history, profession and education must not
--      appear in any WHERE clause that builds someone else's feed.

-- ---------------------------------------------------------------------------
-- Prompts
-- ---------------------------------------------------------------------------

create table public.prompts (
  id smallint primary key generated always as identity,
  text text not null unique,
  -- Grouping only, for the picker. Never a matching filter.
  category text not null default 'general',
  active boolean not null default true,
  sort_order smallint not null default 0
);

-- Written for Nigerian dating, not translated from elsewhere (Features page).
insert into public.prompts (text, category, sort_order) values
  ('Sunday looks like', 'life', 10),
  ('I''m looking for', 'intent', 20),
  ('My love language', 'life', 30),
  ('A thing my family does that I''ll carry into my own home', 'family', 40),
  ('Lagos or somewhere quieter — where I see myself in five years', 'life', 50),
  ('What being taken care of looks like to me', 'values', 60),
  ('The way to my heart', 'life', 70),
  ('How I handle money, honestly', 'values', 80),
  ('What my closest friend would warn you about', 'humour', 90),
  ('Something I''m not willing to compromise on', 'values', 100);

create table public.prompt_answers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  prompt_id smallint not null references public.prompts (id),
  answer text not null check (char_length(answer) between 1 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, prompt_id)
);

create index prompt_answers_profile_idx on public.prompt_answers (profile_id);

-- ---------------------------------------------------------------------------
-- The daily feed
-- ---------------------------------------------------------------------------
--
-- Materialised once per member per day. Two reasons it is a table rather than
-- a live query: the six must be stable for the whole day (re-rolling on
-- refresh would be an infinite deck by another name), and unused matches must
-- expire rather than accumulate into a backlog.

create table public.daily_feed (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  feed_date date not null,
  position smallint not null check (position between 1 and 6),
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, feed_date, position),
  unique (profile_id, feed_date, candidate_id),
  check (profile_id <> candidate_id)
);

create index daily_feed_lookup_idx on public.daily_feed (profile_id, feed_date);

-- Who a member has already been shown, so the same face does not reappear.
create table public.seen_candidates (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  first_seen_on date not null default current_date,
  primary key (profile_id, candidate_id)
);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- ---------------------------------------------------------------------------
-- Replies
-- ---------------------------------------------------------------------------
--
-- A member opens a conversation by replying to a SPECIFIC prompt answer.
-- There is no generic like, no "hi", no super-like — nothing that can be sent
-- without having read something. `prompt_answer_id` is not nullable precisely
-- so a contentless opener is impossible to represent.

create type reply_kind as enum (
  'text',        -- Premium and above
  'gist_invite'  -- Starter's only outbound move
);

create table public.replies (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  prompt_answer_id uuid not null references public.prompt_answers (id) on delete cascade,
  kind reply_kind not null,
  body text check (char_length(body) <= 1000),
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id),
  -- A gist invite carries no free text: that is the whole point of it being
  -- Starter's outbound channel.
  check ((kind = 'text' and body is not null) or (kind = 'gist_invite' and body is null))
);

create index replies_recipient_idx on public.replies (recipient_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Feed generation
-- ---------------------------------------------------------------------------

-- SIX. Deliberately a hard-coded constant inside the function and NOT a
-- parameter, a setting, or a lookup against entitlements. If this ever
-- becomes tier-dependent, the brand principle is gone.
create or replace function public.daily_match_count()
returns smallint
language sql
immutable
as $$ select 6::smallint $$;

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
begin
  -- Already built for today? The six are fixed for the day.
  if exists (select 1 from daily_feed where profile_id = p_profile_id and feed_date = v_today) then
    return query select * from daily_feed where profile_id = p_profile_id and feed_date = v_today order by position;
    return;
  end if;

  select pool, country_code into v_pool, v_country from profiles where id = p_profile_id;
  v_tier := current_tier(p_profile_id);

  insert into daily_feed (profile_id, feed_date, position, candidate_id)
  select p_profile_id, v_today, row_number() over (), c.id
  from (
    select p.id,
           -- Ordering only. A paid tier changes how well the six are matched
           -- to you; it never changes how many there are, and it never
           -- inserts anyone into another member's six.
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
      -- Verified only, and not paused. The trust layer, again.
      and p.stage in ('verified_real', 'id_confirmed')
      and p.paused = false
      -- Pool choice is the member's own setting about themselves.
      and (
        v_pool = 'both'
        or (v_pool = 'back_home' and p.country_code = 'NG')
        or (v_pool = 'diaspora' and p.country_code = v_country)
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
-- RLS
-- ---------------------------------------------------------------------------

alter table public.prompts enable row level security;
alter table public.prompt_answers enable row level security;
alter table public.daily_feed enable row level security;
alter table public.seen_candidates enable row level security;
alter table public.blocks enable row level security;
alter table public.replies enable row level security;

create policy "prompts are public" on public.prompts for select using (true);

create policy "own answers writable" on public.prompt_answers for all
  using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

-- Answers of others are readable only if that profile is in your feed today.
-- Prompt answers sit above the photos on the card, so they must be readable
-- for exactly the people you were shown, and nobody else.
create policy "answers of today's candidates readable" on public.prompt_answers for select
  using (
    exists (
      select 1 from public.daily_feed f
      where f.profile_id = auth.uid()
        and f.feed_date = current_date
        and f.candidate_id = prompt_answers.profile_id
    )
  );

create policy "own feed readable" on public.daily_feed for select
  using (auth.uid() = profile_id);

create policy "own blocks" on public.blocks for all
  using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);

create policy "own sent replies" on public.replies for select
  using (auth.uid() = sender_id);

-- A recipient's own read access is deliberately NOT granted here. Starter
-- members may receive but must see only a bare count until they upgrade, so
-- inbox reads go through a server-side path that enforces the entitlement
-- (Prompt 6). A blanket recipient select policy would leak message bodies.

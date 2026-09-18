-- Toastly — Prompt 11: date-spot suggestion and time-zone-aware scheduling.
--
-- Both were promised and neither existed. The second is already in public
-- copy on the Diaspora page ("Gist sessions are offered at times that are
-- reasonable at both ends — not 3am in Lagos because it suited Houston"),
-- which made it a claim the build did not honour.
--
-- Nothing here books, reminds, or messages anyone. The suggestion is a
-- suggestion: two people accept it, swap it, or ignore it (CLAUDE.md —
-- agents in the infrastructure, never in the intimacy).

-- ---------------------------------------------------------------------------
-- Time zones
-- ---------------------------------------------------------------------------
--
-- IANA name, resolved from the device and confirmable in settings. Null is
-- fine and never blocks anything: an unset zone means the scheduler shows one
-- clock instead of two, not that scheduling stops.

alter table public.profiles
  add column if not exists time_zone text;

comment on column public.profiles.time_zone is
  'IANA time zone, e.g. Africa/Lagos. Display and scheduling only — never a matching input.';

-- ---------------------------------------------------------------------------
-- Date spots
-- ---------------------------------------------------------------------------
--
-- The category list is an allowlist with no bar, lounge or club in it. PRD
-- §5.5 calls the public-venue nudge a soft safety signal, so "never suggest
-- drinking venues by default" is enforced by the type system rather than by
-- whichever query string the provider client happens to send.

create type date_spot_category as enum (
  'cafe',
  'restaurant',
  'bakery',
  'park',
  'museum',
  'gallery'
);

create type date_spot_status as enum (
  'suggested',
  'accepted',
  'swapped',   -- the pair asked for a different one
  'ignored'
);

-- Which side of a cross-border pair the search was centred on. Recorded so
-- the UI can say why, rather than a Houston member wondering why every
-- suggestion is in Lagos.
create type date_spot_anchor as enum (
  'midpoint',      -- both members in the same city
  'nigeria_side'   -- back-home pair: centred on the Nigeria-based member
);

create table public.date_spots (
  id uuid primary key default gen_random_uuid(),
  -- Suggestions follow a Gist that ended in a mutual "continue".
  session_id uuid not null references public.gist_sessions (id) on delete cascade,
  provider text not null default 'google_places',
  place_id text not null,
  name text not null,
  address text not null,
  category date_spot_category not null,
  lat double precision,
  lng double precision,
  anchor date_spot_anchor not null default 'midpoint',
  status date_spot_status not null default 'suggested',
  created_at timestamptz not null default now(),
  -- A venue is suggested once per session.
  unique (session_id, place_id)
);

create index date_spots_session_idx on public.date_spots (session_id, created_at desc);

-- The accepted spot carries into the stake: accept a spot -> propose a time
-- -> both stake (PRD §5.5). Kept as columns rather than a join so a venue
-- that later disappears from the provider does not erase what was agreed.
alter table public.date_commitments
  add column if not exists date_spot_id uuid references public.date_spots (id),
  add column if not exists venue_name text,
  add column if not exists venue_address text;

-- ---------------------------------------------------------------------------
-- Suggestions exist only after a mutual continue
-- ---------------------------------------------------------------------------
--
-- Enforced in the database, not in the action that writes it. A suggestion
-- appearing before both people privately said yes would leak the other
-- person's answer, which 0003 goes to some trouble to keep private.

create or replace function public.enforce_mutual_continue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not gist_mutual_continue(new.session_id) then
    raise exception 'A date spot needs both people to have said continue.';
  end if;
  return new;
end;
$$;

create trigger date_spots_require_mutual_continue
  before insert on public.date_spots
  for each row execute function public.enforce_mutual_continue();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
--
-- Readable and writable by the two people in that session, nobody else.

create or replace function public.in_gist_session(p_session_id uuid, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from gist_sessions g
    where g.id = p_session_id
      and (g.proposer_id = p_profile_id or g.invitee_id = p_profile_id)
  );
$$;

alter table public.date_spots enable row level security;

create policy "own session spots readable" on public.date_spots
  for select using (in_gist_session(session_id, auth.uid()));

create policy "own session spots writable" on public.date_spots
  for insert with check (in_gist_session(session_id, auth.uid()));

-- Either person may accept, swap or ignore a suggestion.
create policy "own session spots updatable" on public.date_spots
  for update using (in_gist_session(session_id, auth.uid()))
  with check (in_gist_session(session_id, auth.uid()));

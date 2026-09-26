-- Toastly — genotype: optional, consented, encrypted, private by default.
--
-- PRD §5.2 and CLAUDE.md. Genotype is HEALTH DATA — sensitive personal data
-- under Nigeria's NDPA 2023 and special-category data under UK GDPR for
-- diaspora members — and the strictest-handled field in the product.
--
-- DO NOT RUN AGAINST PRODUCTION until Supabase Vault is confirmed working.
-- The guard below refuses to run without Vault, and without 0013.
--
-- It does NOT live on `profiles`. That table's rows are readable by other
-- members, which is fine for display-only fields and fatal for this one.
-- Genotype gets its own tables with RLS on and NO policies at all: no client
-- can select, insert, update or delete a row directly. Every access goes
-- through a security-definer function below that checks permission first.
--
-- What this file deliberately does NOT contain, and nothing may add:
--   - a compatibility verdict, score or "risk" of any kind;
--   - a verified flag, badge or "confirmed" state — it is self-reported;
--   - a filter of any kind (PRD §5.2: mutual reveal is the mechanism);
--   - any trigger on these tables (event streams must never see them);
--   - any read from matching, ranking, the feed build, the Trust Sentinel,
--     the AriyaPlanner brief, analytics or a model.
-- scripts/check-constraints.mjs fails the build if genotype storage is
-- referenced anywhere outside this file, lib/genotype*.ts and
-- components/genotype/.

-- ---------------------------------------------------------------------------
-- Preconditions — checked before anything is created
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regprocedure('public.are_matched(uuid, uuid)') is null then
    raise exception 'Run 0013_relationship_history.sql first: this migration uses are_matched().';
  end if;
  if to_regclass('vault.secrets') is null then
    raise exception 'Supabase Vault is not available. Genotype storage will not fall back to a plaintext key.';
  end if;
end $$;

set search_path = public, extensions;

create type genotype_visibility as enum (
  'private',      -- the default: only the member themself
  'all_matches',  -- members they are matched with (are_matched, 0013)
  'after_gist',   -- only after a completed Gist both want to continue
  'couple_only'   -- only their partner in an active Couple Mode
);

-- ---------------------------------------------------------------------------
-- The encryption key lives in Supabase Vault, never in this repository
-- ---------------------------------------------------------------------------
--
-- Generated here, once, from random bytes. Vault stores secrets encrypted
-- with a root key Supabase keeps outside the database, so a dump or backup of
-- the database carries genotype ciphertext but not a usable key.
--
-- Rotating this secret without first re-encrypting every row destroys every
-- stored genotype. Do not rotate it casually.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'genotype_key') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'genotype_key',
      'Encrypts member genotypes (0014). Rotating it without re-encrypting destroys every stored value.'
    );
  end if;
end $$;

create or replace function public.genotype_key()
returns text
language plpgsql
stable
security definer
set search_path = public, vault
as $$
declare
  k text;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'genotype_key';
  if k is null then
    raise exception 'Genotype storage is not configured.';
  end if;
  return k;
end;
$$;

-- Supabase grants EXECUTE on new functions to anon and authenticated by
-- default. This one must never be callable by a client.
revoke all on function public.genotype_key() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The consent wording the database will accept
-- ---------------------------------------------------------------------------
--
-- Must equal GENOTYPE_CONSENT_VERSION in lib/genotype.ts; a constraint check
-- fails the build if they drift. Bump both when the consent copy changes.
-- A consent to an older wording no longer permits saving or changing a
-- genotype — only deleting it, which is always allowed.

create or replace function public.genotype_consent_version()
returns text
language sql
immutable
as $$
  select '2026-09-26'::text
$$;

-- ---------------------------------------------------------------------------
-- Consent, then the value
-- ---------------------------------------------------------------------------
--
-- Consent is its own row, taken at a separate step before entry and distinct
-- from signup consent. The value row references it, so a genotype cannot
-- exist without a consent, and deleting the consent deletes the value.

create table public.genotype_consents (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  consented_at timestamptz not null default now(),
  -- Which wording the member agreed to.
  consent_version text not null check (char_length(consent_version) between 1 and 32)
);

create table public.genotypes (
  profile_id uuid primary key references public.genotype_consents (profile_id) on delete cascade,
  -- pgp_sym_encrypt output. There is no plaintext column, and there must
  -- never be one.
  ciphertext bytea not null,
  visibility genotype_visibility not null default 'private',
  updated_at timestamptz not null default now()
);

alter table public.genotype_consents enable row level security;
alter table public.genotypes enable row level security;

-- Belt and braces: RLS with no policies already refuses every client row.
revoke all on public.genotype_consents from anon, authenticated;
revoke all on public.genotypes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Who may see whose genotype
-- ---------------------------------------------------------------------------
--
-- The levels nest: an active couple can see under every sharing level, a
-- completed mutual-continue Gist under 'after_gist' and 'all_matches'.
-- 'all_matches' uses are_matched() from 0013 — the same definition that
-- governs relationship history, so "match" means one thing everywhere.
--
-- 'after_gist' requires a mutual continue, matching photo reveal (0007):
-- sharing health data with someone who privately said "not this time" is
-- not what a member choosing that option would expect.

create or replace function public.can_see_genotype(p_viewer uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_viewer is null or p_owner is null then false
    when p_viewer = p_owner then true
    -- Blocked in either direction: never.
    when exists (
      select 1 from blocks b
      where (b.blocker_id = p_owner and b.blocked_id = p_viewer)
         or (b.blocker_id = p_viewer and b.blocked_id = p_owner)
    ) then false
    -- Only verified members see anyone's genotype.
    when not exists (
      select 1 from profiles v
      where v.id = p_viewer and v.stage in ('verified_real', 'id_confirmed')
    ) then false
    else coalesce((
      select case g.visibility
        when 'private' then false
        when 'couple_only' then exists (
          select 1 from couples c
          where c.status = 'active'
            and ((c.member_a = p_owner and c.member_b = p_viewer)
              or (c.member_a = p_viewer and c.member_b = p_owner))
        )
        when 'after_gist' then exists (
          select 1 from gist_sessions s
          where s.status = 'completed'
            and ((s.proposer_id = p_owner and s.invitee_id = p_viewer)
              or (s.proposer_id = p_viewer and s.invitee_id = p_owner))
            and gist_mutual_continue(s.id)
        ) or exists (
          select 1 from couples c
          where c.status = 'active'
            and ((c.member_a = p_owner and c.member_b = p_viewer)
              or (c.member_a = p_viewer and c.member_b = p_owner))
        )
        when 'all_matches' then are_matched(p_viewer, p_owner)
        else false
      end
      from genotypes g
      where g.profile_id = p_owner
    ), false)
  end;
$$;

-- Internal. A client probing this could learn whether someone has a genotype
-- at all; get_genotype_for() below is the only client-facing read of another
-- member's value.
revoke all on function public.can_see_genotype(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The client-facing functions — the whole of the display path
-- ---------------------------------------------------------------------------

-- Another member's genotype, or NULL.
--
-- RECIPROCAL: PRD §5.2 shows each person's stated genotype "where both have
-- chosen to share", so a value is returned only when each may see the
-- other's. A member who shares nothing sees nothing.
--
-- NULL is returned for "not permitted", "not entered" and "not shared back"
-- alike, so the answer never reveals which it was.
create or replace function public.get_genotype_for(p_owner uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_me uuid := auth.uid();
  v_value text;
begin
  if v_me is null or p_owner is null or p_owner = v_me then
    return null;
  end if;
  if not (can_see_genotype(v_me, p_owner) and can_see_genotype(p_owner, v_me)) then
    return null;
  end if;
  select pgp_sym_decrypt(g.ciphertext, genotype_key())
    into v_value
    from genotypes g
   where g.profile_id = p_owner;
  return v_value;
end;
$$;

-- The member's own consent, value and visibility. Empty when they have never
-- consented.
create or replace function public.get_own_genotype()
returns table (
  value text,
  visibility genotype_visibility,
  consented_at timestamptz,
  consent_version text
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  return query
    select
      case when g.ciphertext is null then null
           else pgp_sym_decrypt(g.ciphertext, genotype_key()) end,
      g.visibility,
      c.consented_at,
      c.consent_version
    from genotype_consents c
    left join genotypes g on g.profile_id = c.profile_id
    where c.profile_id = auth.uid();
end;
$$;

-- The separate, timestamped consent step. Only the CURRENT wording is
-- accepted, so a stale page cannot record consent to text it didn't show.
create or replace function public.record_genotype_consent(p_version text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;
  if p_version is distinct from genotype_consent_version() then
    raise exception 'That permission wording is out of date. Please reload and read it again.';
  end if;
  insert into genotype_consents (profile_id, consented_at, consent_version)
  values (auth.uid(), now(), p_version)
  on conflict (profile_id) do update
    set consented_at = now(), consent_version = excluded.consent_version;
end;
$$;

-- Save or change the value and who can see it. Refuses without a consent to
-- the CURRENT wording. Errors never echo the value back, so a rejected call
-- cannot put it into a log line.
create or replace function public.set_genotype(
  p_value text,
  p_visibility genotype_visibility default 'private'
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Not signed in.';
  end if;
  if not exists (
    select 1 from genotype_consents
    where profile_id = v_me and consent_version = genotype_consent_version()
  ) then
    raise exception 'Consent to the current wording is required before a genotype can be saved.';
  end if;
  if p_value is null or p_value not in ('AA', 'AS', 'AC', 'SS', 'SC', 'unknown') then
    raise exception 'That is not one of the genotype options.';
  end if;

  insert into genotypes (profile_id, ciphertext, visibility, updated_at)
  values (v_me, pgp_sym_encrypt(p_value, genotype_key()), coalesce(p_visibility, 'private'), now())
  on conflict (profile_id) do update
    set ciphertext = excluded.ciphertext,
        visibility = excluded.visibility,
        updated_at = now();
end;
$$;

-- Complete deletion: the consent row goes, and the value goes with it by
-- cascade. Nothing is kept — no tombstone, no audit row, no event. Always
-- allowed, whatever consent version the member agreed to.
create or replace function public.delete_genotype()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from genotype_consents where profile_id = auth.uid();
end;
$$;

revoke all on function public.get_genotype_for(uuid) from public, anon;
revoke all on function public.get_own_genotype() from public, anon;
revoke all on function public.record_genotype_consent(text) from public, anon;
revoke all on function public.set_genotype(text, genotype_visibility) from public, anon;
revoke all on function public.delete_genotype() from public, anon;

grant execute on function public.get_genotype_for(uuid) to authenticated;
grant execute on function public.get_own_genotype() to authenticated;
grant execute on function public.record_genotype_consent(text) to authenticated;
grant execute on function public.set_genotype(text, genotype_visibility) to authenticated;
grant execute on function public.delete_genotype() to authenticated;

-- ---------------------------------------------------------------------------
-- The Trust Sentinel must never see it
-- ---------------------------------------------------------------------------
--
-- CLAUDE.md lists genotype among the protected attributes. 0009's metadata
-- guard is re-created with 'genotype' added, so no future trust event can
-- carry it even by mistake.

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
      'relationship_history', 'profession', 'education', 'diaspora',
      'genotype'
    ])
  );
$$;

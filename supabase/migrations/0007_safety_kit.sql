-- Toastly — the safety kit: photo-reveal control and image blur.
--
-- PRD §5.1: "Women's safety kit: photo-reveal control, share-your-date/panic
-- feature, unsolicited-image blur, report/block." Verification and core
-- safety are NEVER paywalled. Nothing in this file reads a tier, an
-- entitlement or a coin balance, and nothing may be added that does.
--
-- Share-your-date and panic have no table on purpose: they are composed on
-- the member's device and handed to their own WhatsApp or share sheet, so
-- Toastly never stores a trusted contact's phone number. Report and block
-- already exist (0001, 0002).

-- ---------------------------------------------------------------------------
-- Photo reveal
-- ---------------------------------------------------------------------------

create type photo_reveal as enum (
  'verified_members',  -- any verified member who can see the profile
  'after_i_reply',     -- only people this member has engaged with
  'after_gist'         -- only after a completed Gist both want to continue
);

-- DEFAULT IS A FLAGGED ASSUMPTION. PRD §5.1 names photo-reveal control but
-- sets no default. 'verified_members' preserves how profiles already behave;
-- a more private default is a product decision, not a migration detail.
alter table public.profiles
  add column photo_reveal photo_reveal not null default 'verified_members',
  -- Every incoming image starts hidden until the recipient chooses to see it.
  add column blur_incoming_images boolean not null default true;

create table public.profile_photos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null unique,
  position smallint not null default 0 check (position between 0 and 5),
  created_at timestamptz not null default now(),
  -- Files live under the owner's own folder, so the storage policy below can
  -- tie a file to its owner from the path alone.
  check (split_part(storage_path, '/', 1) = profile_id::text)
);

create or replace function public.try_uuid(p text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

-- The rule, in one place. Used by the table policy AND the storage policy:
-- a reveal enforced on the table but not on the files is not enforced.
--
-- "after_i_reply" deliberately means the OWNER engaged, not the viewer.
-- If replying to someone unlocked their photos, anyone could unlock anyone's
-- photos just by sending a reply.
create or replace function public.can_see_photos(p_viewer uuid, p_owner uuid)
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
    -- Only verified members see anyone's photos.
    when not exists (
      select 1 from profiles v
      where v.id = p_viewer and v.stage in ('verified_real', 'id_confirmed')
    ) then false
    else coalesce((
      select case o.photo_reveal
        when 'verified_members' then true
        when 'after_i_reply' then
          exists (
            select 1 from replies r
            where r.sender_id = p_owner and r.recipient_id = p_viewer
          )
          or exists (
            select 1 from gist_sessions g
            where (g.proposer_id = p_owner and g.invitee_id = p_viewer
                   and g.status not in ('declined', 'cancelled', 'expired'))
               or (g.invitee_id = p_owner and g.proposer_id = p_viewer
                   and g.status in ('accepted', 'live', 'completed'))
          )
        when 'after_gist' then exists (
          select 1 from gist_sessions g
          where g.status = 'completed'
            and ((g.proposer_id = p_owner and g.invitee_id = p_viewer)
              or (g.invitee_id = p_owner and g.proposer_id = p_viewer))
            and gist_mutual_continue(g.id)
        )
        else false
      end
      from profiles o
      where o.id = p_owner
    ), false)
  end;
$$;

alter table public.profile_photos enable row level security;

create policy "photos visible per the owner's reveal choice"
  on public.profile_photos for select
  using (public.can_see_photos(auth.uid(), profile_id));

create policy "own photos insert" on public.profile_photos for insert
  with check (auth.uid() = profile_id);

create policy "own photos update" on public.profile_photos for update
  using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create policy "own photos delete" on public.profile_photos for delete
  using (auth.uid() = profile_id);

-- ---------------------------------------------------------------------------
-- Storage: the files themselves
-- ---------------------------------------------------------------------------
--
-- PRIVATE bucket. If this were public, every policy above would be
-- decorative: anyone holding a path could fetch the file directly. Images are
-- served through short-lived signed URLs, issued only when can_see_photos()
-- agrees.

insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', false)
on conflict (id) do update set public = false;

create policy "profile photo files follow reveal rules"
  on storage.objects for select
  using (
    bucket_id = 'profile-photos'
    and public.can_see_photos(auth.uid(), public.try_uuid((storage.foldername(name))[1]))
  );

create policy "own profile photo files upload"
  on storage.objects for insert
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own profile photo files delete"
  on storage.objects for delete
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Toastly — image attachments on messages.
--
-- Two rules carry over unchanged from messaging (0004):
--
--   * The locked Starter inbox. An attachment is message CONTENT, so it is
--     visible exactly when its message is visible. The policies below do not
--     restate the entitlement; they defer to the messages table, which
--     already enforces it. One rule, one place.
--   * The privacy boundary. Images are never inspected, classified or
--     analysed. The unsolicited-image protection is a blur applied to EVERY
--     incoming image by default, lifted only when the recipient taps — an
--     image classifier would be content scanning by another name.

create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  storage_path text not null unique,
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  created_at timestamptz not null default now()
);

create index message_attachments_message_idx
  on public.message_attachments (message_id);

alter table public.message_attachments enable row level security;

-- Visible iff the parent message is visible to this member. The subquery runs
-- under the caller's row-level security, so a Starter recipient — who cannot
-- see the message — cannot see its attachment either.
create policy "attachments follow the message lock"
  on public.message_attachments for select
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_attachments.message_id
    )
  );

create policy "senders attach to their own messages"
  on public.message_attachments for insert
  with check (
    exists (
      select 1 from public.messages m
      where m.id = message_id and m.sender_id = auth.uid()
    )
  );

-- Private bucket, for the same reason as profile photos: a public bucket would
-- make the lock above decorative.
insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', false)
on conflict (id) do update set public = false;

create policy "attachment files follow the message lock"
  on storage.objects for select
  using (
    bucket_id = 'message-attachments'
    and exists (
      select 1 from public.message_attachments a
      where a.storage_path = storage.objects.name
    )
  );

create policy "senders upload attachment files"
  on storage.objects for insert
  with check (
    bucket_id = 'message-attachments'
    and exists (
      select 1 from public.messages m
      where m.id = public.try_uuid((storage.foldername(name))[1])
        and m.sender_id = auth.uid()
    )
  );

-- Toastly — "People you passed on" gets a small main photo (decided 13 October
-- 2026; PRD §5.2.5). Follows 0045.
--
-- The list shows each person's first name and a small main photo, fetched
-- through the same access rules as the six: the photo is returned only where
-- can_see_photos() allows this member to see it (the owner's reveal choice,
-- blocks either way, a verified viewer), and the file itself is then signed
-- under storage's own policy, which asks the same question. Someone who is no
-- longer live, is paused, has blocked the member (or been blocked by them) drops
-- off the list; a deleted account takes its pass rows with it.
--
-- Nothing else about a passed member is returned: their name, city, the date
-- and, where the rules allow, the path of their main photo.

drop function if exists public.my_passes();

create function public.my_passes()
returns table (candidate_id uuid, display_name text, city text, passed_at timestamptz, photo_path text)
language sql
stable
security definer
set search_path = public
as $$
  select fp.candidate_id, p.display_name, p.city, fp.passed_at,
         case when can_see_photos(auth.uid(), p.id) then (
           select ph.storage_path from profile_photos ph
            where ph.id = p.main_photo_id and not is_hidden_candidate(ph.id)
         ) end
    from feed_passes fp
    join profiles p on p.id = fp.candidate_id
   where fp.profile_id = auth.uid()
     and p.paused = false
     and profile_is_live(p.id)
     and not exists (
       select 1 from blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
           or (b.blocker_id = p.id and b.blocked_id = auth.uid()))
   order by fp.passed_at desc;
$$;
revoke all on function public.my_passes() from public, anon;
grant execute on function public.my_passes() to authenticated;

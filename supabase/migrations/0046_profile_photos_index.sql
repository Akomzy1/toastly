-- Toastly - an index for profile_is_live. Follows 0045. Optional and independent.
--
-- profile_is_live (0036) counts a member's photos on every call, and
-- profile_photos had no index on profile_id, so each call scanned the whole
-- table. Measured on 2,000 members (8,000 photos): profile_is_live took 6.7 ms
-- a call; with this index, 1.15 ms. The photo count alone went from 3.9 ms to
-- 0.1 ms. The feed, replies, invites and profile reads all call profile_is_live.
-- Nothing else changes.

create index if not exists profile_photos_profile_idx on public.profile_photos (profile_id);

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireLiveProfile } from "@/lib/live-profile";
import { ProfileNotLive } from "@/components/app/profile-not-live";
import { loadFullProfile } from "@/lib/full-profile";
import { backFor } from "@/lib/full-profile-view";
import { FullProfile } from "@/components/profile/full-profile";

export const metadata: Metadata = {
  title: "Profile",
  robots: { index: false, follow: false },
};

/**
 * Another member's full profile (PRD §5.2.4; full-profile-view.slim.html).
 *
 * Who can open it is decided by the database (can_open_profile, 0032): your
 * six, anyone who reached out to you, your matches and Gist partners. Any
 * other id is a plain 404 — the same as a member who doesn't exist, so the
 * page can't be used to probe who is on Toastly. Opening it records nothing.
 */
export default async function MemberProfilePage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // No live profile, no access (PRD §5.1.2): checked before anything about
  // anyone else is read. The database refuses regardless (0032); this says why.
  const live = await requireLiveProfile(supabase);
  if (!live.live) return <ProfileNotLive status={live} />;

  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const view = await loadFullProfile(supabase, user.id, params.id);
  if (!view) notFound();

  return <FullProfile view={view} back={backFor(view)} />;
}

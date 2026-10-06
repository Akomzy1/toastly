import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadInvite } from "@/lib/gist-invites";
import { DEFAULT_TIME_ZONE, gistWindows, localDay, localTime12 } from "@/lib/scheduling";
import { WindowPicker, type WindowOption } from "@/components/gist/window-picker";
import { requireLiveProfile } from "@/lib/live-profile";
import { ProfileNotLive } from "@/components/app/profile-not-live";

export const metadata: Metadata = { title: "Pick a time", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Pick a time — both-clocks.slim.html. Only for an accepted Gist not yet started. */
export default async function SchedulePage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // No live profile, no access (PRD §5.1.2): checked before anything about
  // anyone else is read. The database refuses regardless (0029); this says why.
  const live = await requireLiveProfile(supabase);
  if (!live.live) return <ProfileNotLive status={live} />;

  const ctx = await loadInvite(supabase, params.id, user.id);
  if (!ctx) notFound();
  if (ctx.status !== "accepted" || ctx.startedAt) redirect(`/gist/${params.id}`);

  const mine = ctx.me.zone ?? DEFAULT_TIME_ZONE;
  const theirs = ctx.other.zone ?? DEFAULT_TIME_ZONE;
  const now = new Date();
  const option = (d: Date, prefix: string): WindowOption => ({
    iso: d.toISOString(),
    date: `${prefix}, ${localDay(d, mine)}`,
    mine: localTime12(d, mine) ?? "",
    theirs: localTime12(d, theirs) ?? "",
  });

  return (
    <WindowPicker
      sessionId={ctx.id}
      name={ctx.other.name}
      city={ctx.other.city}
      myCity={ctx.me.city}
      crossZone={mine !== theirs}
      today={gistWindows(mine, theirs, "today", now).map((d) => option(d, "Today"))}
      tomorrow={gistWindows(mine, theirs, "tomorrow", now).map((d) => option(d, "Tomorrow"))}
      todayLabel={localDay(now, mine) ?? ""}
      tomorrowLabel={localDay(new Date(now.getTime() + 86_400_000), mine) ?? ""}
      nowMine={localTime12(now, mine) ?? ""}
      nowTheirs={localTime12(now, theirs) ?? ""}
    />
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isExpired, sinceLabel } from "@/lib/gist-invites";
import { localDay, localTime12 } from "@/lib/scheduling";
import { GistListView, type GistGroup, type GistRow } from "@/components/gist/gists-list-view";
import { GistsSeen } from "@/components/app/nav";
import type { GistStatus } from "@/lib/gist";
import { requireLiveProfile } from "@/lib/live-profile";
import { ProfileNotLive } from "@/components/app/profile-not-live";

export const metadata: Metadata = {
  title: "Gists",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * Your Gists — gists-list.slim.html (prototype 5).
 *
 * One list, three groups, always in this order. Every row carries the prompt
 * answer the invite was about, labelled with whose answer it is. Invites for
 * you sit on a sand edge; nothing else is ranked or badged. Empty groups say
 * so in one line.
 *
 * Declined and closed invites stay under "Waiting on them" for a week so the
 * sender can see the outcome (prototype 8) — the list has no other place for
 * them, flagged.
 */

type Row = GistRow;

const WEEK = 7 * 86_400_000;

function when(iso: string, zone: string | null): string {
  const z = zone ?? "Africa/Lagos";
  const at = new Date(iso);
  const today = localDay(new Date(), z);
  const tomorrow = localDay(new Date(Date.now() + 86_400_000), z);
  const day = localDay(at, z);
  const prefix = day === today ? "Today" : day === tomorrow ? "Tomorrow" : null;
  return `${prefix ? `${prefix}, ` : ""}${day} · ${localTime12(at, z)}`;
}

export default async function GistPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // No live profile, no access (PRD §5.1.2): checked before anything about
  // anyone else is read. The database refuses regardless (0029); this says why.
  const live = await requireLiveProfile(supabase);
  if (!live.live) return <ProfileNotLive status={live} />;

  const { data: sessions } = await supabase
    .from("gist_sessions")
    .select("id, status, proposer_id, invitee_id, created_at, scheduled_for, time_proposed_by, time_confirmed_at, ends_at")
    .or(`proposer_id.eq.${user.id},invitee_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(30);

  const list = sessions ?? [];
  const otherIds = Array.from(new Set(list.map((s) => (s.proposer_id === user.id ? s.invitee_id : s.proposer_id))));
  const [{ data: people }, answers] = await Promise.all([
    supabase.from("profiles").select("id, display_name, time_zone").in("id", [user.id, ...otherIds]),
    Promise.all(list.map((s) => supabase.rpc("gist_answer", { p_session_id: s.id }))),
  ]);
  const nameOf = (id: string) => (people ?? []).find((p) => p.id === id)?.display_name ?? "A member";
  const myZone = (people ?? []).find((p) => p.id === user.id)?.time_zone ?? null;

  const invites: Row[] = [];
  const waiting: Row[] = [];
  const coming: Row[] = [];

  list.forEach((s, i) => {
    const mine = s.proposer_id === user.id;
    const otherId = mine ? s.invitee_id : s.proposer_id;
    const name = nameOf(otherId);
    const first = name.split(" ")[0];
    const a = Array.isArray(answers[i].data) ? answers[i].data[0] : null;
    const base = {
      id: s.id,
      name,
      teal: false,
      invite: false,
      whose: a ? (a.owner_id === user.id ? "Your answer" : `${first}'s answer`) : "",
      prompt: (a?.prompt as string | undefined) ?? null,
      answer: (a?.answer as string | undefined) ?? null,
    };
    const status = (isExpired(s.status as GistStatus, s.created_at) ? "expired" : s.status) as GistStatus;
    const recent = Date.now() - Date.parse(s.created_at) < WEEK;

    if (status === "proposed") {
      if (mine) waiting.push({ ...base, status: `Invite sent · ${sinceLabel(s.created_at, myZone)}` });
      else invites.push({ ...base, invite: true, status: `Invited you · ${sinceLabel(s.created_at, myZone)}` });
    } else if ((status === "declined" || status === "expired") && mine && recent) {
      waiting.push({ ...base, status: status === "declined" ? "Passed on this one" : "Invite closed" });
    } else if (status === "accepted" || (status === "live" && !(s.ends_at && Date.parse(s.ends_at) < Date.now()))) {
      // A live Gist whose 18 minutes have run out is over, not "On now".
      let line: string;
      let teal = false;
      if (status === "live") {
        line = "On now";
        teal = true;
      } else if (s.scheduled_for && s.time_confirmed_at) {
        line = when(s.scheduled_for, myZone);
        teal = true;
      } else if (s.scheduled_for && s.time_proposed_by) {
        line = s.time_proposed_by === user.id ? `Waiting on ${first} to confirm the time` : `${first} picked a time — confirm it`;
      } else {
        line = "Said yes · pick a time";
      }
      coming.push({ ...base, status: line, teal });
    }
  });

  const groups: GistGroup[] = [
    { title: "Invites for you", rows: invites, empty: "No invites right now." },
    { title: "Waiting on them", rows: waiting, empty: "Nothing waiting on a reply." },
    { title: "Coming up", rows: coming, empty: "Nothing booked yet." },
  ];

  return (
    <>
      <GistListView groups={groups} />
      {/* Opening Gists clears the tab bar's sand dot (nav-gists.slim.html). */}
      <GistsSeen />
    </>
  );
}

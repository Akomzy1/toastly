import type { createClient } from "@/lib/supabase/server";
import type { GistStatus } from "@/lib/gist";

/**
 * Everything the gist-invite screens need about one Gist, read as the member.
 * Rules live in the database (0020); this only gathers.
 */

export const INVITE_DAYS = 3;

export type Person = { id: string; name: string; first: string; city: string | null; zone: string | null };

export type InviteContext = {
  id: string;
  status: GistStatus;
  /** "proposed" older than 3 days reads as expired even before the nightly job runs. */
  effectiveStatus: GistStatus;
  iAmProposer: boolean;
  me: Person;
  other: Person;
  answer: { prompt: string; answer: string; mine: boolean } | null;
  createdAt: string;
  scheduledFor: string | null;
  timeProposedByMe: boolean | null;
  timeConfirmed: boolean;
  youReady: boolean;
  theyReady: boolean;
  startedAt: string | null;
  endsAt: string | null;
};

type Supabase = ReturnType<typeof createClient>;

function person(row: { id: string; display_name: string | null; city: string | null; time_zone: string | null } | undefined, id: string): Person {
  const name = row?.display_name ?? "this member";
  return { id, name, first: name.split(" ")[0], city: row?.city ?? null, zone: row?.time_zone ?? null };
}

export function isExpired(status: GistStatus, createdAt: string, now = Date.now()): boolean {
  return status === "proposed" && now - Date.parse(createdAt) > INVITE_DAYS * 86_400_000;
}

export async function loadInvite(supabase: Supabase, sessionId: string, userId: string): Promise<InviteContext | null> {
  const { data: s } = await supabase
    .from("gist_sessions")
    .select(
      "id, status, proposer_id, invitee_id, created_at, scheduled_for, time_proposed_by, time_confirmed_at, proposer_ready_at, invitee_ready_at, started_at, ends_at",
    )
    .eq("id", sessionId)
    .maybeSingle();
  if (!s) return null;

  const iAmProposer = s.proposer_id === userId;
  const otherId = iAmProposer ? s.invitee_id : s.proposer_id;
  const [{ data: people }, { data: answerRows }] = await Promise.all([
    supabase.from("profiles").select("id, display_name, city, time_zone").in("id", [userId, otherId]),
    supabase.rpc("gist_answer", { p_session_id: sessionId }),
  ]);
  const find = (id: string) => (people ?? []).find((p) => p.id === id);
  const a = Array.isArray(answerRows) ? answerRows[0] : null;

  const status = s.status as GistStatus;
  return {
    id: s.id,
    status,
    effectiveStatus: isExpired(status, s.created_at) ? "expired" : status,
    iAmProposer,
    me: person(find(userId), userId),
    other: person(find(otherId), otherId),
    answer: a ? { prompt: a.prompt as string, answer: a.answer as string, mine: a.owner_id === userId } : null,
    createdAt: s.created_at,
    scheduledFor: s.scheduled_for,
    timeProposedByMe: s.time_proposed_by ? s.time_proposed_by === userId : null,
    timeConfirmed: Boolean(s.time_confirmed_at),
    youReady: Boolean(iAmProposer ? s.proposer_ready_at : s.invitee_ready_at),
    theyReady: Boolean(iAmProposer ? s.invitee_ready_at : s.proposer_ready_at),
    startedAt: s.started_at,
    endsAt: s.ends_at,
  };
}

/** "just now", "2 hours ago", "Tuesday" — the gists-list status style. */
export function sinceLabel(iso: string, zone: string | null, now = Date.now()): string {
  const mins = Math.round((now - Date.parse(iso)) / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  try {
    return new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: zone ?? "Africa/Lagos" }).format(new Date(iso));
  } catch {
    return "earlier";
  }
}

/** The first day of next month, for "They reset on 1 November". */
export function resetDate(now = new Date()): string {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }).format(next);
}

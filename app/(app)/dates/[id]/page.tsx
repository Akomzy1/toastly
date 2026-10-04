import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScreenBand } from "@/components/app/screen-band";
import { SafetyActions } from "@/components/safety/safety-actions";
import { DateView, type DateViewProps } from "@/components/dates/date-view";
import { DEFAULT_TIME_ZONE } from "@/lib/scheduling";

export const metadata: Metadata = { title: "Your date", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * One date, every state (PRD §5.5; 0023).
 *
 * NOT IN A PROTOTYPE — flagged (Prompt 17). Built from the in-app cards and
 * buttons until the coins and attendance design is exported.
 */
export default async function DatePage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Move the date on if its window or contest period has passed, so the page
  // never shows a state the scheduled job hasn't caught up with yet.
  const { error: refreshError } = await supabase.rpc("date_refresh", { p_id: params.id });
  if (refreshError) notFound();

  const [{ data: d }, { data: cfg }, { data: bal }] = await Promise.all([
    supabase
      .from("date_commitments")
      .select(
        "id, member_a, member_b, stake_coins, scheduled_for, status, venue_name, venue_address, session_id, a_staked_at, b_staked_at, a_checked_in_at, b_checked_in_at, a_reschedule_at, b_reschedule_at, no_show_member, contest_deadline, cancel_reason, cancelled_by",
      )
      .eq("id", params.id)
      .maybeSingle(),
    supabase.from("coin_config").select("cancel_cutoff_hours, window_before_min, window_after_min, checkin_radius_m").maybeSingle(),
    supabase.rpc("purchased_balance", { p_profile_id: user.id }),
  ]);
  if (!d || !cfg) notFound();

  const iAmA = d.member_a === user.id;
  const otherId = iAmA ? d.member_b : d.member_a;
  const [{ data: other }, { data: me }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", otherId).maybeSingle(),
    supabase.from("profiles").select("time_zone").eq("id", user.id).maybeSingle(),
  ]);
  const otherName = other?.display_name ?? "this member";
  const zone = me?.time_zone ?? DEFAULT_TIME_ZONE;

  const at = new Date(d.scheduled_for);
  const now = Date.now();
  const fmt = (t: Date, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: zone, ...opts }).format(t);
  const when = `${fmt(at, { weekday: "long", day: "numeric", month: "long" })}, ${fmt(at, { hour: "numeric", minute: "2-digit", hour12: true })}`;
  const opens = new Date(at.getTime() - cfg.window_before_min * 60_000);
  const closes = new Date(at.getTime() + cfg.window_after_min * 60_000);

  const props: DateViewProps = {
    id: d.id,
    status: d.status,
    stake: d.stake_coins,
    stakeable: Math.max(0, (bal as number | null) ?? 0),
    venue: d.venue_name ?? "the venue",
    address: d.venue_address ?? "",
    when,
    otherFirst: otherName.split(" ")[0],
    sessionId: d.session_id,
    iProposed: iAmA,
    iStaked: Boolean(iAmA ? d.a_staked_at : d.b_staked_at),
    iCheckedIn: Boolean(iAmA ? d.a_checked_in_at : d.b_checked_in_at),
    theyCheckedIn: Boolean(iAmA ? d.b_checked_in_at : d.a_checked_in_at),
    iAskedMove: Boolean(iAmA ? d.a_reschedule_at : d.b_reschedule_at),
    theyAskedMove: Boolean(iAmA ? d.b_reschedule_at : d.a_reschedule_at),
    iWasAbsent: d.no_show_member === user.id,
    contestBy: d.contest_deadline ? `${fmt(new Date(d.contest_deadline), { weekday: "long", hour: "numeric", minute: "2-digit", hour12: true })}` : null,
    cancelReason: d.cancel_reason,
    cancelledByMe: d.cancelled_by === user.id,
    beforeCutoff: now < at.getTime() - cfg.cancel_cutoff_hours * 3600_000,
    cutoffHours: cfg.cancel_cutoff_hours,
    windowOpen: now >= opens.getTime() && now <= closes.getTime(),
    windowLabel: `${fmt(opens, { hour: "numeric", minute: "2-digit", hour12: true })} to ${fmt(closes, { hour: "numeric", minute: "2-digit", hour12: true })}`,
    radius: cfg.checkin_radius_m,
  };

  return (
    <>
      <ScreenBand title="Your date" sub={`${props.venue} · with ${props.otherFirst}`} />
      <div className="mx-auto grid w-full max-w-[680px] content-start gap-4 px-3.5 pb-8 pt-4">
        <DateView {...props} />
        {/* Never behind a plan or a coin cost. Reporting them here also returns
            your coins (0023, the safety override). */}
        <SafetyActions memberId={otherId} name={otherName} />
      </div>
    </>
  );
}

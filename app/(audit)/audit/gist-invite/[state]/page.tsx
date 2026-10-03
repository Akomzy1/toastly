import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAuditHarness } from "@/lib/audit-harness";
import { ReplyScreen } from "@/components/gist/reply-screen";
import { InviteSentView } from "@/components/gist/invite-sent-view";
import { GistListView, type GistGroup } from "@/components/gist/gists-list-view";
import { AfterAccepting, ReceivedView, SenderOutcome, TimePending } from "@/components/gist/invite-views";
import { WindowPicker, type WindowOption } from "@/components/gist/window-picker";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Audit · Gist invites", robots: { index: false, follow: false } };

/** Mobile-audit harness: every gist-invite state, with the prototypes' sample content. */
const ID = "00000000-0000-0000-0000-000000000000";
const AMAKA = { prompt: "A Sunday that feels like me…", answer: "Jollof at my aunty's in Surulere, a long call with my brother in Leeds, then choir practice I pretend not to enjoy." };
const KELECHI = { prompt: "The way to win me over is…", answer: "Remember the small thing I mentioned weeks ago. Bonus points if there's suya involved." };

const WINDOWS: WindowOption[] = [
  { iso: "2026-10-03T12:00:00.000Z", date: "Today, Sat 3 Oct", mine: "1:00 pm", theirs: "8:00 am" },
  { iso: "2026-10-03T16:00:00.000Z", date: "Today, Sat 3 Oct", mine: "5:00 pm", theirs: "12:00 pm" },
  { iso: "2026-10-03T20:30:00.000Z", date: "Today, Sat 3 Oct", mine: "9:30 pm", theirs: "4:30 pm" },
];
const TOMORROW = WINDOWS.map((w) => ({ ...w, iso: w.iso.replace("03T", "04T"), date: "Tomorrow, Sun 4 Oct" }));

const row = (id: string, name: string, status: string, whose: string, a: typeof AMAKA, extra = {}) => ({
  id, name, status, whose, prompt: a.prompt, answer: a.answer, teal: false, invite: false, ...extra,
});
const BUSY: GistGroup[] = [
  { title: "Invites for you", rows: [row("1", "Kelechi Obi", "Invited you · 2 hours ago", "Your answer", KELECHI, { invite: true })], empty: "No invites right now." },
  { title: "Waiting on them", rows: [row("2", "Amaka Eze", "Invite sent · just now", "Amaka's answer", AMAKA)], empty: "Nothing waiting on a reply." },
  { title: "Coming up", rows: [row("3", "Ifeoma Nwosu", "Tomorrow, Sun 4 Oct · 7:30 pm", "Your answer", KELECHI, { teal: true })], empty: "Nothing booked yet." },
];
const QUIET: GistGroup[] = BUSY.map((g, i) => ({ ...g, rows: i === 1 ? g.rows : [] }));

const pickerProps = { sessionId: ID, name: "Amaka Eze", city: "Toronto", myCity: "Lagos", todayLabel: "Sat 3 Oct", tomorrowLabel: "Sun 4 Oct", nowMine: "9:40 pm", nowTheirs: "4:40 pm" };

const STATES: Record<string, () => React.ReactElement> = {
  "reply-starter": () => <ReplyScreen mode="starter" answerId={ID} recipientId={ID} name="Amaka Eze" city="Toronto" {...AMAKA} gistsLeft={2} resetOn="1 November" />,
  "reply-paid": () => <ReplyScreen mode="paid" answerId={ID} recipientId={ID} name="Amaka Eze" city="Toronto" {...AMAKA} gistsLeft={null} resetOn="1 November" />,
  "reply-limit": () => <ReplyScreen mode="limit" answerId={ID} recipientId={ID} name="Amaka Eze" city="Toronto" {...AMAKA} gistsLeft={0} resetOn="1 November" />,
  sent: () => <InviteSentView otherName="Amaka Eze" starter since="just now" answer={AMAKA} />,
  list: () => <GistListView groups={BUSY} />,
  "list-quiet": () => <GistListView groups={QUIET} />,
  received: () => <ReceivedView sessionId={ID} name="Kelechi Obi" city="Toronto" answer={{ ...KELECHI, mine: true }} starter passed={null} />,
  "received-declined": () => <ReceivedView sessionId={ID} name="Kelechi Obi" city="Toronto" answer={{ ...KELECHI, mine: true }} starter passed="declined" />,
  "outcome-waiting": () => <SenderOutcome sessionId={ID} name="Amaka Eze" answer={{ ...AMAKA, mine: false }} kind="waiting" starter online={false} />,
  "outcome-accepted": () => <SenderOutcome sessionId={ID} name="Amaka Eze" answer={{ ...AMAKA, mine: false }} kind="accepted" starter online />,
  "outcome-declined": () => <SenderOutcome sessionId={ID} name="Amaka Eze" answer={{ ...AMAKA, mine: false }} kind="declined" starter online={false} />,
  "outcome-expired": () => <SenderOutcome sessionId={ID} name="Amaka Eze" answer={{ ...AMAKA, mine: false }} kind="expired" starter={false} online={false} />,
  "accepted-online": () => <AfterAccepting sessionId={ID} name="Kelechi Obi" city="Toronto" myName="Tobi Adeyemi" online crossZone nowMine="4:40 pm" nowTheirs="11:40 am" myCity="Lagos" zoneLine="Kelechi is in Toronto. Every time you see will show on both clocks." />,
  "accepted-cross": () => <AfterAccepting sessionId={ID} name="Kelechi Obi" city="Toronto" myName="Tobi Adeyemi" online={false} crossZone nowMine="4:40 pm" nowTheirs="11:40 am" myCity="Lagos" zoneLine="Kelechi is in Toronto. Every time you see will show on both clocks." />,
  "accepted-same": () => <AfterAccepting sessionId={ID} name="Kelechi Obi" city="Abuja" myName="Tobi Adeyemi" online={false} crossZone={false} nowMine="4:40 pm" nowTheirs="4:40 pm" myCity="Lagos" zoneLine="You're in the same time zone, so one clock is all you need." />,
  "time-confirm": () => <TimePending sessionId={ID} name="Kelechi Obi" pickedByMe={false} mine="Sun 4 Oct · 7:30 pm" theirs="Sun 4 Oct · 2:30 pm" crossZone />,
  "time-waiting": () => <TimePending sessionId={ID} name="Kelechi Obi" pickedByMe mine="Sun 4 Oct · 7:30 pm" theirs="Sun 4 Oct · 2:30 pm" crossZone />,
  picker: () => <WindowPicker {...pickerProps} crossZone today={WINDOWS} tomorrow={TOMORROW} />,
  "picker-none": () => <WindowPicker {...pickerProps} crossZone today={[]} tomorrow={TOMORROW} />,
  "picker-same": () => <WindowPicker {...pickerProps} city="Abuja" crossZone={false} today={WINDOWS} tomorrow={TOMORROW} />,
};

export default function AuditGistInvite({ params }: { params: { state: string } }) {
  requireAuditHarness();
  const render = STATES[params.state];
  if (!render) notFound();
  return render();
}

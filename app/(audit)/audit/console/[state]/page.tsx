import { notFound } from "next/navigation";
import { ConsoleHeader } from "@/components/staff/console-header";
import { QueueView, type QueueRow } from "@/components/staff/queue-view";
import { CaseView, type CaseItem } from "@/components/staff/case-view";
import { HistoryView } from "@/components/staff/history-view";

/**
 * Mobile-audit harness: the review console at tablet and desktop widths,
 * with sample cases (gated by the layout). Member numbers only, as in the
 * real console.
 */
const NOW = Date.parse("2026-10-04T13:00:00Z");
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

const ROWS: QueueRow[] = [
  { id: "c1", case_no: 20377, kind: "pricing", reason: "Bought a naira plan while their profile says they live in the UK.", created_at: ago(7340), stage: "decided", assigned_name: "Tunde B." },
  { id: "c2", case_no: 20391, kind: "attendance", reason: "Says they were at Café Neo, Ikeja. Only one check-in was recorded.", created_at: ago(5880), stage: "in_review", assigned_name: "Adaeze O." },
  { id: "c3", case_no: 20398, kind: "pricing", reason: "Paid in naira with a card issued in the UK.", created_at: ago(5460), stage: "waiting_member", assigned_name: "Tunde B." },
  { id: "c4", case_no: 20402, kind: "married_report", reason: "A match says this member is married. First report on the account.", created_at: ago(4680), stage: "new", assigned_name: null },
  { id: "c5", case_no: 20407, kind: "blind_report", reason: "Reported from a locked inbox as “Asking for money”. The reporter hasn't read the messages.", created_at: ago(4200), stage: "new", assigned_name: null },
  { id: "c6", case_no: 20410, kind: "selfie_review", reason: "Selfie liveness came back for review after 2 earlier attempts.", created_at: ago(3420), stage: "in_review", assigned_name: "Kemi A." },
  { id: "c7", case_no: 20418, kind: "report", reason: "Reported as “Harassment”.", created_at: ago(2640), stage: "new", assigned_name: null },
];

const member = (role: string, no: number, extra: Partial<CaseItem["members"][number]> = {}): CaseItem["members"][number] => ({
  role,
  member_no: no,
  removed: false,
  tier: "premium",
  joined: "2026-03-12T10:00:00Z",
  city: "Lekki, Lagos",
  country: "GB",
  phone_verified_at: "2026-03-12T10:00:00Z",
  liveness_verified_at: "2026-03-12T10:05:00Z",
  id_confirmed_at: null,
  id_type: null,
  reports_about: [],
  earlier_cases: [],
  dates: { attended: 4, missed: 0, cancelled: 0 },
  restricted: false,
  ...extra,
});

const CASES: Record<string, CaseItem> = {
  "case-pricing": {
    id: "c3", case_no: 20398, kind: "pricing", stage: "new", decision: null, created_at: ago(2640),
    reason: "Bought a naira plan while their profile says they live in the UK.",
    assigned_name: null, assigned_to_me: false,
    members: [member("Member", 48213)],
    evidence: {
      signal: "profile_country_mismatch", detail: { country: "GB", route: "plan_pass", track: "ngn" }, profile_country: "GB", profile_time_zone: "Europe/London",
      payments_90_days: [{ currency: "NGN", kind: "plan_pass", status: "succeeded", card_country: null, request_country: "GB", at: ago(2650) }],
    },
    events: [{ at: ago(2640), who: "System", role: "Automatic", what: "Raised", why: "Bought a naira plan while their profile says they live in the UK.", decision: false }],
    actions: ["clear", "ask_switch_plan", "request_reverification", "restrict", "remove"],
  },
  "case-blind": {
    id: "c5", case_no: 20407, kind: "blind_report", stage: "new", decision: null, created_at: ago(4200),
    reason: "Reported from a locked inbox as “Asking for money”. The reporter hasn't read the messages.",
    assigned_name: null, assigned_to_me: false,
    members: [
      member("Reported member", 55930, { tier: "starter", city: "Abuja", country: "NG", reports_about: [{ reason: "Scam or fraud", at: ago(10000), status: "dismissed" }], earlier_cases: [{ case_no: 20311, kind: "report", decision: "clear" }] }),
      member("Reporter", 51007, { tier: "starter", city: "Ikeja, Lagos", country: "NG" }),
    ],
    evidence: { reason: "Asking for money", reporter_note: null, reported_at: ago(4200), blind: true, messages_from_member_to_reporter: 6, conversations_opened_9_days: 41, had_gist_together: false },
    events: [{ at: ago(4200), who: "System", role: "Automatic", what: "Raised", why: "", decision: false }],
    actions: ["clear", "request_reverification", "restrict", "remove"],
  },
  "case-attendance": {
    id: "c2", case_no: 20391, kind: "attendance", stage: "in_review", decision: null, created_at: ago(5880),
    reason: "Says they were at Café Neo, Ikeja. Only one check-in was recorded.",
    assigned_name: "Adaeze O.", assigned_to_me: true,
    members: [member("Member who contested", 44105, { tier: "starter", country: "NG", dates: { attended: 2, missed: 0, cancelled: 1 } }), member("Other member", 39920, { country: "NG" })],
    evidence: { venue: "Café Neo, Ikeja", agreed_time: ago(8000), stake_coins: 10, proposer_member_no: 39920, other_member_no: 44105, proposer_checked_in_at: ago(8008), other_checked_in_at: null, contested_at: ago(5880), status: "under_review" },
    events: [
      { at: ago(5880), who: "System", role: "Automatic", what: "Raised", why: "", decision: false },
      { at: ago(3000), who: "Adaeze O.", role: "Reviewer", what: "Assigned", why: "Assigned to self.", decision: false },
    ],
    actions: ["attended", "no_show", "restrict", "remove"],
  },
  "case-decided": {
    id: "c1", case_no: 20377, kind: "pricing", stage: "decided", decision: "ask_switch_plan", created_at: ago(7340),
    reason: "Bought a naira plan while their profile says they live in the UK.",
    assigned_name: "Tunde B.", assigned_to_me: false,
    members: [member("Member", 40177)],
    evidence: { signal: "profile_country_mismatch", detail: { country: "GB", route: "plan_recurring" }, profile_country: "GB", profile_time_zone: "Europe/London", payments_90_days: [] },
    events: [
      { at: ago(7340), who: "System", role: "Automatic", what: "Raised", why: "", decision: false },
      { at: ago(7000), who: "Tunde B.", role: "Reviewer", what: "Ask to switch plan", why: "Card country and profile both point to the UK, and nothing suggests a visit.", decision: true },
      { at: ago(5600), who: "System", role: "Automatic", what: "Member responded", why: "Moved to a Diaspora plan.", decision: false },
      { at: ago(5600), who: "System", role: "Automatic", what: "Closed", why: "Plan change completed.", decision: false },
    ],
    actions: [],
  },
};

export default function AuditConsole({ params }: { params: { state: string } }) {
  const s = params.state;
  const header = (active: "queue" | "history") => <ConsoleHeader active={active} name="Adaeze O." role="Reviewer" />;
  const shell = (children: React.ReactNode) => <div className="flex min-h-screen flex-col bg-paper">{children}</div>;
  if (s === "queue" || s === "queue-decided") {
    return shell(
      <>
        {header("queue")}
        <QueueView rows={ROWS} status={s === "queue" ? "open" : "decided"} type="all" sort="oldest" base="/audit/console/queue" caseHref={() => "/audit/console/case-pricing"} now={NOW} />
      </>,
    );
  }
  if (CASES[s]) {
    return shell(
      <>
        {header("queue")}
        <CaseView c={CASES[s]} now={NOW} queueHref="/audit/console/queue" historyHref="/audit/console/history" />
      </>,
    );
  }
  if (s === "history") {
    const c = CASES["case-decided"];
    return shell(
      <>
        {header("history")}
        <HistoryView
          q=""
          list={ROWS.map((r) => ({ id: r.id, case_no: r.case_no, kind: r.kind, stage: r.stage, decision: r.stage === "decided" ? "member_switched" : null }))}
          selected={{ id: c.id, case_no: c.case_no, kind: c.kind, stage: c.stage, decision: "member_switched" }}
          reason={c.reason}
          entries={c.events}
          base="/audit/console/history"
        />
      </>,
    );
  }
  notFound();
}

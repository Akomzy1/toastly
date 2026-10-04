import { notFound } from "next/navigation";
import { DateView, type DateViewProps } from "@/components/dates/date-view";
import { ProposeDate } from "@/components/dates/propose-date";

/** Mobile-audit harness: every state of a date (gated by the layout). */
const BASE: DateViewProps = {
  id: "00000000-0000-0000-0000-0000000000d1",
  status: "confirmed",
  stake: 10,
  stakeable: 38,
  venue: "Terra Kulture",
  address: "Tiamiyu Savage Street, Victoria Island, Lagos",
  when: "Saturday 10 October, 4:00 pm",
  otherFirst: "Amaka",
  sessionId: "00000000-0000-0000-0000-0000000000aa",
  iProposed: true,
  iStaked: true,
  iCheckedIn: false,
  theyCheckedIn: false,
  iAskedMove: false,
  theyAskedMove: false,
  iWasAbsent: false,
  contestBy: "Sunday 5:30 pm",
  cancelReason: null,
  cancelledByMe: false,
  beforeCutoff: true,
  cutoffHours: 12,
  windowOpen: false,
  windowLabel: "3:30 pm to 5:30 pm",
  radius: 250,
};

const STATES: Record<string, Partial<DateViewProps>> = {
  "pending-them": { status: "pending", iProposed: false, iStaked: false },
  "pending-short": { status: "pending", iProposed: false, iStaked: false, stakeable: 4 },
  "pending-me": { status: "pending" },
  confirmed: {},
  "confirmed-late": { beforeCutoff: false, theyAskedMove: true },
  "check-in": { windowOpen: true, beforeCutoff: false },
  "checked-in": { windowOpen: true, beforeCutoff: false, iCheckedIn: true },
  "contest-absent": { status: "provisional_no_show", iWasAbsent: true },
  "contest-attender": { status: "provisional_no_show" },
  review: { status: "under_review", iWasAbsent: true },
  completed: { status: "completed" },
  "no-show-attender": { status: "no_show" },
  "no-show-absent": { status: "no_show", iWasAbsent: true },
  "cancelled-safety": { status: "cancelled", cancelReason: "safety", cancelledByMe: true },
  "cancelled-reschedule": { status: "cancelled", cancelReason: "reschedule" },
};

export default function AuditDates({ params }: { params: { state: string } }) {
  if (params.state === "propose" || params.state === "propose-short") {
    return (
      <div className="mx-auto grid max-w-[680px] gap-4 px-3.5 py-6">
        <ProposeDate
          spotId="00000000-0000-0000-0000-000000000002"
          matchFirst="Amaka"
          stakeable={params.state === "propose" ? 38 : 0}
          stakeMin={5}
          stakeMax={50}
          cutoffHours={12}
          openDate={null}
        />
      </div>
    );
  }
  const s = STATES[params.state];
  if (!s) notFound();
  return (
    <div className="mx-auto grid max-w-[680px] content-start gap-4 px-3.5 py-6">
      <DateView {...BASE} {...s} />
    </div>
  );
}

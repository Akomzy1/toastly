import { notFound } from "next/navigation";
import { MemberNoticesView } from "@/components/app/member-notices";
import { PoolPlanNotice } from "@/components/app/pool-plan-notice";

/** Mobile-audit harness: what a member sees after a staff decision (gated by the layout). */
const STATES: Record<string, Parameters<typeof MemberNoticesView>[0]> = {
  restricted: { restriction: { reason_category: "report" }, reverify: null, notices: [] },
  reverify: { restriction: null, reverify: { profile_id: "00000000-0000-0000-0000-0000000000a1" }, notices: [] },
  "switch-plan": { restriction: null, reverify: null, notices: [{ id: "00000000-0000-0000-0000-0000000000n1", kind: "switch_plan" }] },
  all: {
    restriction: { reason_category: "community_standards" },
    reverify: { profile_id: "00000000-0000-0000-0000-0000000000a1" },
    notices: [{ id: "00000000-0000-0000-0000-0000000000n1", kind: "switch_plan" }],
  },
};

export default function AuditNotices({ params }: { params: { state: string } }) {
  if (params.state === "pool-plan") {
    return (
      <div className="mx-auto grid max-w-[680px] gap-4 px-3.5 py-6">
        <PoolPlanNotice />
      </div>
    );
  }
  const s = STATES[params.state];
  if (!s) notFound();
  return <MemberNoticesView {...s} />;
}

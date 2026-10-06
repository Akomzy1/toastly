import { notFound } from "next/navigation";
import { requireAuditHarness } from "@/lib/audit-harness";
import { ScreenBand } from "@/components/app/screen-band";
import { FiltersLocked, FiltersScreen } from "@/components/profile/filters-screen";
import { NO_FILTERS, type MemberFilters } from "@/lib/filters";

export const dynamic = "force-dynamic";

/**
 * Mobile-audit harness: Filters (premium-filters.slim.html; PRD §5.2.4),
 * with mock data — any, Christian chosen, the religion list open, the tribe
 * list open, and Starter's locked state.
 */
const STATES: Record<string, { filters?: Partial<MemberFilters>; open?: "religion" | "tribe"; locked?: boolean }> = {
  any: {},
  christian: { filters: { religions: ["Christian"] } },
  "religion-open": { filters: { religions: ["Christian", "Muslim"] }, open: "religion" },
  "tribe-open": { filters: { tribes: ["Igbo"], tribe_include_unsaid: false }, open: "tribe" },
  locked: { locked: true },
};

export default function AuditFilters({ params }: { params: { state: string } }) {
  requireAuditHarness();
  const s = STATES[params.state];
  if (!s) notFound();
  return (
    <div className="min-h-screen bg-paper">
      <ScreenBand title="Filters" sub="Premium" />
      <div className="mx-auto grid w-full max-w-[680px] gap-4 px-3.5 pb-8 pt-[18px]">
        {s.locked ? <FiltersLocked /> : <FiltersScreen initial={{ ...NO_FILTERS, ...s.filters }} preview={{ open: s.open }} />}
      </div>
    </div>
  );
}

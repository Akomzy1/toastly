import { notFound } from "next/navigation";
import { requireAuditHarness } from "@/lib/audit-harness";
import { FaithSection } from "@/components/profile/faith-section";
import type { FaithFields } from "@/lib/faith";

export const dynamic = "force-dynamic";

/**
 * Mobile-audit harness: Edit profile — Faith (faith-editor.slim.html;
 * PRD §5.2.3), with mock data: not added, the consent sheet, Christian ·
 * Pentecostal, Muslim · Sunni, Traditional, "Other" typed, hidden, the
 * religion list open, the denomination list open, and a religion stored
 * before the option list.
 */
const BLANK: FaithFields = { religion: null, religion_other: null, denomination: null, denomination_other: null, religion_visibility: "public" };

const STATES: Record<string, { faith: Partial<FaithFields>; consented: boolean; preview?: { open?: "rel" | "denom"; sheetFor?: string } }> = {
  empty: { faith: {}, consented: false },
  sheet: { faith: {}, consented: false, preview: { sheetFor: "Christian" } },
  christian: { faith: { religion: "Christian", denomination: "pentecostal" }, consented: true },
  muslim: { faith: { religion: "Muslim", denomination: "sunni" }, consented: true },
  traditional: { faith: { religion: "Traditional" }, consented: true },
  other: { faith: { religion: "Christian", denomination: "other", denomination_other: "Seventh-day Adventist" }, consented: true },
  hidden: { faith: { religion: "Christian", denomination: "pentecostal", religion_visibility: "private" }, consented: true },
  "religion-open": { faith: { religion: "Christian" }, consented: true, preview: { open: "rel" } },
  "denomination-open": { faith: { religion: "Christian", denomination: "pentecostal" }, consented: true, preview: { open: "denom" } },
  legacy: { faith: { religion: "Christianity (RCCG)" }, consented: false },
};

export default function AuditProfileFaith({ params }: { params: { state: string } }) {
  requireAuditHarness();
  const s = STATES[params.state];
  if (!s) notFound();
  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto grid max-w-[720px] gap-6 px-3.5 pb-24 pt-[18px]">
        <FaithSection initial={{ ...BLANK, ...s.faith }} consented={s.consented} preview={s.preview} />
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { requireAuditHarness } from "@/lib/audit-harness";
import { Card } from "@/components/ui/card";
import { CityPicker, type PickerCity } from "@/components/app/city-picker";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Audit · city picker",
  robots: { index: false, follow: false },
};

// The prototype's own list, regions included, so the two-line row text is
// exercised at 320px the way city-picker.slim.html says it holds.
const CITIES: PickerCity[] = [
  { slug: "us-new-york", label: "New York", country: "United States", region: "NY · metro area", active: true },
  { slug: "us-houston", label: "Houston", country: "United States", region: "TX · metro area", active: true },
  { slug: "us-atlanta", label: "Atlanta", country: "United States", region: "GA · metro area", active: true },
  { slug: "us-washington-dc", label: "Washington", country: "United States", region: "DC · metro area", active: false },
  { slug: "us-boston", label: "Boston", country: "United States", region: "MA · metro area", active: false },
  { slug: "gb-london", label: "London", country: "United Kingdom", region: "Greater London", active: false },
  { slug: "gb-manchester", label: "Manchester", country: "United Kingdom", region: "Greater Manchester", active: true },
  { slug: "gb-birmingham", label: "Birmingham", country: "United Kingdom", region: "West Midlands", active: true },
  { slug: "ca-toronto", label: "Toronto", country: "Canada", region: "ON · Greater Toronto", active: true },
  { slug: "ca-calgary", label: "Calgary", country: "Canada", region: "AB · metro area", active: true },
  { slug: "ca-winnipeg", label: "Winnipeg", country: "Canada", region: "MB · metro area", active: false },
];

export default function AuditCityPicker() {
  requireAuditHarness();

  return (
    <div className="mx-auto grid max-w-[720px] gap-6 px-5 py-section-y">
      <div className="grid gap-2">
        <h1 className="text-h3 text-ink-900">Your city</h1>
      </div>
      <Card className="grid gap-5 p-[26px]">
        <CityPicker cities={CITIES} defaultValue={null} />
      </Card>
    </div>
  );
}

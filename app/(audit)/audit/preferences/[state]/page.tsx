import { notFound } from "next/navigation";
import { ScreenBand } from "@/components/app/screen-band";
import { MatchPreferences } from "@/components/profile/match-preferences";

/** Mobile-audit harness: Match preferences (gated by the layout). */
export default function AuditPreferences({ params }: { params: { state: string } }) {
  if (params.state !== "on" && params.state !== "off") notFound();
  return (
    <div className="min-h-screen bg-paper">
      <ScreenBand title="Match preferences" back="/profile" />
      <MatchPreferences city="Yaba, Lagos" openToAbroad={params.state === "on"} />
    </div>
  );
}

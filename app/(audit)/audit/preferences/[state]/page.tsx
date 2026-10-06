import { notFound } from "next/navigation";
import { ScreenBand } from "@/components/app/screen-band";
import { MatchPreferences } from "@/components/profile/match-preferences";

const AGE = { lo: 25, hi: 34, floor: 18, cap: 70 };

/** Mobile-audit harness: Match preferences (gated by the layout). */
export default function AuditPreferences({ params }: { params: { state: string } }) {
  if (!["on", "off", "abroad"].includes(params.state)) notFound();
  return (
    <div className="min-h-screen bg-paper">
      <ScreenBand title="Match preferences" back="/profile/settings" />
      <MatchPreferences
        city={params.state === "abroad" ? "Peckham, London" : "Yaba, Lagos"}
        openToAbroad={params.state !== "off"}
        abroad={params.state === "abroad"}
        age={AGE}
      />
    </div>
  );
}

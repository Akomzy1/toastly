import { notFound } from "next/navigation";
import { ScreenBand } from "@/components/app/screen-band";
import type { PickerCity } from "@/components/app/city-picker";
import { CountryCheckSheet, CountrySettings, WhereYouLiveSignup } from "@/components/where-you-live/flows";
import { SettingsList } from "@/components/where-you-live/settings-list";

const CITIES: PickerCity[] = [
  { slug: "us-new-york", label: "New York", country: "United States", region: null, active: true },
  { slug: "us-houston", label: "Houston", country: "United States", region: null, active: true },
  { slug: "gb-london", label: "London", country: "United Kingdom", region: null, active: false },
  { slug: "gb-manchester", label: "Manchester", country: "United Kingdom", region: null, active: true },
];

/** Mobile-audit harness: the where-you-live screens (gated by the layout). */
export default function AuditWhereYouLive({ params }: { params: { state: string } }) {
  switch (params.state) {
    case "signup":
    case "signup-ghana":
      return (
        <div className="min-h-screen bg-paper">
          <ScreenBand title="Where you live" sub="Profile setup" />
          <WhereYouLiveSignup guess={params.state === "signup" ? "NG" : "GH"} cities={CITIES} />
        </div>
      );
    case "confirm":
      return (
        <div className="min-h-screen bg-paper">
          <ScreenBand title="Today" />
          <CountryCheckSheet guess="GB" onFile="GB" cityOnFile="gb-london" cities={CITIES} />
        </div>
      );
    case "settings-list":
      return (
        <div className="min-h-screen bg-paper">
          <ScreenBand title="Settings" back="/profile" />
          <SettingsList phone="+44 770 *** 0412" home="London, United Kingdom" abroad />
        </div>
      );
    case "settings":
    case "settings-locked":
      return (
        <div className="min-h-screen bg-paper">
          <ScreenBand title="Where you live" sub="Settings" back="/profile/settings" />
          <CountrySettings
            current="NG"
            cityOnFile={null}
            cities={CITIES}
            lockedUntil={params.state === "settings-locked" ? "3 April" : null}
            plan={{ name: "Premium", until: "12 March" }}
          />
        </div>
      );
    default:
      notFound();
  }
}

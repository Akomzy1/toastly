import type { Metadata } from "next";
import { ScreenBand } from "@/components/app/screen-band";
import { YourData } from "@/components/account/your-data";

export const metadata: Metadata = { title: "Your data", robots: { index: false, follow: false } };

/** Download and delete — privacy policy section 10. Reached from Profile. */
export default function YourDataPage() {
  return (
    <>
      <ScreenBand title="Your data" sub="See, download or delete what we hold" back="/profile" />
      <div className="mx-auto grid max-w-[720px] gap-6 px-5 pb-section-y pt-5 lg:pt-4">
        <YourData />
      </div>
    </>
  );
}

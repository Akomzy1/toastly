import { notFound } from "next/navigation";
import { ScreenBand } from "@/components/app/screen-band";
import { PoolChoice } from "@/components/profile/pool-choice";

/** Mobile-audit harness: Your match pool (gated by the layout). */
const STATES = {
  "paid-open": { sub: "London · Diaspora plan", city: "London", hasCity: true, diasporaPlan: true, cityOpen: true, current: "both" as const },
  "paid-soon": { sub: "London · Diaspora plan", city: "London", hasCity: true, diasporaPlan: true, cityOpen: false, current: "both" as const },
  free: { sub: "London · Starter plan", city: "London", hasCity: true, diasporaPlan: false, cityOpen: true, current: "back_home" as const },
  "no-city": { sub: "City not set · Diaspora plan", city: "your city", hasCity: false, diasporaPlan: true, cityOpen: false, current: "back_home" as const },
};

export default function AuditPool({ params }: { params: { state: string } }) {
  const s = STATES[params.state as keyof typeof STATES];
  if (!s) notFound();
  const { sub, ...props } = s;
  return (
    <div className="min-h-screen bg-paper">
      <ScreenBand title="Your match pool" sub={sub} back="/profile" />
      <PoolChoice {...props} />
    </div>
  );
}

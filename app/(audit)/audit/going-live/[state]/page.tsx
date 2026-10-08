import { notFound } from "next/navigation";
import { requireAuditHarness } from "@/lib/audit-harness";
import { ProfileNotLive } from "@/components/app/profile-not-live";
import { SelfieCheckStep } from "@/app/(app)/verify/selfie-check-step";
import type { LiveStatus } from "@/lib/live-profile";

export const dynamic = "force-dynamic";

const BASE: LiveStatus = {
  live: false,
  wasLive: false,
  phoneConfirmed: true,
  verifiedReal: false,
  restricted: false,
  photoCount: 2,
  minPhotos: 4,
  mainPhoto: "missing",
  aboutYou: true,
  firstAnswer: false,
};

/**
 * Mobile-audit harness: "Going live" — profile-not-live, the restricted
 * variant, and the onboarding selfie step. (profile-access-paused reads the
 * member's own photos, so it's audited signed in, not here.)
 */
export default async function AuditGoingLive({ params }: { params: { state: string } }) {
  requireAuditHarness();
  if (params.state === "not-live") return <div className="min-h-screen bg-paper">{await ProfileNotLive({ status: BASE })}</div>;
  // An account from before 8 October 2026: no gender yet, or one that's gone (0036).
  if (params.state === "not-live-about-you") return <div className="min-h-screen bg-paper">{await ProfileNotLive({ status: { ...BASE, aboutYou: false } })}</div>;
  if (params.state === "restricted") return <div className="min-h-screen bg-paper">{await ProfileNotLive({ status: { ...BASE, restricted: true, wasLive: true } })}</div>;
  if (params.state === "selfie" || params.state === "selfie-photos") {
    return (
      <div className="min-h-screen bg-paper">
        <div className="mx-auto grid w-full max-w-[680px] gap-4 px-3.5 pb-7 pt-[18px]">
          <SelfieCheckStep connected devStandIn={false} photosReady={params.state === "selfie"} />
        </div>
      </div>
    );
  }
  notFound();
}

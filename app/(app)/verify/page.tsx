import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VerifyFlow } from "@/components/verify/verify-flow";
import { HelpButton } from "@/components/help/help-button";
import { PhoneStep } from "./phone-step";
import { SelfieCheckStep } from "./selfie-check-step";
import { ScreenBand } from "@/components/app/screen-band";
import { WhereYouLiveSignup } from "@/components/where-you-live/flows";
import { guessCountryFromPhone } from "@/lib/countries";
import { loadCities } from "@/lib/where-you-live";
import { PhotosStep } from "./photos-step";
import { SANDBOX_IDENTITIES, sandboxPickerAllowed, smileConfig } from "@/lib/smile-id";
import { deriveVerifyView, isVerifiedReal, type SessionSummary } from "@/lib/verification-view";
import type { PhotoReveal } from "@/lib/safety";
import type { VerificationStage } from "@/lib/types/profile";

export const metadata: Metadata = {
  title: "Get verified",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * Verification — verify-overview.slim.html, with Smile ID behind it.
 *
 * The outcome shown here is read from the database, where only the signed
 * Smile ID callback writes it. Nothing on this page reads a plan, and no
 * plan or price appears: verification is free, always.
 */
export default async function VerifyPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: sessions }, { data: reverify }] = await Promise.all([
    supabase.from("profiles").select("stage, photo_reveal, phone_verified_at, country_confirmed_at").eq("id", user.id).single(),
    supabase
      .from("verification_sessions")
      .select("product, status, result_code, created_at")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("reverification_requests").select("requested_at").maybeSingle(),
  ]);

  // Where you live comes straight after the phone code (where-you-live.slim
  // .html; decided 5 October 2026), pre-selected from the phone's country
  // code and confirmed by the member before anything else.
  if (profile?.phone_verified_at && !profile.country_confirmed_at) {
    return (
      <>
        <ScreenBand title="Where you live" sub="Profile setup" />
        <WhereYouLiveSignup guess={guessCountryFromPhone(user.phone)} cities={await loadCities(supabase)} />
      </>
    );
  }

  const latest = (product: string): SessionSummary | null =>
    (sessions ?? []).find((s) => s.product === product) ?? null;

  const stage: VerificationStage = profile?.stage ?? "unverified";
  const view = deriveVerifyView(stage, latest("smartselfie"), latest("biometric_kyc"), Date.now(), reverify?.requested_at ?? null);

  const sandbox = sandboxPickerAllowed(smileConfig(), user.email)
    ? SANDBOX_IDENTITIES.map(({ key, label, products }) => ({ key, label, products }))
    : [];

  // Photos first, then one in-page selfie (0029). The candidate main photo
  // isn't counted until it matches, so it's added back here.
  const { data: liveRow } = await supabase.rpc("live_profile_status");
  const live = (liveRow ?? {}) as { live?: boolean; photo_count?: number; photos_min?: number; main?: string };
  const photosReady =
    live.main !== undefined && live.main !== "none" &&
    (live.photo_count ?? 0) + (live.main === "matched" ? 0 : 1) >= (live.photos_min ?? 4);
  const onboarding = stage === "phone_verified";

  return (
    <>
    <VerifyFlow
      view={view}
      sandbox={sandbox}
      live={Boolean(live.live)}
      onboardingSelfie={
        onboarding ? (
          <SelfieCheckStep
            connected={smileConfig() !== null}
            devStandIn={process.env.NODE_ENV !== "production"}
            photosReady={photosReady}
            sandbox={sandbox.filter((s) => s.products.includes("smartselfie")).map(({ key, label }) => ({ key, label }))}
          />
        ) : undefined
      }
      phoneStep={<PhoneStep />}
      afterVerified={
        // Decision (c): every member is offered the photo choice once
        // verified, with the visible default already selected. Not part of
        // verify-overview.slim.html — flagged.
        isVerifiedReal(view) ? (
          <PhotosStep current={(profile?.photo_reveal as PhotoReveal | null) ?? "verified_members"} />
        ) : null
      }
    />
    <div className="mx-auto w-full max-w-[680px] px-4 pb-8">
      <HelpButton />
    </div>
    </>
  );
}

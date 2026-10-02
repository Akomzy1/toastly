import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VerifyFlow } from "@/components/verify/verify-flow";
import { PhoneStep } from "./phone-step";
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

  const [{ data: profile }, { data: sessions }] = await Promise.all([
    supabase.from("profiles").select("stage, photo_reveal").eq("id", user.id).single(),
    supabase
      .from("verification_sessions")
      .select("product, status, result_code, created_at")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const latest = (product: string): SessionSummary | null =>
    (sessions ?? []).find((s) => s.product === product) ?? null;

  const stage: VerificationStage = profile?.stage ?? "unverified";
  const view = deriveVerifyView(stage, latest("smartselfie"), latest("biometric_kyc"));

  const sandbox = sandboxPickerAllowed(smileConfig(), user.email)
    ? SANDBOX_IDENTITIES.map(({ key, label, products }) => ({ key, label, products }))
    : [];

  return (
    <VerifyFlow
      view={view}
      sandbox={sandbox}
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
  );
}

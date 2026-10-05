import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { smileIdConfigured } from "@/lib/smile-id";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { Stepper } from "@/components/ui/stepper";
import { VerifiedSeal } from "@/components/ui/verified-seal";
import { PhoneStep } from "./phone-step";
import { SelfieCheckStep } from "./selfie-check-step";
import { IdStep } from "./id-step";
import type { VerificationStage } from "@/lib/types/profile";

export const metadata: Metadata = {
  title: "Get verified",
  robots: { index: false, follow: false },
};

/**
 * Verification, in the order decided on 2026-10-05: phone, then photos,
 * then ONE selfie that does both the liveness check and the main-photo
 * match. The optional ID check follows Verified Real and is never nagged.
 *
 * The steps match profile-not-live.slim.html ("Phone · Photos · Selfie
 * check"). verify-overview.slim.html predates the reorder and marks its own
 * ring stepper "not yet design-approved", so the existing Stepper stays.
 *
 * Nothing on this screen reads a plan: verification is free on every tier.
 */
const STEPS = [
  { label: "Phone" },
  { label: "Photos" },
  { label: "Selfie check" },
  { label: "NIN or BVN", optional: true },
];

export default async function VerifyPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { count }, { data: check }] = await Promise.all([
    supabase.from("profiles").select("stage, display_name, pending_main_photo_id").eq("id", user.id).single(),
    supabase.from("profile_photos").select("id", { count: "exact", head: true }).eq("profile_id", user.id),
    supabase.rpc("main_photo_check"),
  ]);

  const stage: VerificationStage = profile?.stage ?? "unverified";
  const verified = stage === "verified_real" || stage === "id_confirmed";
  const photos = count ?? 0;
  const c = (check ?? {}) as { candidate_state?: string; candidate_reason?: string; check_running?: boolean };
  const photosReady = photos >= 4 && Boolean(profile?.pending_main_photo_id);
  const checking = Boolean(c.check_running) || c.candidate_state === "review";
  const retake = !verified && c.candidate_reason === "face_not_clear";

  const current = stage === "unverified" ? 0 : verified ? 3 : photosReady ? 2 : 1;

  return (
    <div className="mx-auto grid max-w-[560px] gap-6 px-5 py-section-y">
      <div className="grid gap-2">
        <h1 className="text-h3 text-ink-900">Get verified</h1>
        <p className="text-ui text-grey-600">
          Your phone, four photos, then one quick selfie. Your profile stays
          invisible until it passes — and nobody sees your face until
          we&rsquo;ve seen theirs.
        </p>
      </div>

      <Notice tone="info">
        Verification is free, on every plan, always. It is never part of a
        subscription.
      </Notice>

      <Stepper steps={STEPS} current={current} />

      {stage === "unverified" ? <PhoneStep /> : null}

      {stage !== "unverified" && !verified && (!photosReady || retake) ? (
        <Card className="grid gap-4 p-[26px]">
          <h2 className="text-h5 text-ink-900">
            {retake ? "We couldn't check your main photo" : "Add your photos"}
          </h2>
          <p className="text-ui text-grey-600">
            {retake
              ? "Your face wasn't clear enough in it to compare with your selfie. Choose another main photo, then take your selfie again."
              : `Four photos to go live, up to six — ${Math.min(photos, 4)} of 4 added. Only the main photo has to show your face.`}
          </p>
          <Button asChild className="justify-self-start">
            <Link href="/photos">{retake ? "Choose another photo" : "Add your photos"}</Link>
          </Button>
        </Card>
      ) : null}

      {stage !== "unverified" && !verified && photosReady && !retake ? (
        checking ? (
          <Card role="status" className="grid gap-2 p-[26px]">
            <h2 className="text-h5 text-ink-900">We&rsquo;re checking your selfie</h2>
            <p className="text-ui text-grey-600">
              This usually takes a minute — you can leave this page and
              we&rsquo;ll show the result here next time.
            </p>
          </Card>
        ) : (
          <SelfieCheckStep
            connected={smileIdConfigured()}
            devStandIn={process.env.NODE_ENV !== "production"}
          />
        )
      ) : null}

      {verified ? (
        <Card className="grid gap-4 p-[26px]">
          <Badge variant="verified" className="justify-self-start">
            Verified Real
          </Badge>
          <h2 className="text-h5 text-ink-900">You&rsquo;re Verified Real, {profile?.display_name}.</h2>
          <p className="text-ui text-grey-600">
            Your profile can now be seen by other members. Next, the prompts
            your matches actually read.
          </p>
          <Button asChild className="justify-self-start">
            <Link href="/profile">Set up your profile</Link>
          </Button>
        </Card>
      ) : null}

      {verified ? <IdStep alreadyConfirmed={stage === "id_confirmed"} /> : null}

      <Card className="grid gap-3 bg-paper p-[26px]">
        <span className="flex items-center gap-2.5">
          <VerifiedSeal size={16} className="text-green-550" />
          <span className="text-ui font-semibold text-ink-900">What we never do</span>
        </span>
        <ul className="grid list-none gap-2 p-0 text-ui text-grey-600">
          <li>Your NIN or BVN is never shown to another member.</li>
          <li>Your selfie and documents are never shown to another member, and Toastly never keeps them.</li>
          {/*
            Marital status is not verifiable by NIN, BVN or liveness. Married
            members are not welcome, but that is enforced by report-and-remove
            only — claiming to check it would undermine the one claim that is
            genuinely verifiable (PRD §5.2.1).
          */}
          <li>
            We don&rsquo;t check marital status — nobody can. Married members
            aren&rsquo;t welcome here, and that&rsquo;s enforced by reports, not
            a badge.
          </li>
        </ul>
      </Card>
    </div>
  );
}

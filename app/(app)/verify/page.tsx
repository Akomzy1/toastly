import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { Stepper } from "@/components/ui/stepper";
import { VerifiedSeal } from "@/components/ui/verified-seal";
import { PhoneStep } from "./phone-step";
import { LivenessStep } from "./liveness-step";
import { IdStep } from "./id-step";
import type { VerificationStage } from "@/lib/types/profile";

export const metadata: Metadata = {
  title: "Get verified",
  robots: { index: false, follow: false },
};

const STEPS = [
  { label: "Phone" },
  { label: "Liveness" },
  { label: "NIN or BVN", optional: true },
];

function stepIndex(stage: VerificationStage) {
  switch (stage) {
    case "unverified":
      return 0;
    case "phone_verified":
      return 1;
    default:
      return 2;
  }
}

export default async function VerifyPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("stage, display_name")
    .eq("id", user.id)
    .single();

  const stage: VerificationStage = profile?.stage ?? "unverified";
  const current = stepIndex(stage);
  const verified = stage === "verified_real" || stage === "id_confirmed";

  return (
    <div className="mx-auto grid max-w-[560px] gap-6 px-5 py-section-y">
      <div className="grid gap-2">
        <h1 className="text-h3 text-ink-900">Get verified</h1>
        <p className="text-ui text-grey-600">
          Phone, then a three-second selfie liveness check. Your profile stays
          invisible until it passes — and nobody sees your face until
          we&rsquo;ve seen theirs.
        </p>
      </div>

      {/* Verification is free on every tier. Nothing on this screen may
          mention a plan, a price or an upgrade. */}
      <Notice tone="info">
        Verification is free, on every plan, always. It is never part of a
        subscription.
      </Notice>

      <Stepper steps={STEPS} current={current} />

      {verified ? (
        <Card className="grid gap-4 p-[26px]">
          <Badge variant="verified" className="justify-self-start">
            Verified Real
          </Badge>
          <h2 className="text-h5 text-ink-900">
            You&rsquo;re verified, {profile?.display_name}.
          </h2>
          <p className="text-ui text-grey-600">
            Your seal is live. Next, set up your profile — the prompts are what
            your matches actually read.
          </p>
          <Button asChild className="justify-self-start">
            <Link href="/profile">Set up your profile</Link>
          </Button>
        </Card>
      ) : null}

      {stage === "unverified" ? <PhoneStep /> : null}
      {stage === "phone_verified" ? <LivenessStep /> : null}

      {/* The optional second ring stays available after verification, and is
          never presented as something missing. */}
      {verified ? (
        <IdStep alreadyConfirmed={stage === "id_confirmed"} />
      ) : null}

      <Card className="grid gap-3 bg-paper p-[26px]">
        <span className="flex items-center gap-2.5">
          <VerifiedSeal size={16} className="text-green-550" />
          <span className="text-ui font-semibold text-ink-900">
            What we never do
          </span>
        </span>
        <ul className="grid list-none gap-2 p-0 text-ui text-grey-600">
          <li>Your NIN or BVN is never shown to another member.</li>
          <li>Your documents are never shown to another member.</li>
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

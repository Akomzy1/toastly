import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhook } from "@/lib/smile-id";
import { combineOutcomes, onboardingOutcome, type ProviderStatus } from "@/lib/face-match";

/**
 * Smile ID webhook — main-photo face-match results (PRD §5.1.2).
 *
 * Each check is two jobs, Authentication and Compare, sharing a check id we
 * put in partner_params. The signature is verified before anything is read.
 * Only the verdict category and reason code are kept; the body carries
 * nothing else Toastly stores.
 *
 * When both jobs have reported, the combined outcome is recorded through
 * record_main_photo_match(), which swaps the main photo on a match, keeps it
 * with a person on review, and records the reason on a mismatch. A replaced
 * main photo's file is deleted here, since the database can't reach storage.
 */
type Callback = {
  status?: ProviderStatus;
  reason?: string | null;
  partner_params?: {
    job_id?: string;
    toastly_check_id?: string;
    toastly_step?: "authenticate" | "compare" | "onboard";
  };
};

const STATUSES: ProviderStatus[] = ["clear", "attention", "block", "error"];

export async function POST(request: NextRequest) {
  if (!verifyWebhook(request.headers)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const body = (await request.json()) as Callback;
  const checkId = body.partner_params?.toastly_check_id;
  const step = body.partner_params?.toastly_step;
  const status = body.status;
  if (!checkId || !step || !status || !STATUSES.includes(status)) {
    return NextResponse.json({ error: "unrecognised payload" }, { status: 400 });
  }

  // A webhook has no session: the service role, narrowly — this check's
  // job rows and the outcome function, nothing else.
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const { error: updateError } = await admin
    .from("face_match_jobs")
    .update({
      provider_status: status,
      provider_reason: body.reason ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("check_id", checkId)
    .eq("step", step);
  if (updateError) return NextResponse.json({ error: "unknown check" }, { status: 404 });

  const { data: jobs } = await admin
    .from("face_match_jobs")
    .select("step, photo_id, provider_status, provider_reason")
    .eq("check_id", checkId);

  // The onboarding selfie is one Compare that settles both Verified Real and
  // the main photo (decided 2026-10-05).
  const onboard = jobs?.find((j) => j.step === "onboard");
  if (onboard?.provider_status) {
    const r = onboardingOutcome({
      status: onboard.provider_status as ProviderStatus,
      reason: onboard.provider_reason,
    });
    const { error } = await admin.rpc("record_onboarding_check", {
      p_photo_id: onboard.photo_id,
      p_live: r.live,
      p_match: r.match.outcome,
      p_reason: r.match.outcome === "mismatch" ? r.match.reason : null,
    });
    if (error && !/not the pending main photo/.test(error.message)) {
      return NextResponse.json({ error: "could not record" }, { status: 500 });
    }
    return NextResponse.json({ received: true });
  }

  const auth = jobs?.find((j) => j.step === "authenticate");
  const compare = jobs?.find((j) => j.step === "compare");
  if (!auth?.provider_status || !compare?.provider_status) {
    return NextResponse.json({ received: true, waiting: true });
  }

  const result = combineOutcomes(
    { status: auth.provider_status as ProviderStatus, reason: auth.provider_reason },
    { status: compare.provider_status as ProviderStatus, reason: compare.provider_reason },
  );

  const { data: replacedPath, error: recordError } = await admin.rpc("record_main_photo_match", {
    p_photo_id: auth.photo_id,
    p_outcome: result.outcome,
    p_reason: result.outcome === "mismatch" ? result.reason : null,
  });

  // The member may have chosen a different photo while this one was being
  // checked; then this result no longer applies, and that is not an error.
  if (recordError && !/not the pending main photo/.test(recordError.message)) {
    return NextResponse.json({ error: "could not record" }, { status: 500 });
  }

  if (typeof replacedPath === "string" && replacedPath) {
    await admin.storage.from("profile-photos").remove([replacedPath]);
  }

  return NextResponse.json({ received: true });
}

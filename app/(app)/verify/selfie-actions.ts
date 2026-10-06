"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordConsent } from "@/lib/consent-record";
import { SANDBOX_IDENTITIES, sandboxPickerAllowed, smileConfig, submitAuthentication, submitCompare } from "@/lib/smile-id";

export type SelfieState = { error?: string; ok?: string } | null;

/** Attempts per member per 24 hours. Each one is a billed job (two for a replacement). */
const DAILY_ATTEMPTS = 5;

/**
 * The selfie checks (0029; decided 5 October 2026). Ported from
 * live-profile-and-prompt-14.
 *
 *   onboard  — photos first, then ONE selfie: SmartSelfie Compare against the
 *              main photo, enrolling the member. Settles Verified Real and the
 *              main photo together.
 *   replace  — a fresh selfie for a new main photo: Authentication (is it the
 *              enrolled member?) + Compare (is the photo them?). Never enrols.
 *
 * Consent is recorded first, with the version of the wording shown. The
 * selfie and liveness frames go straight to Smile ID in the request and are
 * never stored, logged or kept. Results arrive only on the signed callback
 * (app/api/smile-id/callback), which records outcomes — never images.
 *
 * NOTHING here reads a tier. Verification is free on every plan, always.
 */
/** The onboarding selfie, in useFormState's shape. */
export async function startOnboardingSelfie(_prev: SelfieState, formData: FormData): Promise<SelfieState> {
  return startSelfieCheck("onboard", formData);
}

export async function startSelfieCheck(mode: "onboard" | "replace", formData: FormData): Promise<SelfieState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  // The box on the consent panel (components/app/consent-panel.tsx).
  if (formData.get("agreed") !== "on") return { error: "Tick the box to agree before you start." };

  const { data: me } = await supabase
    .from("profiles")
    .select("display_name, stage, phone_verified_at, main_photo_id, pending_main_photo_id")
    .eq("id", user.id)
    .single();
  if (!me?.phone_verified_at) return { error: "Confirm your phone first." };
  const photoId = me.pending_main_photo_id as string | null;
  if (!photoId) return { error: mode === "onboard" ? "Choose your main photo first." : "Choose your new main photo first." };

  if (mode === "onboard") {
    const { data: status } = await supabase.rpc("live_profile_status");
    const s = status as { photo_count?: number; photos_min?: number } | null;
    // The candidate isn't counted until it matches, so four others or three
    // plus the main photo both qualify.
    if ((s?.photo_count ?? 0) + 1 < (s?.photos_min ?? 4)) return { error: "Add four photos first, including your main photo." };
  } else if (!me.main_photo_id) {
    return { error: "Your first main photo is checked during verification." };
  }

  const consent = await recordConsent(supabase, user.id, mode === "onboard" ? "verification_selfie" : "replace_main_photo");
  if (!consent.ok) return { error: "That didn't save. Try again." };

  const cfg = smileConfig();
  const admin = createAdminClient();
  if (!admin) return { error: "Selfie checks aren't available right now. Please try again later." };

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("verification_sessions")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", user.id)
    .not("photo_id", "is", null)
    .gte("created_at", since);
  if ((count ?? 0) >= DAILY_ATTEMPTS * (mode === "onboard" ? 1 : 2)) {
    return { error: "You've tried a few times today. Please try again tomorrow." };
  }

  // No Smile ID keys: production refuses; development records a stand-in pass
  // the way the callback would (a member's own session can't).
  if (!cfg) {
    if (process.env.NODE_ENV === "production") return { error: "Selfie checks aren't connected yet." };
    const { data: s } = await admin
      .from("verification_sessions")
      .insert({
        profile_id: user.id,
        product: mode === "onboard" ? "smartselfie" : "photo_match",
        environment: "sandbox",
        photo_id: photoId,
        step: mode === "onboard" ? "onboard" : "compare",
        status: "clear",
        passed: true,
        result_code: "dev_stand_in",
        completed_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (mode === "onboard" && s) {
      await admin.rpc("record_onboarding_check", { p_session: s.id, p_live: "passed", p_match: "matched", p_reason: null });
    } else {
      await admin.rpc("record_main_photo_match", { p_photo_id: photoId, p_outcome: "matched", p_reason: null });
    }
    revalidatePath("/verify");
    revalidatePath("/profile/photos");
    return { ok: "Matched (development stand-in — Smile ID isn't connected)." };
  }

  const selfie = formData.get("selfie");
  const frames = formData.getAll("liveness").filter((f): f is File => f instanceof File);
  if (!(selfie instanceof File) || frames.length < 6) return { error: "The selfie didn't come through. Try again." };

  // Who the check is for, as Smile ID requires (as main's hosted flow sends):
  // the display name, the surname from this form, the account email — or, in
  // the sandbox for allowed testers, one of Smile ID's test identities, which
  // decide the sandbox outcome. Sent to Smile ID only; nothing here stores them.
  const sandboxKey = String(formData.get("sandbox_identity") ?? "");
  const sandbox = sandboxPickerAllowed(cfg, user.email)
    ? SANDBOX_IDENTITIES.find((s) => s.key === sandboxKey && s.products.includes("smartselfie"))
    : undefined;
  const surname = String(formData.get("surname") ?? "").trim();
  if (!sandbox && (surname.length < 1 || surname.length > 60)) return { error: "Enter your surname." };
  if (!sandbox && !user.email) return { error: "Add an email address to your account first." };
  const userDetails = sandbox
    ? { given_names: sandbox.given_names, last_name: sandbox.last_name, email: sandbox.email }
    : { given_names: String(me.display_name ?? "").trim().slice(0, 80) || "Member", last_name: surname, email: user.email! };

  const { data: photo } = await admin.from("profile_photos").select("storage_path").eq("id", photoId).single();
  const { data: file } = photo ? await admin.storage.from("profile-photos").download(photo.storage_path) : { data: null };
  if (!file) return { error: "Your main photo couldn't be read. Try again." };

  const capture = { selfie, livenessFrames: frames };
  const agreed = { grantedAt: consent.agreedAt, language: "en" };
  const checkId = randomUUID();
  const steps = mode === "onboard" ? (["onboard"] as const) : (["authenticate", "compare"] as const);

  const { data: sessions, error: insertError } = await admin
    .from("verification_sessions")
    .insert(
      steps.map((step) => ({
        profile_id: user.id,
        product: mode === "onboard" ? "smartselfie" : "photo_match",
        environment: cfg.env,
        photo_id: photoId,
        step,
        check_id: checkId,
      })),
    )
    .select("id, step");
  if (insertError || !sessions) return { error: "Selfie checks aren't available right now. Please try again later." };
  const idFor = (step: string) => sessions.find((s) => s.step === step)!.id as string;

  try {
    if (mode === "onboard") {
      const job = await submitCompare(cfg, { sessionId: idFor("onboard"), profileId: user.id, capture, mainPhoto: file, consent: agreed, userDetails, enrol: true });
      await admin.from("verification_sessions").update({ status: "submitted", job_id: job, submitted_at: new Date().toISOString() }).eq("id", idFor("onboard"));
    } else {
      const [a, c] = await Promise.all([
        submitAuthentication(cfg, { sessionId: idFor("authenticate"), profileId: user.id, capture, consent: agreed, userDetails }),
        submitCompare(cfg, { sessionId: idFor("compare"), profileId: user.id, capture, mainPhoto: file, consent: agreed, userDetails, enrol: false }),
      ]);
      const at = new Date().toISOString();
      await admin.from("verification_sessions").update({ status: "submitted", job_id: a, submitted_at: at }).eq("id", idFor("authenticate"));
      await admin.from("verification_sessions").update({ status: "submitted", job_id: c, submitted_at: at }).eq("id", idFor("compare"));
    }
  } catch (e) {
    // A provider failure is never held against the member: the sessions are
    // closed as errors and they can try again.
    console.error("[selfie-check] submission failed:", (e as Error).message);
    await admin
      .from("verification_sessions")
      .update({ status: "error", result_code: "submission_failed", passed: false, completed_at: new Date().toISOString() })
      .eq("check_id", checkId);
    return { error: "We couldn't reach our verification provider. Please try again in a minute." };
  }

  revalidatePath("/verify");
  revalidatePath("/profile/photos");
  return { ok: "Checking." };
}

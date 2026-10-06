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

type Mode = "onboard" | "replace" | "reverify";

/**
 * The selfie checks (0029; decided 5 and 6 October 2026). Every selfie runs
 * here, in the page — the hosted selfie is retired; it stays for the ID check.
 *
 *   onboard   — photos first, then ONE selfie: SmartSelfie Compare against the
 *               main photo, ENROLLING the member's face under their member id.
 *               Settles Verified Real and the main photo together.
 *   replace   — a fresh selfie for a new main photo: Authentication (is it the
 *               enrolled member?) + Compare (is the photo them?). Never enrols.
 *   reverify  — a re-check a reviewer asked for: Authentication only, against
 *               the enrolled face. Never enrols.
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

/** A re-verification selfie, in useFormState's shape. */
export async function startReverifySelfie(_prev: SelfieState, formData: FormData): Promise<SelfieState> {
  return startSelfieCheck("reverify", formData);
}

const CONSENT_KIND = { onboard: "verification_selfie", replace: "replace_main_photo", reverify: "reverify_selfie" } as const;
const STEPS = { onboard: ["onboard"], replace: ["authenticate", "compare"], reverify: ["reverify"] } as const;

export async function startSelfieCheck(mode: Mode, formData: FormData): Promise<SelfieState> {
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

  let photoId: string | null = null;
  if (mode === "reverify") {
    // Only when a reviewer asked (0025), and only for a face that's enrolled —
    // which, since 0029's reset, is every Verified Real member.
    const { data: asked } = await supabase.from("reverification_requests").select("profile_id").maybeSingle();
    if (!asked || (me.stage !== "verified_real" && me.stage !== "id_confirmed")) {
      return { error: "There's nothing to re-check on your account." };
    }
    // After three mismatches in 24 hours a person looks instead (0029).
    const { data: last } = await supabase
      .from("verification_sessions")
      .select("status")
      .eq("profile_id", user.id)
      .eq("step", "reverify")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last?.status === "attention") return { error: "A person on our team is taking a look. We'll show the result here." };
  } else {
    photoId = me.pending_main_photo_id as string | null;
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
  }

  const consent = await recordConsent(supabase, user.id, CONSENT_KIND[mode]);
  if (!consent.ok) return { error: "That didn't save. Try again." };

  const cfg = smileConfig();
  const admin = createAdminClient();
  if (!admin) return { error: "Selfie checks aren't available right now. Please try again later." };

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("verification_sessions")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", user.id)
    .not("step", "is", null)
    .gte("created_at", since);
  if ((count ?? 0) >= DAILY_ATTEMPTS * STEPS[mode].length) {
    return { error: "You've tried a few times today. Please try again tomorrow." };
  }

  const product = mode === "replace" ? "photo_match" : "smartselfie";

  // No Smile ID keys: production refuses; development records a stand-in pass
  // the way the callback would (a member's own session can't).
  if (!cfg) {
    if (process.env.NODE_ENV === "production") return { error: "Selfie checks aren't connected yet." };
    const { data: s } = await admin
      .from("verification_sessions")
      .insert({
        profile_id: user.id,
        product,
        environment: "sandbox",
        photo_id: photoId,
        step: mode === "replace" ? "compare" : mode,
        // A re-check is settled by an update below, as the callback settles it.
        ...(mode === "reverify"
          ? { status: "submitted" }
          : { status: "clear", passed: true, result_code: "dev_stand_in", completed_at: new Date().toISOString() }),
      })
      .select("id")
      .single();
    if (mode === "onboard" && s) {
      await admin.rpc("record_onboarding_check", { p_session: s.id, p_live: "passed", p_match: "matched", p_reason: null });
    } else if (mode === "replace") {
      await admin.rpc("record_main_photo_match", { p_photo_id: photoId, p_outcome: "matched", p_reason: null });
    } else if (s) {
      // Passing is an update, as from the callback: that's what clears the
      // reviewer's request (0026's reverification_passed fires on update).
      await admin
        .from("verification_sessions")
        .update({ status: "clear", passed: true, result_code: "dev_stand_in", completed_at: new Date().toISOString() })
        .eq("id", s.id);
      await admin.from("profiles").update({ liveness_verified_at: new Date().toISOString() }).eq("id", user.id);
    }
    revalidatePath("/verify");
    revalidatePath("/profile/photos");
    return { ok: "Matched (development stand-in — Smile ID isn't connected)." };
  }

  const selfie = formData.get("selfie");
  const frames = formData.getAll("liveness").filter((f): f is File => f instanceof File);
  if (!(selfie instanceof File) || frames.length < 6) return { error: "The selfie didn't come through. Try again." };

  // Who the check is for, as Smile ID requires: the display name, the surname
  // from this form, the account email — or, in the sandbox for allowed
  // testers, one of Smile ID's test identities, which decide the sandbox
  // outcome. Sent to Smile ID only; nothing here stores them.
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

  let mainPhoto: Blob | null = null;
  if (photoId) {
    const { data: photo } = await admin.from("profile_photos").select("storage_path").eq("id", photoId).single();
    const { data: file } = photo ? await admin.storage.from("profile-photos").download(photo.storage_path) : { data: null };
    if (!file) return { error: "Your main photo couldn't be read. Try again." };
    mainPhoto = file;
  }

  const capture = { selfie, livenessFrames: frames };
  const agreed = { grantedAt: consent.agreedAt, language: "en" };
  const checkId = randomUUID();

  const { data: sessions, error: insertError } = await admin
    .from("verification_sessions")
    .insert(
      STEPS[mode].map((step) => ({
        profile_id: user.id,
        product,
        environment: cfg.env,
        photo_id: photoId,
        step,
        check_id: checkId,
      })),
    )
    .select("id, step");
  if (insertError || !sessions) return { error: "Selfie checks aren't available right now. Please try again later." };
  const idFor = (step: string) => sessions.find((s) => s.step === step)!.id as string;
  const submitted = (step: string, job: string) =>
    admin.from("verification_sessions").update({ status: "submitted", job_id: job, submitted_at: new Date().toISOString() }).eq("id", idFor(step));

  try {
    if (mode === "onboard") {
      const job = await submitCompare(cfg, { sessionId: idFor("onboard"), profileId: user.id, capture, mainPhoto: mainPhoto!, consent: agreed, userDetails, enrol: true });
      await submitted("onboard", job);
    } else if (mode === "reverify") {
      const job = await submitAuthentication(cfg, { sessionId: idFor("reverify"), profileId: user.id, capture, consent: agreed, userDetails });
      await submitted("reverify", job);
    } else {
      const [a, c] = await Promise.all([
        submitAuthentication(cfg, { sessionId: idFor("authenticate"), profileId: user.id, capture, consent: agreed, userDetails }),
        submitCompare(cfg, { sessionId: idFor("compare"), profileId: user.id, capture, mainPhoto: mainPhoto!, consent: agreed, userDetails, enrol: false }),
      ]);
      await submitted("authenticate", a);
      await submitted("compare", c);
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

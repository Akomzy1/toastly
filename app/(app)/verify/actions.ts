"use server";

import { createHash, createHmac, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { capture } from "@/lib/analytics";
import { recordConsent } from "@/lib/consent-record";
import { smileIdConfigured, submitCompare } from "@/lib/smile-id";

export type VerifyState = { error?: string; ok?: string } | null;

/**
 * Verification.
 *
 * NOTHING in this file reads a tier, an entitlement or a payment state.
 * Verification is free on every tier, always, and must never be paywalled
 * (CLAUDE.md). If a tier check ever appears below, it is a bug.
 *
 * The phone number is hashed before storage. After verification the raw
 * number has no further use, and keeping it would put a contactable
 * identifier next to a dating profile for no product reason.
 */
function hashPhone(e164: string) {
  const pepper = process.env.PHONE_HASH_PEPPER;

  // Without a pepper this is a plain SHA-256 of a phone number, and the
  // phone-number space is small enough to enumerate exhaustively — anyone
  // who could read phone_identities could recover every member's number.
  // Refusing to run is the correct behaviour: a silently weak hash is worse
  // than a loud failure, because nobody finds out until it matters.
  if (!pepper) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "PHONE_HASH_PEPPER is not set. Refusing to hash phone numbers without it.",
      );
    }
    console.warn(
      "[verify] PHONE_HASH_PEPPER is not set — phone hashes are unsalted. Development only.",
    );
  }

  return createHash("sha256").update(`${e164}:${pepper ?? ""}`).digest("hex");
}

/**
 * The ID-number fingerprint: HMAC-SHA256 with a server-only key, so the
 * stored value can't be reversed — the NIN/BVN space is small enough that a
 * plain hash could be. Refuses to run in production without the key, for
 * the same reason as the phone pepper above.
 */
function idFingerprint(digits: string) {
  const key = process.env.ID_FINGERPRINT_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ID_FINGERPRINT_KEY is not set. Refusing to fingerprint ID numbers without it.");
    }
    console.warn("[verify] ID_FINGERPRINT_KEY is not set — using a development key.");
  }
  return createHmac("sha256", key ?? "development-only-id-key").update(digits).digest("hex");
}

/** Very light E.164 normalisation for NG and common diaspora codes. */
function normalisePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  if (/^\+\d{10,15}$/.test(digits)) return digits;
  if (/^0\d{10}$/.test(digits)) return `+234${digits.slice(1)}`; // NG local
  return null;
}

export async function startPhoneVerification(
  _prev: VerifyState,
  formData: FormData,
): Promise<VerifyState> {
  const phone = normalisePhone(String(formData.get("phone") ?? ""));
  if (!phone) {
    return { error: "Enter a phone number we can reach, including the code." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  // One number, one account, permanently — this is what makes a block stick.
  // phone_in_use() answers yes or no and nothing else (0014); the hashes
  // themselves are never readable by a member.
  const { data: taken } = await supabase.rpc("phone_in_use", {
    p_phone_hash: hashPhone(phone),
  });

  if (taken === true) {
    return { error: "That number is already verified on another account." };
  }

  const { error } = await supabase.auth.updateUser({ phone });
  if (error) return { error: error.message };

  return { ok: "We've sent you a code." };
}

export async function confirmPhoneCode(
  _prev: VerifyState,
  formData: FormData,
): Promise<VerifyState> {
  const phone = normalisePhone(String(formData.get("phone") ?? ""));
  const token = String(formData.get("code") ?? "").trim();
  if (!phone || !token) return { error: "Enter the code we sent you." };

  const supabase = createClient();
  const { error } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: "phone_change",
  });
  if (error) return { error: "That code didn't work. Try again." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  // Binding the number and recording the stage are server-owned (0013,
  // 0014). The hash is computed here from the number Supabase Auth has just
  // confirmed — never accepted from the client — and written with the
  // service role, so nobody can register a junk hash to keep their real
  // number free for a second account.
  const confirmed = user.phone ? `+${user.phone.replace(/^\+/, "")}` : phone;
  const admin = createAdminClient();
  if (!admin) return { error: "Phone confirmation isn't connected yet." };

  const { error: bindError } = await admin.rpc("record_phone_verified", {
    p_profile_id: user.id,
    p_phone_hash: hashPhone(confirmed),
  });
  if (bindError?.message.includes("phone_in_use")) {
    return { error: "That number is already verified on another account." };
  }
  if (bindError?.message.includes("account_has_other_phone")) {
    return {
      error:
        "Your account is already verified with a different number. Contact support to change it.",
    };
  }
  if (bindError) return { error: "We couldn't confirm that number. Try again." };

  revalidatePath("/verify");
  return { ok: "Phone confirmed." };
}

/**
 * The onboarding selfie — ONE check for both Verified Real and the main
 * photo (decided 2026-10-05: photos first, then one selfie).
 *
 * Consent is recorded first, with the version of the wording shown
 * (lib/consent.ts); without it the check doesn't run. The selfie and its
 * liveness frames go straight to Smile ID — a single Compare against the
 * main photo, which also enrols the member under their profile id for any
 * later main-photo change — and are never stored.
 */
export async function startSelfieCheck(
  _prev: VerifyState,
  formData: FormData,
): Promise<VerifyState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  const { data: me } = await supabase
    .from("profiles")
    .select("phone_verified_at, pending_main_photo_id")
    .eq("id", user.id)
    .single();
  if (!me?.phone_verified_at) return { error: "Confirm your phone first." };
  const photoId = me.pending_main_photo_id as string | null;
  if (!photoId) return { error: "Add your main photo first." };

  const { count } = await supabase
    .from("profile_photos")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", user.id);
  if ((count ?? 0) < 4) return { error: "Add four photos first, including your main photo." };

  const consent = await recordConsent(supabase, user.id, "verification_selfie", formData);
  if (!consent.ok) return { error: "Tick the box to agree before you start." };

  const admin = createAdminClient();

  if (!smileIdConfigured()) {
    if (process.env.NODE_ENV === "production" || !admin) {
      return { error: "Selfie checks aren't connected yet, so this step can't be completed." };
    }
    // Development stand-in for Smile ID's result, written as the webhook
    // would: a member's session cannot set `stage` or a face match (0013).
    await admin.rpc("record_onboarding_check", {
      p_photo_id: photoId,
      p_live: "passed",
      p_match: "matched",
    });
    await capture("verification_complete", user.id, { stage: "verified_real" });
    revalidatePath("/verify");
    return { ok: "Matched (development stand-in — Smile ID isn't connected)." };
  }

  if (!admin) return { error: "Selfie checks aren't connected yet." };

  const selfie = formData.get("selfie");
  const frames = formData.getAll("liveness").filter((f): f is File => f instanceof File);
  if (!(selfie instanceof File) || frames.length < 6) {
    return { error: "The selfie didn't come through. Try again." };
  }

  const { data: photo } = await supabase
    .from("profile_photos")
    .select("storage_path")
    .eq("id", photoId)
    .single();
  const { data: file } = photo
    ? await admin.storage.from("profile-photos").download(photo.storage_path)
    : { data: null };
  if (!file) return { error: "Your main photo couldn't be read. Try again." };

  const checkId = randomUUID();
  await admin.from("face_match_jobs").insert({
    profile_id: user.id,
    photo_id: photoId,
    check_id: checkId,
    step: "onboard",
  });

  try {
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://trytoastly.com";
    const jobId = await submitCompare({
      checkId,
      profileId: user.id,
      capture: { selfie, livenessFrames: frames },
      mainPhoto: file,
      consent: { grantedAt: consent.agreedAt, language: "en" },
      callbackUrl: `${site}/api/webhooks/smile-id`,
      step: "onboard",
      enrol: true,
    });
    await admin.from("face_match_jobs").update({ provider_job_id: jobId }).eq("check_id", checkId);
  } catch {
    // A provider failure is never held against the member.
    await admin.rpc("record_onboarding_check", { p_photo_id: photoId, p_live: "review", p_match: "review" });
  }

  revalidatePath("/verify");
  return { ok: "Checking." };
}

/**
 * NIN / BVN — the optional second ring.
 *
 * Optional forever. A member is fully functional without it, and the number
 * is never displayed to anyone. Consent (id_check) is recorded first. The
 * check itself — Smile ID Biometric KYC with a new selfie — is not wired.
 */
export async function submitIdNumber(
  _prev: VerifyState,
  formData: FormData,
): Promise<VerifyState> {
  const value = String(formData.get("id_number") ?? "").replace(/\D/g, "");
  if (value.length !== 11) {
    return { error: "A NIN or BVN is 11 digits." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  const consent = await recordConsent(supabase, user.id, "id_check", formData);
  if (!consent.ok) return { error: "Tick the box to agree before you continue." };

  if (process.env.NODE_ENV === "production") {
    return { error: "ID confirmation isn't connected yet." };
  }

  // The number itself is never stored. What IS kept is a one-way, keyed
  // fingerprint of it (decided 2026-10-05; consent wording §3), so one ID
  // can't verify more than one account and a removed member can't return.
  // Development stand-in for the pass itself, written as the server would.
  const admin = createAdminClient();
  if (!admin) return { error: "SUPABASE_SERVICE_ROLE_KEY isn't set." };
  const { error: fpError } = await admin.rpc("record_id_fingerprint", {
    p_profile_id: user.id,
    p_fingerprint: idFingerprint(value),
  });
  if (fpError?.message.includes("id_in_use")) {
    return { error: "That ID is already verified on another account." };
  }
  if (fpError) return { error: "Your ID couldn't be checked. Try again." };
  await admin
    .from("profiles")
    .update({
      stage: "id_confirmed",
      id_confirmed_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  revalidatePath("/verify");
  return { ok: "Second ring added to your seal." };
}


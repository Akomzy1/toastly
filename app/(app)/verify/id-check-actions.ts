"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordConsent } from "@/lib/consent-record";
import {
  ID_NUMBER_PATTERN,
  SANDBOX_IDENTITIES,
  SMILE_ID_TYPES,
  hashIdNumber,
  sandboxPickerAllowed,
  smileConfig,
  submitAuthentication,
  submitBiometricKyc,
  type SmileIdType,
} from "@/lib/smile-id";

export type IdCheckState = { error?: string; ok?: string } | null;

/** Checks per member per 24 hours. Each is two billed jobs. */
const DAILY_CHECKS = 5;

/**
 * The optional ID check, in the page (decided 6 October 2026). Smile ID's
 * hosted flow is retired: it can't check the selfie against the face the
 * member registered at onboarding, and the second ring now requires that.
 *
 * ONE capture from Smile ID's camera, two jobs:
 *   id_kyc   Biometric KYC — the number is on the official record (NG) and
 *            the selfie matches the photo on it.
 *   id_auth  Authentication — the same selfie is the face registered under
 *            this member's id at onboarding.
 * The ring is granted only when both are clear (record_id_check, 0029).
 *
 * The ID number is hashed here, in memory, and sent to Smile ID; it is never
 * stored or logged. The names on the ID go to Smile ID only. The selfie and
 * frames pass straight through. Results arrive only on the signed callback.
 *
 * NOTHING here reads a tier. Verification is free on every plan, always.
 */
export async function startIdCheck(_prev: IdCheckState, formData: FormData): Promise<IdCheckState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };
  if (formData.get("agreed") !== "on") return { error: "Tick the box to agree before you start." };

  const { data: me } = await supabase.from("profiles").select("stage").eq("id", user.id).single();
  if (me?.stage !== "verified_real") return { error: "The ID check opens once you're Verified Real." };

  const idType = SMILE_ID_TYPES.find((t) => t === formData.get("id_type")) as SmileIdType | undefined;
  const raw = String(formData.get("id_number") ?? "").replace(/\s+/g, "");
  if (!idType || !ID_NUMBER_PATTERN[idType].test(raw)) return { error: "That number isn't in the right format. Check it and try again." };
  const idNumber = idType === "V_NIN" ? raw.toUpperCase() : raw;

  const cfg = smileConfig();
  const admin = createAdminClient();
  if (!cfg || !admin) return { error: "The ID check isn't available right now. Please try again later." };

  // Names, as Smile ID requires — or a sandbox test identity for testers.
  const sandboxKey = String(formData.get("sandbox_identity") ?? "");
  const sandbox = sandboxPickerAllowed(cfg, user.email)
    ? SANDBOX_IDENTITIES.find((s) => s.key === sandboxKey && s.products.includes("biometric_kyc"))
    : undefined;
  const givenNames = String(formData.get("given_names") ?? "").trim();
  const surname = String(formData.get("surname") ?? "").trim();
  if (!sandbox && (givenNames.length < 1 || givenNames.length > 80)) return { error: "Enter your first name as it appears on your ID." };
  if (!sandbox && (surname.length < 1 || surname.length > 60)) return { error: "Enter your surname as it appears on your ID." };
  if (!sandbox && !user.email) return { error: "Add an email address to your account first." };
  const userDetails = sandbox
    ? { given_names: sandbox.given_names, last_name: sandbox.last_name, email: sandbox.email }
    : { given_names: givenNames, last_name: surname, email: user.email! };

  const selfie = formData.get("selfie");
  const frames = formData.getAll("liveness").filter((f): f is File => f instanceof File);
  if (!(selfie instanceof File) || frames.length < 6) return { error: "The selfie didn't come through. Try again." };

  // One ID, one account — checked before anything is sent or billed.
  const { data: key, error: keyError } = await admin.rpc("id_number_hmac_key");
  if (keyError || typeof key !== "string") return { error: "The ID check isn't available right now. Please try again later." };
  const idHash = hashIdNumber(key, idType, idNumber);
  const [{ data: taken }, { data: blocked }] = await Promise.all([
    admin.from("verified_id_hashes").select("profile_id").eq("id_hash", idHash).maybeSingle(),
    admin.from("blocked_id_hashes").select("id_hash").eq("id_hash", idHash).maybeSingle(),
  ]);
  if (blocked || (taken && taken.profile_id !== user.id)) {
    return { error: "This ID can't be used to verify this account. If you think that's a mistake, email support@trytoastly.com." };
  }

  const consent = await recordConsent(supabase, user.id, "id_check");
  if (!consent.ok) return { error: "That didn't save. Try again." };

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("verification_sessions")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", user.id)
    .eq("step", "id_kyc")
    .gte("created_at", since);
  if ((count ?? 0) >= DAILY_CHECKS) return { error: "You've tried a few times today. Please try again tomorrow." };

  const checkId = randomUUID();
  const { data: sessions, error: insertError } = await admin
    .from("verification_sessions")
    .insert([
      { profile_id: user.id, product: "biometric_kyc", environment: cfg.env, step: "id_kyc", check_id: checkId, id_type: idType, id_hash: idHash },
      { profile_id: user.id, product: "biometric_kyc", environment: cfg.env, step: "id_auth", check_id: checkId },
    ])
    .select("id, step");
  if (insertError || !sessions) return { error: "The ID check isn't available right now. Please try again later." };
  const idFor = (step: string) => sessions.find((s) => s.step === step)!.id as string;

  const capture = { selfie, livenessFrames: frames };
  const agreed = { grantedAt: consent.agreedAt, language: "en" };
  try {
    const [k, a] = await Promise.all([
      submitBiometricKyc(cfg, { sessionId: idFor("id_kyc"), profileId: user.id, capture, consent: agreed, userDetails, idType, idNumber }),
      submitAuthentication(cfg, { sessionId: idFor("id_auth"), profileId: user.id, capture, consent: agreed, userDetails }),
    ]);
    const at = new Date().toISOString();
    await admin.from("verification_sessions").update({ status: "submitted", job_id: k, submitted_at: at }).eq("id", idFor("id_kyc"));
    await admin.from("verification_sessions").update({ status: "submitted", job_id: a, submitted_at: at }).eq("id", idFor("id_auth"));
  } catch (e) {
    // Never held against the member: both halves close as errors.
    console.error("[id-check] submission failed:", (e as Error).message);
    await admin
      .from("verification_sessions")
      .update({ status: "error", result_code: "submission_failed", passed: false, id_hash: null, completed_at: new Date().toISOString() })
      .eq("check_id", checkId);
    return { error: "We couldn't reach our verification provider. Please try again in a minute." };
  }

  revalidatePath("/verify");
  return { ok: "Checking." };
}

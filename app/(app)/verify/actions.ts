"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
  const pepper = process.env.PHONE_HASH_PEPPER ?? "";
  return createHash("sha256").update(`${e164}:${pepper}`).digest("hex");
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
  const hash = hashPhone(phone);
  const { data: taken } = await supabase
    .from("phone_identities")
    .select("profile_id")
    .eq("phone_hash", hash)
    .maybeSingle();

  if (taken && taken.profile_id !== user.id) {
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

  await supabase.from("phone_identities").upsert({
    phone_hash: hashPhone(phone),
    profile_id: user.id,
  });

  await supabase
    .from("profiles")
    .update({ stage: "phone_verified", phone_verified_at: new Date().toISOString() })
    .eq("id", user.id);

  revalidatePath("/verify");
  return { ok: "Phone confirmed." };
}

/**
 * Liveness.
 *
 * NOT IMPLEMENTED — this records the result, it does not perform the check.
 * A three-second liveness capture matched against profile photos needs a
 * vendor SDK and a server-side decision; wiring one is its own piece of work
 * and is not something to fake. The screen and the state machine are real so
 * the rest of the flow can be built and tested; the capture itself must be
 * replaced before launch.
 */
export async function recordLiveness(
  _prev: VerifyState,
  _formData: FormData,
): Promise<VerifyState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  if (process.env.NODE_ENV === "production") {
    return {
      error:
        "Liveness checks aren't connected yet. This step can't be completed.",
    };
  }

  await supabase
    .from("profiles")
    .update({
      stage: "verified_real",
      liveness_verified_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  revalidatePath("/verify");
  return { ok: "Liveness passed. Your Verified Real seal is live." };
}

/**
 * NIN / BVN — the optional second ring.
 *
 * Optional forever. A member is fully functional on phone and liveness
 * alone, and the number is never displayed to anyone. Like liveness, the
 * check itself is not implemented here.
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

  if (process.env.NODE_ENV === "production") {
    return { error: "ID confirmation isn't connected yet." };
  }

  // The number itself is deliberately not stored: only the fact of a pass.
  await supabase
    .from("profiles")
    .update({
      stage: "id_confirmed",
      id_confirmed_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  revalidatePath("/verify");
  return { ok: "Second ring added to your seal." };
}

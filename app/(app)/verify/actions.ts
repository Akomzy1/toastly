"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type VerifyState = { error?: string; ok?: string } | null;

const PHONE_UNAVAILABLE = "Phone verification isn't available right now. Please try again later.";

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
  // hashPhone refuses to run without the pepper in production. Say so
  // plainly instead of crashing the page; the log names the cause.
  let hash: string;
  try {
    hash = hashPhone(phone);
  } catch (e) {
    console.error("[verify] phone hashing unavailable:", (e as Error).message);
    return { error: PHONE_UNAVAILABLE };
  }

  // An account removed for breaking the rules keeps its number blocked for
  // the retention period, even after deletion (0015).
  const { data: blocked } = await supabase.rpc("is_phone_blocked", { p_hash: hash });
  if (blocked === true) {
    return {
      error: "That number can't be used to verify a new account. If you think this is a mistake, email support@trytoastly.com.",
    };
  }
  const { data: taken } = await supabase
    .from("phone_identities")
    .select("profile_id")
    .eq("phone_hash", hash)
    .maybeSingle();

  if (taken && taken.profile_id !== user.id) {
    return { error: "That number is already verified on another account." };
  }

  const { error } = await supabase.auth.updateUser({ phone });
  if (error) {
    // Most often: no SMS provider configured in Supabase Auth. The raw
    // message is for the logs, not the member.
    console.error("[verify] sending phone code failed:", error.message);
    return { error: "We couldn't send a code right now. Please try again later." };
  }

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

  let phoneHash: string;
  try {
    phoneHash = hashPhone(phone);
  } catch (e) {
    console.error("[verify] phone hashing unavailable:", (e as Error).message);
    return { error: PHONE_UNAVAILABLE };
  }
  await supabase.from("phone_identities").upsert({
    phone_hash: phoneHash,
    profile_id: user.id,
  });

  await supabase
    .from("profiles")
    .update({ stage: "phone_verified", phone_verified_at: new Date().toISOString() })
    .eq("id", user.id);

  revalidatePath("/verify");
  return { ok: "Phone confirmed." };
}

// Liveness and the ID check run through Smile ID: see app/api/smile-id/.
// Their results are written only by the signed callback, never by an action.

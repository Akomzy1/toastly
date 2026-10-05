"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { capture } from "@/lib/analytics";

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

  // Development stand-in for the vendor's server-to-server result, so it
  // writes as the server would: a member's session cannot set `stage` (0013).
  const admin = createAdminClient();
  if (!admin) return { error: "SUPABASE_SERVICE_ROLE_KEY isn't set." };
  await admin
    .from("profiles")
    .update({
      stage: "verified_real",
      liveness_verified_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  // Funnel step two. The badge is the product's central claim, so the drop-off
  // between signup and this event is the number that matters most.
  await capture("verification_complete", user.id, { stage: "verified_real" });

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
  // Written as the server would, like the liveness stand-in above.
  const admin = createAdminClient();
  if (!admin) return { error: "SUPABASE_SERVICE_ROLE_KEY isn't set." };
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

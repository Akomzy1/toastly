"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CODE_COUNTRY_UNAVAILABLE, CODE_SEND_FAILED, isNigerianNumber } from "@/lib/sms-codes";
import { BETA_INVITE_ONLY_MESSAGE, betaPepper, betaPhoneKey, checkBetaGate } from "@/lib/beta";

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

  // The beta is invite-only (BETA_INVITE_ONLY=true): a number that isn't an
  // approved application gets no code, and is told so in one fixed sentence
  // whatever the reason — never applied, waiting, waitlisted — so it can't be
  // used to find out whether a number applied. Asked first, before Supabase
  // is, so an unapproved number never reaches the SMS provider. (The Send SMS
  // hook asks again: a browser can ask Supabase for a code directly.)
  const gate = await checkBetaGate(phone, {
    env: process.env,
    isApproved: async (phoneKey) => {
      const admin = createAdminClient();
      if (!admin) throw new Error("not configured");
      const { data, error } = await admin.rpc("beta_number_approved", { p_phone_key: phoneKey });
      if (error) throw new Error("gate failed");
      return data === true;
    },
  });
  if (!gate.allowed) {
    return { error: gate.reason === "invite_only" ? BETA_INVITE_ONLY_MESSAGE : PHONE_UNAVAILABLE };
  }

  // Once codes go through the Send SMS hook (SMS_CODES_VIA_HOOK=true, set the
  // moment the hook is switched on in Supabase), only +234 numbers can be sent
  // one until the Twilio Verify route ships. Said here, before Supabase is
  // asked, so a member abroad gets a plain message and not a failed send. This
  // is the delivery route only: diaspora status comes from the profile country.
  if (process.env.SMS_CODES_VIA_HOOK === "true" && !isNigerianNumber(phone)) {
    return { error: CODE_COUNTRY_UNAVAILABLE };
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
  // Yes or no, never whose (0028). Reading phone_identities directly always
  // came back empty — members can't read it — so this never fired before.
  const { data: taken } = await supabase.rpc("phone_in_use", { p_hash: hash });
  if (taken === true) {
    return { error: "That number is already verified on another account." };
  }

  const { error } = await supabase.auth.updateUser({ phone });
  if (error) {
    // Most often: no SMS provider configured in Supabase Auth. The raw
    // message is for the logs, not the member.
    console.error("[verify] sending phone code failed:", error.message);
    return { error: CODE_SEND_FAILED };
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
  // Bind the number to the account (0028). Members can't write
  // phone_identities, so this goes through the service role; before 0028 the
  // member's own upsert failed silently and no number was ever bound.
  const admin = createAdminClient();
  if (!admin) {
    console.error("[verify] SUPABASE_SERVICE_ROLE_KEY is not set; can't bind the phone number.");
    return { error: PHONE_UNAVAILABLE };
  }
  // In the same transaction: if this number is an approved beta application,
  // mark it used and (while the beta is open) make the member a founding
  // member (0050). Nothing about it reaches the member, the feed or analytics.
  const pepper = betaPepper(process.env);
  const { data: bound, error: bindError } = await admin.rpc("record_phone_verified_beta", {
    p_profile: user.id,
    p_hash: phoneHash,
    p_beta_key: pepper ? betaPhoneKey(phone, pepper) : null,
  });
  if (bindError) {
    console.error("[verify] binding the phone failed:", bindError.message);
    return { error: PHONE_UNAVAILABLE };
  }
  if (bound === "in_use") return { error: "That number is already verified on another account." };
  if (bound === "blocked") {
    return {
      error: "That number can't be used to verify a new account. If you think this is a mistake, email support@trytoastly.com.",
    };
  }

  await supabase
    .from("profiles")
    .update({ stage: "phone_verified", phone_verified_at: new Date().toISOString() })
    .eq("id", user.id);

  revalidatePath("/verify");
  return { ok: "Phone confirmed." };
}

// Liveness and the ID check run through Smile ID: see app/api/smile-id/.
// Their results are written only by the signed callback, never by an action.

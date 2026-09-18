"use server";

import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendEmergencyContactChanged } from "@/lib/email";
import { sendSms, smsConfigured, toE164 } from "@/lib/sms";

export type EmergencyState = { error?: string; ok?: string } | null;

/**
 * The emergency contact — decision (d).
 *
 * This reverses 0007's original posture, which stored no trusted-contact
 * number at all. A panic alert has to be deliverable when the member cannot
 * reach their own phone, and a number nobody confirmed is a number that fails
 * at the worst possible moment.
 *
 * Constraints that hold here:
 *   - free on every tier; nothing in this file reads a plan;
 *   - the contact is never a matching input and is never shown to any other
 *     member;
 *   - SMS to this number is only ever the confirmation code and alerts the
 *     member triggers. It is never a call path (CLAUDE.md).
 */

const CODE_TTL_MINUTES = 15;
const MAX_ATTEMPTS = 5;

/**
 * The code is stored as a peppered hash, like phone identities. Refusing to
 * run without a pepper is deliberate: an unpeppered six-digit hash is a
 * lookup table, and a silently weak one is worse than a loud failure.
 */
function hashCode(code: string): string {
  const pepper = process.env.PHONE_HASH_PEPPER;
  if (!pepper) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "PHONE_HASH_PEPPER is not set. Refusing to hash confirmation codes without it.",
      );
    }
    console.warn(
      "[emergency] PHONE_HASH_PEPPER is not set — code hashes are unsalted. Development only.",
    );
  }
  return createHash("sha256").update(`${code}:${pepper ?? ""}`).digest("hex");
}

async function signedIn() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function saveEmergencyContact(
  _prev: EmergencyState,
  formData: FormData,
): Promise<EmergencyState> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };

  const label = String(formData.get("label") ?? "").trim();
  const phone = toE164(String(formData.get("phone") ?? ""));

  if (label.length < 1) return { error: "Who is this? A first name is enough." };
  if (!phone) {
    return { error: "Enter a number we can text, including the country code." };
  }
  if (!smsConfigured(phone)) {
    return {
      error:
        "We can't send confirmation texts yet, so we won't store a number we can't reach. Use share-your-date in the meantime — it sends from your own phone.",
    };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");

  const { error } = await supabase.from("emergency_contacts").upsert({
    profile_id: user.id,
    label,
    phone_e164: phone,
    confirmed_at: null,
    code_hash: hashCode(code),
    code_expires_at: new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString(),
    attempts: 0,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };

  const sent = await sendSms(
    phone,
    `${label}, ${code} is the code to confirm you as a Toastly emergency contact. If you weren't expecting this, you can ignore it.`,
  );
  if (!sent.sent) {
    return {
      error:
        "We couldn't send the text. Check the number and try again — nothing is confirmed yet.",
    };
  }

  // Out-of-band notice: someone holding a live session could otherwise point
  // panic alerts at their own phone without the member ever knowing.
  const email = user.email;
  if (email) {
    await sendEmergencyContactChanged(email, {
      label,
      lastFour: phone.slice(-4),
    });
  }

  revalidatePath("/safety-kit");
  return { ok: `We've texted ${label} a six-digit code. Ask them for it.` };
}

export async function confirmEmergencyContact(
  _prev: EmergencyState,
  formData: FormData,
): Promise<EmergencyState> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };

  const entered = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (entered.length !== 6) return { error: "The code is six digits." };

  const { data: contact } = await supabase
    .from("emergency_contacts")
    .select("code_hash, code_expires_at, attempts")
    .eq("profile_id", user.id)
    .single();

  if (!contact?.code_hash) return { error: "Add a contact first." };
  if (contact.attempts >= MAX_ATTEMPTS) {
    return { error: "Too many tries. Send a new code to start again." };
  }
  if (contact.code_expires_at && new Date(contact.code_expires_at) < new Date()) {
    return { error: "That code expired. Send a new one." };
  }

  const a = Buffer.from(hashCode(entered));
  const b = Buffer.from(contact.code_hash);
  const matches = a.length === b.length && timingSafeEqual(a, b);

  if (!matches) {
    await supabase
      .from("emergency_contacts")
      .update({ attempts: contact.attempts + 1 })
      .eq("profile_id", user.id);
    return { error: "That code didn't match. Try again." };
  }

  const { error } = await supabase
    .from("emergency_contacts")
    .update({
      confirmed_at: new Date().toISOString(),
      code_hash: null,
      code_expires_at: null,
      attempts: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/safety-kit");
  return { ok: "Confirmed. They'll get your alerts if you ever send one." };
}

export async function removeEmergencyContact(): Promise<EmergencyState> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };

  const { error } = await supabase
    .from("emergency_contacts")
    .delete()
    .eq("profile_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/safety-kit");
  return { ok: "Removed. We no longer hold that number." };
}

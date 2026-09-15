"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PHOTO_REVEAL_OPTIONS, REPORT_REASONS } from "@/lib/safety";

export type SafetyState = { error?: string; ok?: string } | null;

/**
 * Safety actions.
 *
 * NOTHING in this file reads a plan, an entitlement or a coin balance.
 * Reporting, blocking and privacy controls are free for every member, always
 * (CLAUDE.md). A constraint check fails if that changes.
 */

async function signedIn() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function reportMember(
  _prev: SafetyState,
  formData: FormData,
): Promise<SafetyState> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };

  const reportedId = String(formData.get("reported_id") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const detail = String(formData.get("detail") ?? "").trim();

  if (!reportedId || reportedId === user.id) {
    return { error: "We couldn't tell who this report is about." };
  }
  if (!REPORT_REASONS.some((r) => r.value === reason)) {
    return { error: "Choose what happened." };
  }

  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    reported_id: reportedId,
    reason,
    detail: detail || null,
  });
  if (error) return { error: error.message };

  // Reporting and blocking are separate choices; this is offered, not forced.
  if (formData.get("also_block") === "on") {
    await supabase
      .from("blocks")
      .upsert(
        { blocker_id: user.id, blocked_id: reportedId },
        { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true },
      );
  }

  revalidatePath("/feed");
  return {
    ok: "Thank you. A person on our team in Lagos reviews reports on verified accounts within 24 hours.",
  };
}

export async function blockMember(
  _prev: SafetyState,
  formData: FormData,
): Promise<SafetyState> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };

  const blockedId = String(formData.get("blocked_id") ?? "");
  if (!blockedId || blockedId === user.id) {
    return { error: "We couldn't tell who to block." };
  }

  const { error } = await supabase
    .from("blocks")
    .upsert(
      { blocker_id: user.id, blocked_id: blockedId },
      { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true },
    );
  if (error) return { error: error.message };

  revalidatePath("/feed");
  revalidatePath("/inbox");
  return {
    ok: "Blocked. You won't see each other again, and they aren't told.",
  };
}

export async function setPhotoReveal(
  _prev: SafetyState,
  formData: FormData,
): Promise<SafetyState> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };

  const value = String(formData.get("photo_reveal") ?? "");
  if (!PHOTO_REVEAL_OPTIONS.some((o) => o.value === value)) {
    return { error: "Choose who can see your photos." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ photo_reveal: value })
    .eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/safety-kit");
  return { ok: "Photo setting saved." };
}

export async function setImageBlur(
  _prev: SafetyState,
  formData: FormData,
): Promise<SafetyState> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };

  const { error } = await supabase
    .from("profiles")
    .update({ blur_incoming_images: formData.get("blur") === "on" })
    .eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/safety-kit");
  return { ok: "Image setting saved." };
}

"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { smileIdConfigured, submitAuthentication, submitCompare } from "@/lib/smile-id";

/**
 * Profile photos (PRD §5.1.2, Prompt 14).
 *
 * ALWAYS OPEN: a member who isn't live must be able to reach this screen —
 * it is how they go live, or restore access. Never call requireLiveProfile()
 * here (scripts/check-constraints.mjs enforces that).
 *
 * The files are uploaded from the browser, compressed on the phone first,
 * straight into the member's own folder in the private bucket; these
 * actions record and remove the rows. The database owns every rule that
 * matters — six at most, nobody writes their own face-match result, a
 * matched photo's file can't be swapped — so these refuse politely rather
 * than enforce.
 */

export type PhotoState = { error?: string; ok?: string } | null;

async function signedIn() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Record a photo the browser has just uploaded to `${user.id}/…`. */
export async function registerPhoto(path: string, position: number): Promise<PhotoState & { id?: string }> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };
  if (!path.startsWith(`${user.id}/`) || !/\.jpg$/.test(path)) {
    return { error: "That upload didn't come through. Try again." };
  }

  const { data, error } = await supabase
    .from("profile_photos")
    .insert({ profile_id: user.id, storage_path: path, position: Math.min(Math.max(position, 0), 5) })
    .select("id")
    .single();

  if (error?.message.includes("photo_limit")) {
    await supabase.storage.from("profile-photos").remove([path]);
    return { error: "That's the most you can add." };
  }
  if (error || !data) return { error: "That photo couldn't be saved. Try again." };

  revalidatePath("/photos");
  return { ok: "Added.", id: data.id };
}

/**
 * Remove one of the other photos. The main photo isn't removed from this
 * screen — it's replaced (photos-upload) — but if a member removes it some
 * other way, the database hides the profile and pauses access until a new
 * one matches (0013).
 */
export async function removePhoto(photoId: string): Promise<PhotoState> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };

  const { data: photo } = await supabase
    .from("profile_photos")
    .select("id, storage_path")
    .eq("id", photoId)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!photo) return { error: "That photo isn't there any more." };

  // Row first: a file still referenced by a row can't be deleted (0013).
  const { error } = await supabase.from("profile_photos").delete().eq("id", photo.id);
  if (error) return { error: "That photo couldn't be removed. Try again." };
  await supabase.storage.from("profile-photos").remove([photo.storage_path]);

  revalidatePath("/photos");
  return { ok: "Removed." };
}

/** "Show my photos only to people I match with" — 0012's decision (c). */
export async function setOnlyMatches(onlyMatches: boolean): Promise<PhotoState> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };
  const { error } = await supabase
    .from("profiles")
    .update({ photo_reveal: onlyMatches ? "after_i_reply" : "verified_members" })
    .eq("id", user.id);
  if (error) return { error: "That setting couldn't be saved." };
  revalidatePath("/photos");
  return { ok: "Saved." };
}

/**
 * Check a main photo against a FRESH selfie (decided 2026-10-05).
 *
 * The selfie and its liveness frames arrive in this request, go straight to
 * Smile ID, and are dropped — nothing here writes them anywhere. While the
 * check runs the previously matched main photo, if any, stays live.
 */
export async function checkMainPhoto(formData: FormData): Promise<PhotoState> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };

  const photoId = String(formData.get("photo_id") ?? "");
  const { data: photo } = await supabase
    .from("profile_photos")
    .select("id, storage_path")
    .eq("id", photoId)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!photo) return { error: "Choose your main photo first." };

  const admin = createAdminClient();

  if (!smileIdConfigured()) {
    if (process.env.NODE_ENV === "production" || !admin) {
      return { error: "Photo checks aren't connected yet, so your main photo can't be confirmed." };
    }
    // Development stand-in for Smile ID, like the liveness stand-in in
    // verify/actions.ts: records a match as the webhook would.
    const { error } = await supabase.rpc("nominate_main_photo", { p_photo_id: photo.id });
    if (error) return { error: "That photo can't be your main photo." };
    const { data: replaced } = await admin.rpc("record_main_photo_match", {
      p_photo_id: photo.id,
      p_outcome: "matched",
    });
    if (typeof replaced === "string" && replaced) {
      await admin.storage.from("profile-photos").remove([replaced]);
    }
    revalidatePath("/photos");
    return { ok: "Matched (development stand-in — Smile ID isn't connected)." };
  }

  if (!admin) return { error: "Photo checks aren't connected yet." };

  const selfie = formData.get("selfie");
  const frames = formData.getAll("liveness").filter((f): f is File => f instanceof File);
  if (!(selfie instanceof File) || frames.length < 6) {
    return { error: "The selfie didn't come through. Try again." };
  }

  const { error: nominateError } = await supabase.rpc("nominate_main_photo", { p_photo_id: photo.id });
  if (nominateError) return { error: "That photo can't be your main photo." };

  // The photo comes from storage, not the browser, so what Smile ID compares
  // is exactly the file other members will see.
  const { data: file } = await admin.storage.from("profile-photos").download(photo.storage_path);
  if (!file) return { error: "Your photo couldn't be read. Try again." };

  const checkId = randomUUID();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://trytoastly.com";
  const callbackUrl = `${site}/api/webhooks/smile-id`;
  const consent = { grantedAt: new Date().toISOString(), language: "en" };
  const capture = { selfie, livenessFrames: frames };

  await admin.from("face_match_jobs").insert([
    { profile_id: user.id, photo_id: photo.id, check_id: checkId, step: "authenticate" },
    { profile_id: user.id, photo_id: photo.id, check_id: checkId, step: "compare" },
  ]);

  try {
    const [authJob, compareJob] = await Promise.all([
      submitAuthentication({ checkId, profileId: user.id, capture, consent, callbackUrl }),
      submitCompare({ checkId, profileId: user.id, capture, mainPhoto: file, consent, callbackUrl }),
    ]);
    await admin.from("face_match_jobs").update({ provider_job_id: authJob }).eq("check_id", checkId).eq("step", "authenticate");
    await admin.from("face_match_jobs").update({ provider_job_id: compareJob }).eq("check_id", checkId).eq("step", "compare");
  } catch {
    // A provider failure is never held against the member: a person looks.
    await admin.rpc("record_main_photo_match", { p_photo_id: photo.id, p_outcome: "review" });
  }

  revalidatePath("/photos");
  return { ok: "Checking." };
}

/** "Ask a person to look" — only after "doesn't look like your selfie". */
export async function askForReview(photoId: string): Promise<PhotoState> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };
  const { error } = await supabase.rpc("request_photo_review", { p_photo_id: photoId });
  if (error) return { error: "That photo can't be sent for review." };
  revalidatePath("/photos");
  return { ok: "Sent to our team." };
}

/** "Use it as another photo" — a photo that wasn't confirmed as the main one. */
export async function keepAsOtherPhoto(photoId: string): Promise<PhotoState> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };
  const { error } = await supabase.rpc("keep_as_other_photo", { p_photo_id: photoId });
  if (error) return { error: "That photo can't be moved." };
  revalidatePath("/photos");
  return { ok: "Moved to your other photos." };
}

"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { startSelfieCheck } from "@/app/(app)/verify/selfie-actions";

/**
 * Profile photos (PRD §5.1.2, Prompt 14). Ported from
 * live-profile-and-prompt-14.
 *
 * ALWAYS OPEN: a member who isn't live must be able to reach this screen —
 * it's how they go live, or restore paused access. Never call
 * requireLiveProfile() here (scripts/check-constraints.mjs enforces that).
 *
 * Files are compressed on the phone, then uploaded from the browser straight
 * into the member's own folder in the private bucket; these actions record
 * and remove the rows. The database owns every rule that matters (0029) —
 * six at most, nobody writes their own face-match result — so these refuse
 * politely rather than enforce.
 */

export type PhotoState = { error?: string; ok?: string } | null;

const PATH = "/profile/photos";

async function signedIn() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * A one-time upload URL into the member's own folder. The browser PUTs the
 * compressed photo with it, so this screen ships no Supabase client (less to
 * load on mobile data, PRD §5.8). The path is chosen here, never by the browser.
 */
export async function prepareUpload(): Promise<PhotoState & { path?: string; url?: string }> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };
  const path = `${user.id}/${randomUUID()}.jpg`;
  const { data, error } = await supabase.storage.from("profile-photos").createSignedUploadUrl(path);
  if (error || !data) return { error: "That photo couldn't be uploaded. Try again." };
  return { path, url: data.signedUrl };
}

/** Record a photo the browser has just uploaded to `${user.id}/…`. */
export async function registerPhoto(path: string, position: number): Promise<PhotoState & { id?: string }> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };
  if (!path.startsWith(`${user.id}/`) || !/\.jpg$/.test(path)) return { error: "That upload didn't come through. Try again." };

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
  revalidatePath(PATH);
  return { ok: "Added.", id: data.id };
}

/**
 * Remove a photo. Removing the main photo, or going below four, hides the
 * profile and pauses access until it's put right (0029).
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
  const { error } = await supabase.from("profile_photos").delete().eq("id", photo.id);
  if (error) return { error: "That photo couldn't be removed. Try again." };
  await supabase.storage.from("profile-photos").remove([photo.storage_path]);
  revalidatePath(PATH);
  return { ok: "Removed." };
}

/** "Show my photos only to people I match with". */
export async function setOnlyMatches(onlyMatches: boolean): Promise<PhotoState> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };
  const { error } = await supabase
    .from("profiles")
    .update({ photo_reveal: onlyMatches ? "after_i_reply" : "verified_members" })
    .eq("id", user.id);
  if (error) return { error: "That setting couldn't be saved." };
  revalidatePath(PATH);
  return { ok: "Saved." };
}

/**
 * Choose a main photo. Nominated at once, so it stays private to its owner
 * until a check matches it — and any matched main photo stays live meanwhile.
 * During onboarding it then waits for the one selfie on /verify; for a member
 * who already has a matched main photo, for the fresh selfie here.
 */
export async function nominateMainPhoto(photoId: string): Promise<PhotoState> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };
  const { error } = await supabase.rpc("nominate_main_photo", { p_photo_id: photoId });
  if (error) return { error: "That photo can't be your main photo." };
  revalidatePath(PATH);
  return { ok: "Saved." };
}

/** Replacing a matched main photo: a FRESH selfie (lib: verify/selfie-actions). */
export async function checkMainPhoto(formData: FormData): Promise<PhotoState> {
  return startSelfieCheck("replace", formData);
}

/** "Ask a person to look" — only after "doesn't look like your selfie". */
export async function askForReview(photoId: string): Promise<PhotoState> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };
  const { error } = await supabase.rpc("request_photo_review", { p_photo_id: photoId });
  if (error) return { error: "That photo can't be sent for review." };
  revalidatePath(PATH);
  return { ok: "Sent to our team." };
}

/** "Use it as another photo" — a photo that wasn't confirmed as the main one. */
export async function keepAsOtherPhoto(photoId: string): Promise<PhotoState> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };
  const { error } = await supabase.rpc("keep_as_other_photo", { p_photo_id: photoId });
  if (error) return { error: "That photo can't be moved." };
  revalidatePath(PATH);
  return { ok: "Moved to your other photos." };
}

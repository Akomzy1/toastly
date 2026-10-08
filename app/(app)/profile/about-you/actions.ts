"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseGender } from "@/lib/gender-options";

export type AboutYouState = { ok?: string; error?: string } | null;

/**
 * Woman or man (0036). Asked at sign-up; this is where an account from
 * before 8 October 2026 sets it. Once live it's locked — the database
 * refuses a change (guard_gender) and support makes it.
 */
export async function saveAboutYou(_prev: AboutYouState, formData: FormData): Promise<AboutYouState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  const gender = parseGender(String(formData.get("gender") ?? ""));
  if (!gender) return { error: "Choose woman or man." };

  const { error } = await supabase.from("profiles").update({ gender }).eq("id", user.id);
  if (error) return { error: /Toastly Help/.test(error.message) ? error.message : "That didn't save. Try again." };
  revalidatePath("/profile/about-you");
  return { ok: "Saved." };
}

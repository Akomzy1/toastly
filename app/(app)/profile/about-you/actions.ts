"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getGenderOptions, parseGenderChoice } from "@/lib/gender-options";

export type AboutYouState = { ok?: string; error?: string } | null;

/**
 * Gender and who you'd like to meet (0036). The database checks both
 * against the list, and refuses a gender change once the profile has been
 * live (0035) — support changes it then. Who you'd like to meet can always
 * be changed; it takes effect on the next six.
 */
export async function saveAboutYou(_prev: AboutYouState, formData: FormData): Promise<AboutYouState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  const { data: me } = await supabase.from("profiles").select("gender, first_live_at").eq("id", user.id).single();
  const locked = Boolean(me?.first_live_at);
  const gender = locked ? String(me?.gender ?? "") : String(formData.get("gender") ?? "");
  const choice = parseGenderChoice(await getGenderOptions(supabase), gender, formData.getAll("seeking").map(String));
  if (!choice) return { error: locked ? "Choose who you'd like to meet." : "Choose who you are, and who you'd like to meet." };

  const { error } = await supabase
    .from("profiles")
    .update(locked ? { seeking: choice.seeking } : { gender: choice.gender, seeking: choice.seeking })
    .eq("id", user.id);
  if (error) return { error: /Toastly Help/.test(error.message) ? error.message : "That didn't save. Try again." };
  revalidatePath("/profile/about-you");
  return { ok: "Saved." };
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * "Open to people living abroad" (PRD §5.6), members in Nigeria. Works both
 * ways (decided 5 October 2026): off, the member doesn't see members abroad
 * and members abroad don't see them. Applied from the next six. Never a
 * ranking or scoring input.
 */
export async function setOpenToAbroad(on: boolean): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };
  const { error } = await supabase.from("profiles").update({ open_to_abroad: on }).eq("id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/profile/preferences");
  return {};
}

/**
 * Age range — every member, free on every plan (decided 5 October 2026).
 * Filters the member's own six only. 70 means "70+". The database checks the
 * range too (0027).
 */
export async function setAgeRange(lo: number, hi: number): Promise<{ error?: string }> {
  if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 18 || hi > 70 || hi <= lo) {
    return { error: "Choose an age range between 18 and 70+." };
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };
  const { error } = await supabase.from("profiles").update({ age_min: lo, age_max: hi }).eq("id", user.id);
  if (error) return { error: "That didn't save. Try again." };
  revalidatePath("/profile/preferences");
  return {};
}

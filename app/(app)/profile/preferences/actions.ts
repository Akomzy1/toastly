"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * "Open to people living abroad" (PRD §5.6): a filter on the member's own six,
 * applied from their next six. Never a ranking or scoring input.
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

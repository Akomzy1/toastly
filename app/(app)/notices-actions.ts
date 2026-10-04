"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** A member hides a notice they've read (their own only — dismiss_notice checks). */
export async function dismissNotice(formData: FormData) {
  const supabase = createClient();
  await supabase.rpc("dismiss_notice", { p_id: String(formData.get("id") ?? "") });
  revalidatePath("/", "layout");
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type PoolState = { ok?: boolean; error?: string } | null;

/**
 * Save the member's pool. The database (set_match_pool, 0026) refuses the
 * diaspora options without a Diaspora plan, so the rule holds whatever the
 * screen shows; the feed enforces it again when it builds the six.
 */
export async function savePool(_prev: PoolState, formData: FormData): Promise<PoolState> {
  const pool = String(formData.get("pool") ?? "");
  if (!["back_home", "diaspora", "both"].includes(pool)) return { error: "Choose a pool." };
  const supabase = createClient();
  const { error } = await supabase.rpc("set_match_pool", { p_pool: pool });
  if (error) return { error: error.message };
  revalidatePath("/profile/pool");
  return { ok: true };
}

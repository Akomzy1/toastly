"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { MatchPool, Tier } from "@/lib/types/profile";

/**
 * "Open to people living abroad" — members in Nigeria only. Takes effect
 * straight away, with no confirmation and no reason asked for (prototype).
 * It shapes the member's own six and nobody else's (0020).
 */
export async function setOpenToAbroad(on: boolean): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  const { error } = await supabase
    .from("profiles")
    .update({ open_to_abroad: on, updated_at: new Date().toISOString() })
    .eq("id", user.id)
    .eq("country_code", "NG");
  if (error) return { error: "That didn't save. Try again." };

  revalidatePath("/preferences");
  revalidatePath("/account");
  return {};
}

const DIASPORA_TIERS: Tier[] = ["diaspora", "diaspora_plus"];

/**
 * The pool, for members abroad. Back home is open on every plan; the two
 * diaspora options need a Diaspora plan. The feed applies the same rule on
 * its own (a member without the plan is matched back home whatever is
 * stored), so this refusal is about saying so, not about enforcement.
 */
export async function savePool(pool: MatchPool): Promise<{ error?: string }> {
  if (!["back_home", "diaspora", "both"].includes(pool)) return { error: "Choose a pool." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  const [{ data: me }, { data: tier }] = await Promise.all([
    supabase.from("profiles").select("country_code").eq("id", user.id).single(),
    supabase.rpc("current_tier", { p_profile_id: user.id }),
  ]);
  if (!me || me.country_code === "NG") return { error: "Pools are for members living abroad." };
  if (pool !== "back_home" && !DIASPORA_TIERS.includes(tier as Tier)) {
    return { error: "That pool is on Diaspora plans." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ pool, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return { error: "That didn't save. Try again." };

  revalidatePath("/preferences");
  revalidatePath("/feed");
  return {};
}

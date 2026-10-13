"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * "Not for me" (PRD §5.2.5) — pass on someone in today's six, and take it back.
 *
 * A pass removes the person from THIS member's future sixes, for good, and
 * that is all: it is not a block and not a report, the other person is never
 * told, and nothing about it reaches them or any score of theirs. Both calls
 * are the member's own and read no plan, entitlement or coin balance.
 */

export type PassState = { ok: true } | { ok: false; error: string };

export async function passOn(candidateId: string): Promise<PassState> {
  if (!/^[0-9a-f-]{36}$/i.test(candidateId)) return { ok: false, error: "We couldn't tell who this was." };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  const { error } = await supabase.rpc("pass_on", { p_candidate: candidateId });
  if (error) return { ok: false, error: "That didn't go through. Please try again." };
  revalidatePath("/profile/passes");
  return { ok: true };
}

/** Undo within ten seconds, or "Bring back" from Settings. */
export async function bringBack(candidateId: string): Promise<PassState> {
  if (!/^[0-9a-f-]{36}$/i.test(candidateId)) return { ok: false, error: "We couldn't tell who this was." };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  const { error } = await supabase.rpc("bring_back", { p_candidate: candidateId });
  if (error) return { ok: false, error: "That didn't go through. Please try again." };
  revalidatePath("/profile/passes");
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";

export type DecideState = { error?: string; ok?: string } | null;

/**
 * Record a reviewer's decision. decide_case() (0018) checks the caller is
 * staff, writes the decision log FIRST — with the reviewer's name, the time
 * and the reason — and only then applies it. Nothing here acts on an
 * account without that record.
 */
export async function decideCase(_prev: DecideState, formData: FormData): Promise<DecideState> {
  const { supabase } = await requireStaff();
  const id = Number(formData.get("case_id"));
  const action = String(formData.get("action") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!Number.isFinite(id) || !action) return { error: "Choose a decision." };
  if (action !== "assign" && note.length < 12) return { error: "A reason is required — a short sentence is enough." };

  const { data: replaced, error } = await supabase.rpc("decide_case", {
    p_case: id,
    p_action: action,
    p_note: action === "assign" ? "" : note,
  });
  if (error) return { error: error.message };

  // A confirmed replacement main photo retires the old file (0015).
  if (typeof replaced === "string" && replaced) {
    await createAdminClient()?.storage.from("profile-photos").remove([replaced]);
  }

  revalidatePath(`/review/${id}`);
  revalidatePath("/review");
  return { ok: action };
}

"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type DeleteState = { error?: string } | null;

/**
 * Delete your account (privacy policy §8, §10).
 *
 * ALWAYS OPEN: no tier check and no live-profile guard.
 *
 * Immediate, inside the policy's "within [30] days". In order:
 *   1. the member has seen any unspent coins — which deletion forfeits
 *      (decided 2026-10-05) — and confirms by typing DELETE, a deliberate
 *      act rather than a mis-tap;
 *   2. prepare_account_deletion() (0016) ends any Couple Mode so the partner
 *      is un-paused, calls off any date with every stake returned, stamps
 *      the records the policy keeps, and logs the erasure;
 *   3. their photo files and the images they sent are deleted from storage;
 *   4. the account is deleted — everything else goes with it, except
 *      payment records (kept [6] years) and reports (kept [2] years), which
 *      survive de-linked from the person.
 *
 * The service role is used because the member is deleting their own auth
 * account, which no member session can do. The session is verified first,
 * and the only id ever acted on is the signed-in member's own.
 */
export async function deleteAccount(_prev: DeleteState, formData: FormData): Promise<DeleteState> {
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") {
    return { error: "Type DELETE to confirm." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  const admin = createAdminClient();
  if (!admin) {
    return { error: "Account deletion isn't connected in this environment. Email support@trytoastly.com." };
  }

  const { data: prepared, error: prepError } = await admin.rpc("prepare_account_deletion", {
    p_profile_id: user.id,
  });
  if (prepError || !prepared) return { error: "Your account couldn't be deleted. Try again." };

  const p = prepared as { log_id: string; photo_paths: string[]; attachment_paths: string[] };
  if (p.photo_paths.length) await admin.storage.from("profile-photos").remove(p.photo_paths);
  if (p.attachment_paths.length) await admin.storage.from("message-attachments").remove(p.attachment_paths);

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) return { error: "Your account couldn't be deleted. Email support@trytoastly.com." };

  await admin.from("account_deletions").update({ completed_at: new Date().toISOString() }).eq("id", p.log_id);

  await supabase.auth.signOut();
  redirect("/goodbye");
}

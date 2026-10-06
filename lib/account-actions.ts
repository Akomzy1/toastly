"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PRIVACY_CONTACT } from "@/lib/privacy-content";

export type AccountState = { error?: string } | null;

/**
 * Delete the member's account — privacy policy sections 8 and 10.
 *
 * Order matters, and each step stops the next if it fails:
 *   1. prepare_account_deletion() copies out only what section 8 says is
 *      kept: reports about the account, payment records, and — if the
 *      account was removed for breaking the rules — its scrambled phone
 *      number. If this fails, nothing has been deleted.
 *   2. Photos and message attachments are removed from storage. Files don't
 *      cascade with rows, so without this they would outlive the account.
 *   3. The auth user is deleted. Every table referencing the profile cascades
 *      from it: profile, matches, messages, genotype, emergency contact.
 *
 * Needs the service role (deleting an auth user is an admin operation). Free
 * on every tier; nothing here reads a plan.
 */
export async function deleteAccount(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  // Typed, a deliberate act rather than a mis-tap (account-delete.slim.html).
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") {
    return { error: "Type DELETE to confirm." };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      error: `We can't delete accounts from here right now. Email ${PRIVACY_CONTACT} and we'll do it for you.`,
    };
  }

  const unchanged = "We couldn't delete your account, and nothing has been removed. Please try again.";

  // 1. Keep only what the policy says is kept.
  const { error: keepError } = await supabase.rpc("prepare_account_deletion");
  if (keepError) return { error: unchanged };

  // 2. Files.
  const photos = await admin.storage.from("profile-photos").list(user.id, { limit: 1000 });
  if (photos.error) return { error: unchanged };
  if (photos.data?.length) {
    const removed = await admin.storage
      .from("profile-photos")
      .remove(photos.data.map((f) => `${user.id}/${f.name}`));
    if (removed.error) return { error: unchanged };
  }

  const { data: sent, error: sentError } = await admin
    .from("messages")
    .select("id")
    .eq("sender_id", user.id);
  if (sentError) return { error: unchanged };
  const sentIds = (sent ?? []).map((m) => m.id as string);
  if (sentIds.length) {
    const { data: atts, error: attError } = await admin
      .from("message_attachments")
      .select("storage_path")
      .in("message_id", sentIds);
    if (attError) return { error: unchanged };
    const paths = (atts ?? []).map((a) => a.storage_path as string);
    if (paths.length) {
      const removed = await admin.storage.from("message-attachments").remove(paths);
      if (removed.error) return { error: unchanged };
    }
  }

  // 3. The account. Everything else cascades from here.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return {
      error: `Your photos were removed, but we couldn't finish deleting your account. Email ${PRIVACY_CONTACT} and we'll complete it.`,
    };
  }

  try {
    await supabase.auth.signOut();
  } catch {
    // The session belonged to a user who no longer exists; nothing to do.
  }
  revalidatePath("/", "layout");
  redirect("/");
}

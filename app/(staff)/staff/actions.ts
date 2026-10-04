"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendRemovalNotice,
  sendRestrictionLifted,
  sendRestrictionNotice,
  sendReverificationNotice,
  sendSwitchPlanNotice,
} from "@/lib/email";
import { reasonLabel } from "@/lib/review";

export type DecideState = { ok?: string; error?: string } | null;

/**
 * Record a staff decision. The database checks the caller is staff, that the
 * action is allowed for this item, and writes the audit log (staff_decide).
 * This action does the two things the database can't: Auth (a removed
 * member's sign-in is banned) and email (the member is always told, with a
 * reason category only).
 */
export async function decide(_prev: DecideState, formData: FormData): Promise<DecideState> {
  const id = String(formData.get("id") ?? "");
  const action = String(formData.get("action") ?? "");
  const note = String(formData.get("note") ?? "").slice(0, 1000) || null;
  if (SERIOUS_NEEDS_CONFIRM.has(action) && formData.get("confirm") !== "yes") {
    return { error: "Tick the box to confirm." };
  }

  const supabase = createClient();
  // Proves the caller is staff and reads the subject before anything changes.
  const { data: item, error: itemError } = await supabase.rpc("staff_item", { p_id: id });
  if (itemError || !item) return { error: itemError?.message ?? "Not available." };
  const subjectId = (item as { subject: { id: string } }).subject.id;
  if (!((item as { actions: string[] }).actions ?? []).includes(action)) return { error: "That action isn't available for this item." };

  const admin = createAdminClient();
  const email = admin ? (await admin.auth.admin.getUserById(subjectId)).data.user?.email ?? null : null;

  if (action === "remove") {
    if (!admin) return { error: "Removal needs the server's Supabase key, which isn't set here." };
    // Ban first: if the database step then fails, lift the ban again.
    const ban = await admin.auth.admin.updateUserById(subjectId, { ban_duration: "876000h" });
    if (ban.error) return { error: `Couldn't block the sign-in: ${ban.error.message}` };
    const { data, error } = await supabase.rpc("staff_decide", { p_id: id, p_action: action, p_note: note });
    if (error) {
      await admin.auth.admin.updateUserById(subjectId, { ban_duration: "none" });
      return { error: error.message };
    }
    if (email) await sendRemovalNotice(email, { reasonCategory: reasonLabel((data as { reason_category: string }).reason_category) });
    revalidatePath("/staff");
    return { ok: "Removed. The member has been told." };
  }

  const { data, error } = await supabase.rpc("staff_decide", { p_id: id, p_action: action, p_note: note });
  if (error) return { error: error.message };
  const category = reasonLabel((data as { reason_category: string }).reason_category);

  if (email) {
    if (action === "ask_switch_plan") await sendSwitchPlanNotice(email);
    if (action === "request_reverification") await sendReverificationNotice(email, { reasonCategory: category });
    if (action === "restrict") await sendRestrictionNotice(email, { reasonCategory: category });
    if (action === "lift_restriction") await sendRestrictionLifted(email);
  }
  revalidatePath("/staff");
  revalidatePath(`/staff/${id}`);
  return { ok: email || action === "clear" || action === "attended" || action === "no_show" ? "Done." : "Done. (No email on the account, so they'll see it in the app only.)" };
}

const SERIOUS_NEEDS_CONFIRM = new Set(["restrict", "remove"]);

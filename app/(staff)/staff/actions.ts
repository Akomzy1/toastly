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
import { MIN_REASON, reasonLabel } from "@/lib/review";

export type DecideResult = { ok?: true; who?: string; error?: string };

/**
 * Record a staff decision. The database checks the caller is staff, that the
 * action fits this case, that a reason is written, and writes the case
 * history and the audit log (staff_decide). This action does the two things
 * the database can't: Auth (a removed member's sign-in is banned) and email
 * (the member is always told, with a reason category only).
 */
export async function decide(id: string, action: string, note: string): Promise<DecideResult> {
  if (note.trim().length < MIN_REASON) return { error: "Write the reason for this decision — a short sentence is enough." };

  const supabase = createClient();
  // Proves the caller is staff and reads the case before anything changes.
  const [{ data: item, error: itemError }, { data: me }] = await Promise.all([
    supabase.rpc("staff_item", { p_id: id }),
    supabase.rpc("staff_me"),
  ]);
  if (itemError || !item) return { error: itemError?.message ?? "Not available." };
  const c = item as { subject: { id: string | null }; actions: string[] };
  if (!c.actions.includes(action)) return { error: "That action isn't available for this case." };
  const subjectId = c.subject.id;
  const who = (me as { name?: string } | null)?.name;

  const admin = createAdminClient();
  const email = admin && subjectId ? (await admin.auth.admin.getUserById(subjectId)).data.user?.email ?? null : null;

  if (action === "remove") {
    if (!admin || !subjectId) return { error: "Removal needs the server's Supabase key, which isn't set here." };
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
    return { ok: true, who };
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
  return { ok: true, who };
}

/** Take a new case ("Assign to me"); written to the case history. */
export async function assign(id: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("staff_assign", { p_id: id });
  if (error) return { error: error.message };
  revalidatePath(`/staff/${id}`);
  return {};
}

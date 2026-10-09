"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSupportReply } from "@/lib/email";

/**
 * Support tab actions. The database checks the caller is staff and records
 * every reply and status change in the audit log (staff_support_reply,
 * staff_support_status) — that a reply was sent, never what it said. This
 * action does what the database can't: email the reply to the member.
 */
export async function replyToTicket(id: string, reference: string, body: string): Promise<{ ok?: true; emailed?: boolean; error?: string }> {
  const text = body.trim();
  if (!text) return { error: "Write a reply first." };
  if (text.length > 4000) return { error: "Keep the reply under 4,000 characters." };

  const supabase = createClient();
  const { data, error } = await supabase.rpc("staff_support_reply", { p_id: id, p_body: text });
  if (error || !data) return { error: error?.message ?? "Not available." };
  const { profile_id } = data as { profile_id: string; reference: string };

  const admin = createAdminClient();
  const email = admin ? (await admin.auth.admin.getUserById(profile_id)).data.user?.email ?? null : null;
  const sent = email ? (await sendSupportReply(email, reference, text)).sent : false;

  revalidatePath("/staff/support");
  revalidatePath(`/staff/support/${reference}`);
  return { ok: true, emailed: sent };
}

export async function setTicketStatus(id: string, reference: string, status: "resolved" | "open"): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("staff_support_status", { p_id: id, p_status: status });
  if (error) return { error: error.message };
  revalidatePath("/staff/support");
  revalidatePath(`/staff/support/${reference}`);
  return {};
}

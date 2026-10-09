import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import { alertEmail, alertSms, digestEmail, type AlertTicket, type DigestRow, type Handoff, type HelpCategory, type Trigger } from "@/lib/help-escalation";

/**
 * Telling the team a Toastly Help ticket is waiting. SERVER ONLY.
 *
 *   Urgent: an SMS to the on-call phone (ONCALL_PHONE, through sendSms) and
 *           an email to the support inbox. Re-alerted once if nobody opens
 *           it within its reply time (app/api/cron/support-alerts).
 *   Normal: an email to the support inbox.
 *   Daily, 08:00 Lagos: a digest of open tickets, oldest first.
 *
 * Every alert carries the ticket number, its urgency and a console link —
 * never a name, a category or the member's words. The builders in
 * lib/help-escalation.ts take only those fields.
 */

export function siteBase(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://www.trytoastly.com";
}

const inbox = () => process.env.SUPPORT_INBOX || "support@trytoastly.com";

export async function alertTeam(ticket: AlertTicket, { realert = false } = {}): Promise<{ email: boolean; sms: boolean | null }> {
  const t: AlertTicket = { reference: ticket.reference, urgency: ticket.urgency };
  const base = siteBase();
  const email = sendEmail({ to: inbox(), ...alertEmail(t, base, realert) });
  let sms: Promise<boolean | null> = Promise.resolve(null);
  if (t.urgency === "urgent") {
    const oncall = process.env.ONCALL_PHONE;
    sms = oncall
      ? sendSms(oncall, alertSms(t, base, realert)).then((r) => {
          if (!r.sent) console.error("[support] on-call SMS not sent:", r.reason);
          return r.sent;
        })
      : (console.error("[support] ONCALL_PHONE is not set; urgent ticket alerted by email only"), Promise.resolve(false));
  }
  const [e, s] = await Promise.all([email, sms]);
  return { email: e.sent, sms: s };
}

export async function sendDigest(rows: DigestRow[]): Promise<boolean> {
  const r = await sendEmail({ to: inbox(), ...digestEmail(rows, siteBase(), Date.now()) });
  return r.sent;
}

export type FiledTicket = { reference: string; urgency: "normal" | "urgent"; slaMinutes: number };

/**
 * File (or raise) the ticket for a Help conversation and alert the team when
 * it's new or has just become urgent. Service-role client only.
 */
export async function fileTicket(
  admin: SupabaseClient,
  args: { profileId: string; conversationId: string | null; category: HelpCategory; handoff: Exclude<Handoff, "none">; trigger: Trigger },
): Promise<FiledTicket | null> {
  const { data, error } = await admin.rpc("file_support_ticket", {
    p_profile: args.profileId,
    p_conversation: args.conversationId,
    p_category: args.category,
    p_urgency: args.handoff,
    p_trigger: args.trigger,
  });
  const row = (Array.isArray(data) ? data[0] : data) as
    | { id: string; reference: string; urgency: "normal" | "urgent"; sla_minutes: number; created: boolean; raised: boolean }
    | undefined;
  if (error || !row) {
    console.error("[support] filing failed:", error?.code ?? "no row");
    return null;
  }
  if (row.created || row.raised) {
    await alertTeam({ reference: row.reference, urgency: row.urgency });
    await admin.from("support_tickets").update({ alerted_at: new Date().toISOString() }).eq("id", row.id);
  }
  return { reference: row.reference, urgency: row.urgency, slaMinutes: row.sla_minutes };
}

export async function supportConfig(admin: SupabaseClient): Promise<{ offerAfterTurns: number }> {
  const { data } = await admin.from("support_config").select("name, value");
  const get = (n: string, d: number) => (data ?? []).find((r) => r.name === n)?.value ?? d;
  return { offerAfterTurns: get("offer_person_after_turns", 4) };
}

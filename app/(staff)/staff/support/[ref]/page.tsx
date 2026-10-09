import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ConsoleHeader } from "@/components/staff/console-header";
import { SupportTicketView, type SupportTicket } from "@/components/staff/support-ticket";

/**
 * One ticket, by its reference (the alerts link here). Opening it is
 * recorded and stops the urgent re-alert (staff_support_ticket).
 */
export default async function StaffSupportTicket({ params }: { params: { ref: string } }) {
  const supabase = createClient();
  const [{ data, error }, { data: me }] = await Promise.all([
    supabase.rpc("staff_support_ticket", { p_ref: decodeURIComponent(params.ref) }),
    supabase.rpc("staff_me"),
  ]);
  if (error || !data) notFound();
  const who = (me ?? { name: "Staff", role: "Reviewer" }) as { name: string; role: string };
  return (
    <>
      <ConsoleHeader active="support" name={who.name} role={who.role} />
      <SupportTicketView t={data as SupportTicket} />
    </>
  );
}

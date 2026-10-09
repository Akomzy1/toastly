import { createClient } from "@/lib/supabase/server";
import { ConsoleHeader } from "@/components/staff/console-header";
import { SupportQueue, type SupportRow } from "@/components/staff/support-queue";

const STATUSES = ["open", "resolved", "all"];

/** Toastly Help tickets — urgent pinned, then oldest first. Staff only (layout + staff_support_queue). */
export default async function StaffSupport({ searchParams }: { searchParams: { status?: string } }) {
  const status = STATUSES.includes(searchParams.status ?? "") ? searchParams.status! : "open";
  const supabase = createClient();
  const [{ data }, { data: me }] = await Promise.all([
    supabase.rpc("staff_support_queue", { p_status: status }),
    supabase.rpc("staff_me"),
  ]);
  const who = (me ?? { name: "Staff", role: "Reviewer" }) as { name: string; role: string };
  return (
    <>
      <ConsoleHeader active="support" name={who.name} role={who.role} />
      <SupportQueue rows={(data ?? []) as SupportRow[]} status={status} />
    </>
  );
}

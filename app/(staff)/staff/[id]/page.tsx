import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ConsoleHeader } from "@/components/staff/console-header";
import { CaseView, type CaseItem } from "@/components/staff/case-view";

/** One case (review-case.slim.html). */
export default async function StaffCase({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [{ data, error }, { data: me }] = await Promise.all([supabase.rpc("staff_item", { p_id: params.id }), supabase.rpc("staff_me")]);
  if (error || !data) notFound();
  const who = (me ?? { name: "Staff", role: "Reviewer" }) as { name: string; role: string };
  return (
    <>
      <ConsoleHeader active="queue" name={who.name} role={who.role} />
      <CaseView c={data as CaseItem} />
    </>
  );
}

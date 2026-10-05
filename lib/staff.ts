import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export { CASE_TYPES, caseTypeLabel, STATUS_LABEL, STATUS_PILL, caseId, waited, wat } from "@/lib/review-labels";

/**
 * The review console is staff-only. Every staff page and action calls
 * requireStaff(); the database refuses non-staff too (is_staff() inside
 * every review function, 0018), so this is the polite half of the rule.
 *
 * A member who isn't staff gets a plain 404 — the console doesn't
 * advertise that it exists.
 *
 * SERVER ONLY. Client components import labels from lib/review-labels.ts.
 */
export async function requireStaff() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase.rpc("staff_me");
  const me = data as { name: string; role: "reviewer" | "senior" } | null;
  if (!me) notFound();
  return { supabase, user, staff: me };
}

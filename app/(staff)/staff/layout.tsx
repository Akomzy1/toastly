import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Review console", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Staff only (0025/0026). A member who isn't in staff_members gets a plain
 * 404 — the console's existence isn't confirmed to them. The database checks
 * again on every call (staff_queue, staff_item, staff_decide, staff_history),
 * so this layout is a convenience, not the lock.
 *
 * Built against review-queue / review-case / review-history.slim.html.
 */
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) notFound();
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: staff } = await supabase.rpc("is_staff");
  if (staff !== true) notFound();

  return <div className="flex min-h-screen flex-col bg-paper">{children}</div>;
}

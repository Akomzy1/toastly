import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Review queue", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Staff only (0025). A member who isn't in staff_members gets a plain 404 —
 * the queue's existence isn't confirmed to them. The database checks again
 * on every call (staff_queue, staff_item, staff_decide), so this layout is a
 * convenience, not the lock.
 *
 * NOT IN A PROTOTYPE — an internal tool, built from the in-app cards and
 * buttons. Flagged in SKILL.md.
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

  return (
    <div className="min-h-screen bg-paper">
      <header className="flex items-center justify-between gap-4 bg-green-800 px-5 py-3.5">
        <Link href="/staff" className="font-serif text-[20px] font-bold text-white no-underline">
          Review queue
        </Link>
        <Link href="/feed" className="text-nav text-champagne no-underline">
          Back to the app
        </Link>
      </header>
      <main className="mx-auto grid w-full max-w-[960px] content-start gap-4 px-4 py-5">{children}</main>
    </div>
  );
}

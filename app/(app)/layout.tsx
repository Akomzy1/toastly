import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { Notice } from "@/components/ui/notice";
import { PresenceHeartbeat } from "@/components/app/presence-heartbeat";
import { AppHeader, AppTabBar } from "@/components/app/nav";

/**
 * In-app shell.
 *
 * Built against design/prototype/nav-*.slim.html (3 October 2026): a bottom
 * tab bar on phones (Today, Gists, Inbox, Profile), the same four in the dark
 * header on desktop, and each screen's own band (components/app/screen-band)
 * carrying the Safety pill. Content is padded clear of the tab bar and the
 * phone's home indicator.
 *
 * SKILL.md: in-app layout rules differ from the marketing pages — no marketing
 * header, no footer.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Without Supabase these routes cannot work, but they should say so
  // rather than throwing a library error as a 500.
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto grid max-w-[560px] gap-4 px-5 py-section-y">
        <h1 className="text-h4 text-ink-900">Supabase isn&rsquo;t configured</h1>
        <Notice tone="locked" title="Missing environment variables">
          Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (see{" "}
          <code>.env.example</code>). The public marketing pages work without
          them; sign-in, verification and profiles do not.
        </Notice>
      </div>
    );
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-paper">
      <AppHeader />
      <main className="pb-[calc(58px+env(safe-area-inset-bottom))] lg:pb-0">{children}</main>
      <AppTabBar />
      <PresenceHeartbeat />
    </div>
  );
}

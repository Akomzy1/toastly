import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLockup } from "@/components/brand-mark";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { Notice } from "@/components/ui/notice";
import { signOut } from "../(auth)/actions";

/**
 * In-app shell.
 *
 * NOT IN THE PROTOTYPE — flagged. The only in-app screen the design covers is
 * the locked inbox, and that is a component-state demo rather than a shell:
 * it shows a tab bar and a list row, not navigation, headers or page chrome.
 * This is built from the design system's tokens and kept deliberately thin so
 * that when a real app shell is designed, little has to be unpicked.
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
      <header className="sticky top-0 z-50 border-b border-champagne/[.16] bg-green-800 font-sans">
        <div className="mx-auto flex h-[60px] max-w-container items-center justify-between gap-4 px-5 md:px-10">
          <Link href="/verify" className="no-underline">
            <BrandLockup tone="dark" size={22} />
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="text-nav font-medium text-champagne transition-opacity duration-200 hover:opacity-75"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

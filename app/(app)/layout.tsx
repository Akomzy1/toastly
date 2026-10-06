import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { Notice } from "@/components/ui/notice";
import { PresenceHeartbeat } from "@/components/app/presence-heartbeat";
import { AppHeader, AppTabBar } from "@/components/app/nav";
import { MemberNotices } from "@/components/app/member-notices";
import { headers } from "next/headers";
import { CountryCheckSheet } from "@/components/where-you-live/flows";
import { guessCountryFromPhone } from "@/lib/countries";
import { loadCities } from "@/lib/where-you-live";

const SHEET_EXEMPT = ["/verify", "/profile/settings/country", "/safety-kit", "/profile/data"];

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

  // Members who confirmed their phone before the where-you-live step existed
  // are asked once, on their next visit (where-you-live-confirm.slim.html):
  // a sheet over whatever they open, until they confirm. Never over the
  // sign-up step itself, its settings screen, the safety kit or their data.
  const path = headers().get("x-pathname") ?? "";
  const { data: me } = await supabase
    .from("profiles")
    .select("phone_verified_at, country_confirmed_at, country_code, diaspora_city")
    .eq("id", user.id)
    .maybeSingle();
  const askWhereYouLive =
    Boolean(me?.phone_verified_at) && !me?.country_confirmed_at && !SHEET_EXEMPT.some((p) => path.startsWith(p));

  return (
    <div className="min-h-screen bg-paper">
      <AppHeader />
      <main className="pb-[calc(58px+env(safe-area-inset-bottom))] lg:pb-0">
        <MemberNotices />
        {children}
      </main>
      <AppTabBar />
      <PresenceHeartbeat />
      {askWhereYouLive && me ? (
        <CountryCheckSheet
          guess={user.phone ? guessCountryFromPhone(user.phone) : me.country_code}
          onFile={me.country_code}
          cityOnFile={me.diaspora_city}
          cities={await loadCities(supabase)}
        />
      ) : null}
    </div>
  );
}

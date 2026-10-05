import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./profile-form";
import type { Profile } from "@/lib/types/profile";

export const metadata: Metadata = {
  title: "Your profile",
  robots: { index: false, follow: false },
};

export default async function ProfilePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  if (!profile) redirect("/verify");

  // Closed cities are listed too. A member may pick a city that hasn't opened
  // yet — the option is honest about it, and the feed explains the fallback
  // rather than the choice quietly doing nothing.
  const { data: cities } = await supabase
    .from("diaspora_cities")
    .select("slug, label, country_code, active")
    .order("label");

  // The picker groups by country name, the way the prototype does. The table
  // stores an ISO code, and has no region column — so region is null rather
  // than a guess at what "NY · metro area" would be for every city.
  const COUNTRY_NAMES: Record<string, string> = {
    US: "United States",
    GB: "United Kingdom",
    CA: "Canada",
  };

  const cityOptions = (cities ?? []).map((c) => ({
    slug: c.slug,
    label: c.label,
    country: COUNTRY_NAMES[c.country_code] ?? c.country_code,
    region: null,
    active: c.active,
  }));

  return (
    <div className="mx-auto grid max-w-[720px] gap-6 px-5 py-section-y">
      <div className="grid gap-2">
        <h1 className="text-h3 text-ink-900">Your profile</h1>
        <p className="text-ui text-grey-600">
          Your prompt answers are what people read first. Everything below the
          basics is optional.
        </p>
      </div>
      <ProfileForm profile={profile} cities={cityOptions} />

      {/* Labels and one-line descriptions from the profile hub in the nav
          export (nav-profile-hub, not yet integrated), which lists these as
          plain rows. Only the two entries that exist so far. */}
      <ul className="grid list-none gap-3 p-0">
        {[
          { href: "/photos", label: "Edit profile and photos", sub: "Four to go live, up to six" },
          { href: "/account", label: "Your data", sub: "See, download or delete what we hold" },
        ].map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="grid min-h-11 gap-0.5 rounded-xl border border-ink-900/[.12] bg-white px-5 py-4 no-underline transition-colors hover:border-green-500/50"
            >
              <span className="text-ui font-semibold text-ink-900">{item.label}</span>
              <span className="text-nav text-grey-600">{item.sub}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

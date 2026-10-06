import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "../profile-form";
import { GenotypeSection } from "@/components/genotype/genotype-section";
import { ScreenBand } from "@/components/app/screen-band";
import type { Profile, ProfileHistory } from "@/lib/types/profile";

export const metadata: Metadata = {
  title: "Edit profile",
  robots: { index: false, follow: false },
};

export default async function EditProfilePage() {
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

  // Own row only — RLS on profile_history (0013) enforces who else may read it.
  const { data: historyRow } = await supabase
    .from("profile_history")
    .select("history, has_children, visibility")
    .eq("profile_id", user.id)
    .maybeSingle<ProfileHistory>();

  const history: ProfileHistory = historyRow ?? {
    history: null,
    has_children: null,
    visibility: "on_match",
  };

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
    <>
      <ScreenBand title="Edit profile" sub="The basics, then what's optional" back="/profile" />
      <div className="mx-auto grid max-w-[720px] gap-6 px-5 pb-section-y pt-5 lg:pt-4">
        <p className="text-ui text-grey-600">
          Your prompt answers are what people read first. Everything below the
          basics is optional.
        </p>
        {/* The hub's "Edit profile and photos" (nav-profile-hub) lands here;
            photos have their own screen (photos-upload). */}
        <Link
          href="/profile/photos"
          className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-ink-900/[.12] bg-white px-[15px] py-[11px] no-underline transition-colors hover:bg-paper"
        >
          <span className="grid min-w-0 gap-0.5">
            <span className="text-ui font-medium text-ink-900">Your photos</span>
            <span className="text-[13px] leading-[1.45] text-grey-600">Four to go live, up to six</span>
          </span>
          <span aria-hidden="true" className="flex-shrink-0 text-[16px] text-grey-400">
            ›
          </span>
        </Link>
        <ProfileForm profile={profile} history={history} cities={cityOptions} />
        {/* Separate from the form on purpose: genotype has its own consent
            step and its own save, and never travels with other fields. */}
        <GenotypeSection />
      </div>
    </>
  );
}

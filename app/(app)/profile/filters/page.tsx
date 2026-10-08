import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScreenBand } from "@/components/app/screen-band";
import { FiltersLocked, FiltersScreen } from "@/components/profile/filters-screen";
import { NO_FILTERS, type MemberFilters } from "@/lib/filters";
import { requireLiveProfile } from "@/lib/live-profile";
import { ProfileNotLive } from "@/components/app/profile-not-live";
import { upgradeOffer } from "@/lib/plan-numbers";

export const metadata: Metadata = {
  title: "Filters",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * Filters (premium-filters.slim.html; PRD §5.2.4). The member's own filters,
 * on their own six. Deviation, flagged: the prototype's band carries a
 * "Premium" pill where every in-app band carries the Safety pill
 * (nav-*.slim.html), so "Premium" is the band's subline instead.
 */
export default async function FiltersPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Filters shape the six, which opens at go-live — and nothing is offered
  // for sale before then (PRD §7.3).
  const live = await requireLiveProfile(supabase);
  if (!live.live) return <ProfileNotLive status={live} />;

  const [{ data: allowed }, { data: row }, { data: me }] = await Promise.all([
    supabase.rpc("i_have_advanced_filters"),
    supabase
      .from("member_filters")
      .select("religions, religion_include_unsaid, tribes, tribe_include_unsaid")
      .eq("profile_id", user.id)
      .maybeSingle<MemberFilters>(),
    supabase.from("profiles").select("country_code").eq("id", user.id).maybeSingle(),
  ]);

  return (
    <>
      <ScreenBand title="Filters" sub="Premium" back="/profile/preferences" />
      <div className="mx-auto grid w-full max-w-[680px] gap-4 px-3.5 pb-8 pt-[18px]">
        {allowed === true ? <FiltersScreen initial={row ?? NO_FILTERS} /> : <FiltersLocked offer={upgradeOffer((me?.country_code ?? "NG") !== "NG")} />}
      </div>
    </>
  );
}

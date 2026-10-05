import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppBand, AppColumn } from "@/components/app/app-band";
import { TIER_LABELS } from "@/lib/entitlements";
import type { MatchPool, Tier } from "@/lib/types/profile";
import { OpenToAbroadSwitch } from "./open-to-abroad";
import { PoolChoice } from "./pool-choice";

export const metadata: Metadata = {
  title: "Match preferences",
  robots: { index: false, follow: false },
};

/**
 * Match preferences. A setting, so it's open whether or not the profile is
 * live (PRD §5.1.2).
 *
 * Members in Nigeria: built against design/prototype/open-to-abroad.slim.html.
 * Members abroad: built against design/prototype/pool-choice.slim.html.
 *
 * Deviation: open-to-abroad also shows an "Age range" row. No age-range
 * setting exists, so the row waits for one rather than linking nowhere.
 */
export default async function PreferencesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: me }, { data: tierRow }] = await Promise.all([
    supabase
      .from("profiles")
      .select("country_code, city, pool, diaspora_city, open_to_abroad")
      .eq("id", user.id)
      .single(),
    supabase.rpc("current_tier", { p_profile_id: user.id }),
  ]);
  if (!me) redirect("/verify");
  const tier = (tierRow as Tier | null) ?? "starter";

  if (me.country_code === "NG") {
    return (
      <>
        <AppBand title="Match preferences" backHref="/profile" />
        <AppColumn gap="gap-2.5">
          <p className="mx-0.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-grey-600">Who you see</p>
          <div className="grid rounded-xl border border-ink-900/[.12] bg-white">
            <Link
              href="/profile"
              className="flex min-h-14 items-center justify-between gap-3 px-[15px] py-3 no-underline"
            >
              <span className="text-ui font-medium text-ink-900">City</span>
              <span className="flex min-w-0 items-center gap-2 text-[14px] text-grey-600">
                {me.city ?? "Add your city"}
                <span aria-hidden="true" className="text-[16px] text-grey-400">
                  ›
                </span>
              </span>
            </Link>
            <OpenToAbroadSwitch initial={me.open_to_abroad} />
          </div>
        </AppColumn>
      </>
    );
  }

  const { data: city } = me.diaspora_city
    ? await supabase.from("diaspora_cities").select("label, active").eq("slug", me.diaspora_city).single()
    : { data: null };
  const diasporaPlan = tier === "diaspora" || tier === "diaspora_plus";

  return (
    <>
      <AppBand
        title="Your match pool"
        sub={`${city?.label ?? "Abroad"} · ${TIER_LABELS[tier]} plan`}
        backHref="/profile"
      />
      <AppColumn>
        <PoolChoice
          initial={me.pool as MatchPool}
          city={city?.label ?? "your city"}
          cityChosen={Boolean(city)}
          cityOpen={Boolean(city?.active)}
          diasporaPlan={diasporaPlan}
        />
      </AppColumn>
    </>
  );
}

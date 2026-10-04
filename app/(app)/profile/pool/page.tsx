import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScreenBand } from "@/components/app/screen-band";
import { PoolChoice } from "@/components/profile/pool-choice";
import { TIER_LABELS } from "@/lib/entitlements";
import type { MatchPool, Tier } from "@/lib/types/profile";

export const metadata: Metadata = { title: "Your match pool", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Members abroad choose their pool (pool-choice.slim.html; PRD §5.6). */
export default async function PoolPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: tierRow }] = await Promise.all([
    supabase.from("profiles").select("country_code, pool, diaspora_city").eq("id", user.id).maybeSingle(),
    supabase.rpc("current_tier", { p_profile_id: user.id }),
  ]);
  if (!profile) redirect("/verify");
  // Members in Nigeria have one pool; their setting is "open to abroad".
  if (profile.country_code === "NG") redirect("/profile/preferences");

  const { data: city } = profile.diaspora_city
    ? await supabase.from("diaspora_cities").select("label, active").eq("slug", profile.diaspora_city).maybeSingle()
    : { data: null };
  const tier = (tierRow as Tier | null) ?? "starter";
  const diasporaPlan = tier === "diaspora" || tier === "diaspora_plus";
  const cityLabel = city?.label ?? "your city";

  return (
    <>
      <ScreenBand title="Your match pool" sub={`${city?.label ?? "City not set"} · ${TIER_LABELS[tier]} plan`} back="/profile" />
      <PoolChoice
        city={cityLabel}
        hasCity={Boolean(city)}
        diasporaPlan={diasporaPlan}
        cityOpen={Boolean(city?.active)}
        current={diasporaPlan ? ((profile.pool as MatchPool) ?? "back_home") : "back_home"}
      />
    </>
  );
}

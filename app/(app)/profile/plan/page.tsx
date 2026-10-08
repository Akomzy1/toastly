import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScreenBand } from "@/components/app/screen-band";
import { HelpButton } from "@/components/help/help-button";
import { PlanPage, type Grant, type Sub } from "@/components/plan/plan-page";
import { paymentsConfigured } from "@/lib/payments/config";
import { TIER_LABELS } from "@/lib/entitlements";
import { countryInSentence } from "@/lib/countries";
import { requireLiveProfile } from "@/lib/live-profile";
import { ProfileNotLive } from "@/components/app/profile-not-live";
import { paymentsOpenFor } from "@/lib/launch";
import type { Tier } from "@/lib/types/profile";

export const metadata: Metadata = { title: "Your plan", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Your plan (PRD §7). NOT IN A PROTOTYPE — flagged; see the component.
 * Checkout itself is Paystack's or Stripe's hosted page.
 */
export default async function YourPlan({ searchParams }: { searchParams: { paid?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // No plan screen before going live (PRD §7.3).
  const live = await requireLiveProfile(supabase);
  if (!live.live) return <ProfileNotLive status={live} />;
  // Before launch, only the allow-list can pay (lib/launch.ts).
  const open = await paymentsOpenFor(supabase, user);

  const [{ data: tierRow }, { data: profile }, { data: grants }, { data: subs }, { data: total }, { data: cfg }] = await Promise.all([
    supabase.rpc("current_tier", { p_profile_id: user.id }),
    supabase.from("profiles").select("country_code").eq("id", user.id).maybeSingle(),
    supabase
      .from("entitlements")
      .select("tier, source, ends_at")
      .neq("tier", "starter")
      .gt("ends_at", new Date().toISOString())
      .order("ends_at", { ascending: false }),
    supabase.from("subscriptions").select("id, provider, tier, status, current_period_end").neq("status", "ended").order("created_at", { ascending: false }),
    supabase.rpc("coin_balance", { p_profile_id: user.id }),
    supabase.from("coin_config").select("premium_coins, premium_plus_coins, coin_naira").maybeSingle(),
  ]);

  const tier = (tierRow as Tier | null) ?? "starter";
  const country = profile?.country_code ?? "NG";
  const naira = country === "NG";

  // Decided 6 October 2026: don't promise diaspora-community matching to a
  // member whose country has no open city — say what the plan gives them.
  const { count: openCities } = naira
    ? { count: 0 }
    : await supabase.from("diaspora_cities").select("slug", { count: "exact", head: true }).eq("country_code", country).eq("active", true);
  const communityOpen = !naira && (openCities ?? 0) > 0;

  return (
    <>
      <ScreenBand title="Your plan" sub={TIER_LABELS[tier]} />
      <PlanPage
        tierLabel={TIER_LABELS[tier]}
        track={naira ? "ngn" : "usd"}
        community={naira || communityOpen ? null : { country: countryInSentence(country) }}
        grants={(grants ?? []) as Grant[]}
        subs={(subs ?? []) as Sub[]}
        coins={Math.max(0, (total as number | null) ?? 0)}
        premiumCoins={cfg?.premium_coins ?? 35}
        premiumPlusCoins={cfg?.premium_plus_coins ?? 70}
        coinNaira={cfg?.coin_naira ?? 100}
        paystackOn={open && paymentsConfigured("paystack")}
        stripeOn={open && paymentsConfigured("stripe")}
        closed={!open}
        paid={searchParams.paid ?? null}
      />
      <div className="mx-auto w-full max-w-[680px] px-3.5 pb-8">
        <HelpButton />
      </div>
    </>
  );
}

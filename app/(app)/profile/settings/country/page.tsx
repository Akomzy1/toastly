import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScreenBand } from "@/components/app/screen-band";
import { CountrySettings } from "@/components/where-you-live/flows";
import { TIER_LABELS } from "@/lib/entitlements";
import { dayMonth, loadCities } from "@/lib/where-you-live";
import type { Tier } from "@/lib/types/profile";

export const metadata: Metadata = { title: "Where you live", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const CHANGE_EVERY_DAYS = 30;

/**
 * Changing where you live — where-you-live-settings.slim.html. Once every 30
 * days (the database enforces it; this screen shows the next date and makes
 * the options read-only inside the window). On a paid plan, one line says
 * it runs to the end of its period and then renews on the new country's
 * plans.
 */
export default async function WhereYouLiveSettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: me }, { data: paid }, { data: subs }] = await Promise.all([
    supabase.from("profiles").select("country_code, diaspora_city, country_changed_at").eq("id", user.id).maybeSingle(),
    supabase
      .from("entitlements")
      .select("tier, ends_at")
      .eq("profile_id", user.id)
      .eq("source", "subscription")
      .gt("ends_at", new Date().toISOString())
      .order("ends_at", { ascending: false })
      .limit(1),
    supabase
      .from("subscriptions")
      .select("tier, current_period_end, status")
      .in("status", ["active", "non_renewing", "past_due"])
      .order("current_period_end", { ascending: false })
      .limit(1),
  ]);
  if (!me) redirect("/verify");

  const changedAt = me.country_changed_at ? new Date(me.country_changed_at) : null;
  const nextChange = changedAt ? new Date(changedAt.getTime() + CHANGE_EVERY_DAYS * 86_400_000) : null;
  const lockedUntil = nextChange && nextChange > new Date() ? dayMonth(nextChange) : null;

  const grant = paid?.[0];
  const sub = subs?.[0];
  const until = sub?.current_period_end ?? grant?.ends_at ?? null;
  const plan = grant && until ? { name: TIER_LABELS[(sub?.tier ?? grant.tier) as Tier], until: dayMonth(new Date(until)) } : null;

  return (
    <>
      <ScreenBand title="Where you live" sub="Settings" back="/profile/settings" />
      <CountrySettings
        current={me.country_code}
        cityOnFile={me.diaspora_city}
        cities={await loadCities(supabase)}
        lockedUntil={lockedUntil}
        plan={plan}
      />
    </>
  );
}

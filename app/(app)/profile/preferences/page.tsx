import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScreenBand } from "@/components/app/screen-band";
import { MatchPreferences } from "@/components/profile/match-preferences";

export const metadata: Metadata = { title: "Match preferences", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Who shows up in a member's six (match-preferences.slim.html): the age
 * range for every member, and "Open to people living abroad" for members in
 * Nigeria. Members abroad reach their pool from here.
 */
export default async function PreferencesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: profile }, { data: age }] = await Promise.all([
    supabase.from("profiles").select("country_code, city, open_to_abroad").eq("id", user.id).maybeSingle(),
    supabase.rpc("my_age_range"),
  ]);
  if (!profile) redirect("/verify");
  const range = (age as { lo: number; hi: number; floor: number; cap: number } | null) ?? { lo: 18, hi: 70, floor: 18, cap: 70 };

  return (
    <>
      <ScreenBand title="Match preferences" back="/profile/settings" />
      <MatchPreferences
        city={profile.city}
        openToAbroad={profile.open_to_abroad ?? true}
        abroad={profile.country_code !== "NG"}
        age={range}
      />
    </>
  );
}

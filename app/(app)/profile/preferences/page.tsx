import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScreenBand } from "@/components/app/screen-band";
import { MatchPreferences } from "@/components/profile/match-preferences";

export const metadata: Metadata = { title: "Match preferences", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Members in Nigeria: who shows up in their six (open-to-abroad.slim.html). */
export default async function PreferencesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("country_code, city, open_to_abroad").eq("id", user.id).maybeSingle();
  if (!profile) redirect("/verify");
  // Members abroad choose a pool instead.
  if (profile.country_code !== "NG") redirect("/profile/pool");

  return (
    <>
      <ScreenBand title="Match preferences" back="/profile" />
      <MatchPreferences city={profile.city} openToAbroad={profile.open_to_abroad ?? true} />
    </>
  );
}

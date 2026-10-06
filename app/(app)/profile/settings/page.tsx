import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScreenBand } from "@/components/app/screen-band";
import { SavedToast } from "@/components/where-you-live/flows";
import { SettingsList } from "@/components/where-you-live/settings-list";
import { COUNTRY_NAME } from "@/lib/countries";
import { maskPhone } from "@/lib/where-you-live";

export const metadata: Metadata = { title: "Settings", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Settings (where-you-live-settings.slim.html): phone, where you live, match preferences. */
export default async function SettingsPage({ searchParams }: { searchParams: { saved?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase.from("profiles").select("country_code, diaspora_city").eq("id", user.id).maybeSingle();
  if (!me) redirect("/verify");
  const { data: city } =
    me.diaspora_city && me.country_code !== "NG"
      ? await supabase.from("diaspora_cities").select("label").eq("slug", me.diaspora_city).maybeSingle()
      : { data: null };
  const country = COUNTRY_NAME[me.country_code] ?? me.country_code;
  const home = city?.label ? `${city.label}, ${country}` : country;

  return (
    <>
      <ScreenBand title="Settings" back="/profile" />
      <SettingsList phone={maskPhone(user.phone)} home={home} abroad={me.country_code !== "NG"} />
      {searchParams.saved === "where-you-live" ? <SavedToast text={`Saved. Where you live is now ${home}.`} /> : null}
    </>
  );
}

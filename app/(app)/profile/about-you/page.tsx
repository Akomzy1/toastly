import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScreenBand } from "@/components/app/screen-band";
import { getGenderOptions, parseGender } from "@/lib/gender-options";
import { AboutYouForm } from "./about-you-form";

export const metadata: Metadata = { title: "About you", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * About you: woman or man (0036). Asked at sign-up; this is where an older
 * account — or one that chose Non-binary or Prefer not to say before the
 * change — sets it. Open whatever the member's status.
 */
export default async function AboutYouPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: me }, options] = await Promise.all([
    supabase.from("profiles").select("gender, first_live_at").eq("id", user.id).maybeSingle(),
    getGenderOptions(supabase),
  ]);
  return (
    <>
      <ScreenBand title="About you" sub="Woman or man" back="/profile/preferences" />
      <AboutYouForm
        options={options}
        gender={me?.gender ?? null}
        // Locked once live — unless the old answer isn't woman or man.
        genderLocked={Boolean(me?.first_live_at) && parseGender(me?.gender ?? "") !== null}
      />
    </>
  );
}

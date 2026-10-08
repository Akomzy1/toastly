import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScreenBand } from "@/components/app/screen-band";
import { getGenderOptions } from "@/lib/gender-options";
import { AboutYouForm } from "./about-you-form";

export const metadata: Metadata = { title: "About you", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * About you: gender and who you'd like to meet (0036). Asked at sign-up;
 * this is where an older account sets them, and where anyone changes who
 * they'd like to meet. Open whatever the member's status.
 */
export default async function AboutYouPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: me }, options] = await Promise.all([
    supabase.from("profiles").select("gender, seeking, first_live_at").eq("id", user.id).maybeSingle(),
    getGenderOptions(supabase),
  ]);
  return (
    <>
      <ScreenBand title="About you" sub="Who you are, and who you'd like to meet" back="/profile/preferences" />
      <AboutYouForm
        options={options}
        gender={me?.gender ?? null}
        seeking={(me?.seeking as string[] | null) ?? []}
        genderLocked={Boolean(me?.first_live_at)}
      />
    </>
  );
}

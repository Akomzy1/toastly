import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScreenBand } from "@/components/app/screen-band";
import { ProfileHub, type HubPrompt } from "@/components/profile/profile-hub";
import { TIER_LABELS } from "@/lib/entitlements";
import type { Tier } from "@/lib/types/profile";

export const metadata: Metadata = {
  title: "Profile",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/** Profile as the hub — nav-profile-hub.slim.html. The long form lives at /profile/edit. */
export default async function ProfilePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: birth }, { data: tierRow }, { data: answers }, { data: isLive }] = await Promise.all([
    supabase.from("profiles").select("display_name, city, stage, country_code").eq("id", user.id).maybeSingle(),
    supabase.from("profile_birthdates").select("date_of_birth").eq("profile_id", user.id).maybeSingle(),
    supabase.rpc("current_tier", { p_profile_id: user.id }),
    supabase.from("prompt_answers").select("prompt_id, answer, prompts(text, sort_order)").eq("profile_id", user.id),
    supabase.rpc("profile_is_live", { p_profile_id: user.id }),
  ]);
  if (!profile) redirect("/verify");

  // Your own age, from your own private date of birth — shown only to you here.
  let age: number | null = null;
  if (birth?.date_of_birth) {
    const dob = new Date(birth.date_of_birth);
    const now = new Date();
    const birthdayThisYear = new Date(Date.UTC(now.getUTCFullYear(), dob.getUTCMonth(), dob.getUTCDate()));
    age = now.getUTCFullYear() - dob.getUTCFullYear() - (now < birthdayThisYear ? 1 : 0);
  }
  const tier = (tierRow as Tier | null) ?? "starter";
  const prompts: HubPrompt[] = (answers ?? [])
    .map((a) => {
      const p = Array.isArray(a.prompts) ? a.prompts[0] : (a.prompts as { text?: string; sort_order?: number } | null);
      return { id: a.prompt_id as number, prompt: p?.text ?? "", answer: a.answer as string, order: p?.sort_order ?? 0 };
    })
    .sort((x, y) => x.order - y.order)
    .map(({ id, prompt, answer }) => ({ id, prompt, answer }));

  const name = `${profile.display_name}${age !== null ? `, ${age}` : ""}`;
  const meta = [profile.city, TIER_LABELS[tier]].filter(Boolean).join(" · ");

  return (
    <>
      <ScreenBand title="Profile" sub="You, as others see you" />
      <ProfileHub
        name={name}
        meta={meta}
        verified={profile.stage === "verified_real" || profile.stage === "id_confirmed"}
        prompts={prompts}
        abroad={(profile.country_code ?? "NG") !== "NG"}
        live={isLive === true}
      />
    </>
  );
}

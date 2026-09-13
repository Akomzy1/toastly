import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./profile-form";
import type { Profile } from "@/lib/types/profile";

export const metadata: Metadata = {
  title: "Your profile",
  robots: { index: false, follow: false },
};

export default async function ProfilePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  if (!profile) redirect("/verify");

  return (
    <div className="mx-auto grid max-w-[720px] gap-6 px-5 py-section-y">
      <div className="grid gap-2">
        <h1 className="text-h3 text-ink-900">Your profile</h1>
        <p className="text-ui text-grey-600">
          Your prompt answers are what people read first. Everything below the
          basics is optional.
        </p>
      </div>
      <ProfileForm profile={profile} />
    </div>
  );
}

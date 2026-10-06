import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppBand } from "@/components/app/app-band";
import { YourDataList } from "@/components/account/your-data-list";

export const metadata: Metadata = { title: "Your data", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Download and delete — privacy policy section 10 (your-data.slim.html).
 * ALWAYS OPEN: no plan, no live-profile guard (PRD §5.1.2).
 */
export default async function YourDataPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("photo_reveal, country_code, open_to_abroad").eq("id", user.id).maybeSingle();

  return (
    <>
      <AppBand title="Your data" sub="Settings" backHref="/profile" />
      <YourDataList
        photoReveal={me?.photo_reveal ?? "verified_members"}
        inNigeria={(me?.country_code ?? "NG") === "NG"}
        openToAbroad={me?.open_to_abroad ?? true}
      />
    </>
  );
}

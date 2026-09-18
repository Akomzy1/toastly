import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { ShareDate } from "@/components/safety/share-date";
import { SafetySettings } from "@/components/safety/safety-settings";
import { EmergencyContact } from "@/components/safety/emergency-contact";
import { emergencyNumbersFor, type PhotoReveal } from "@/lib/safety";

export const metadata: Metadata = {
  title: "Safety kit",
  robots: { index: false, follow: false },
};

/**
 * The in-app safety kit (PRD §5.1).
 *
 * At /safety-kit because /safety is the public marketing page.
 *
 * This page reads no plan and shows no upgrade prompt. Every tool on it is
 * free for every member, always — and it is available to everyone, not only
 * women, even though the PRD names it the "women's safety kit": that name
 * describes who it was designed around, not who may use it.
 */
export default async function SafetyKitPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("display_name, country_code, photo_reveal, blur_incoming_images")
    .eq("id", user.id)
    .single();

  const numbers = emergencyNumbersFor(me?.country_code ?? "NG");

  // Decision (d). Only the last four digits reach the client: the full number
  // has no reason to sit in a page payload.
  const { data: contactRow } = await supabase
    .from("emergency_contacts")
    .select("label, phone_e164, confirmed_at")
    .eq("profile_id", user.id)
    .maybeSingle();

  const contact = contactRow
    ? {
        label: contactRow.label,
        lastFour: String(contactRow.phone_e164).slice(-4),
        confirmed: Boolean(contactRow.confirmed_at),
      }
    : null;

  return (
    <div className="mx-auto grid max-w-[640px] gap-6 px-5 py-section-y">
      <div className="grid gap-2">
        <h1 className="text-h3 text-ink-900">Safety kit</h1>
        <p className="text-ui text-grey-600">
          Tools for meeting people safely. Every one of them is free, on every
          plan — none of it is part of a subscription, and none of it ever will
          be.
        </p>
      </div>

      <ShareDate firstName={me?.display_name ?? "a Toastly member"} numbers={numbers} />

      <EmergencyContact contact={contact} />

      <SafetySettings
        photoReveal={(me?.photo_reveal as PhotoReveal | null) ?? "verified_members"}
        blurImages={me?.blur_incoming_images ?? true}
      />

      <Card className="grid gap-3 p-[26px]">
        <h2 className="text-h5 text-ink-900">Report or block</h2>
        <p className="text-ui text-grey-600">
          You can report or block anyone from their match card. Reports on
          verified accounts reach a person on our team in Lagos within 24 hours.
          Blocking is permanent and the other person isn&rsquo;t told.
        </p>
        <Notice tone="info">
          If someone here is married, report it — it has its own category.
          Nobody can check marital status, so reports are how that rule is kept.
        </Notice>
      </Card>
    </div>
  );
}

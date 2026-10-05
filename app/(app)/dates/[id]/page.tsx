import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireLiveProfile } from "@/lib/live-profile";
import { ProfileNotLive } from "@/components/app/profile-not-live";
import { coinsOpen } from "@/lib/coins";
import { DateView, type DateInfo } from "./date-view";

export const metadata: Metadata = {
  title: "Your date",
  robots: { index: false, follow: false },
};

/**
 * One date — date-stake-confirm, date-checkin, date-cancel and
 * date-outcomes (design/prototype). Held from production with the coin
 * balance until the legal check clears.
 *
 * The live guard applies to anyone without a date here. A member WITH a
 * date always reaches it: check-in, cancelling and the safety exits must
 * never depend on their profile's status that day (see dates/actions.ts).
 */
export default async function DatePage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const live = await requireLiveProfile(supabase);
  const { data } = await supabase.rpc("date_for_member", { p_commitment: params.id });
  const date = data as DateInfo | null;
  if (!date && !live.live) return <ProfileNotLive status={live} />;
  if (!date) notFound();

  return <DateView date={date} open={coinsOpen()} />;
}

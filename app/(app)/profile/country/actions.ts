"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stopRenewal } from "@/lib/payments/stop-renewal";
import { isLiveCountry } from "@/lib/countries";

export type WhereYouLiveResult = { error?: string; ok?: true };

type SetCountryResult = {
  country: string;
  city: string | null;
  track_changed: boolean;
  stop_renewing: { id: string; tier: string; ends: string | null }[];
};

/**
 * Save where the member lives (migration 0027).
 *
 * "confirm" is the first answer — after the phone code at sign-up, or the
 * one-time check for members who joined before the step existed. "change"
 * is from settings: at most once every 30 days, which the database enforces.
 * Both log the change and raise a review signal (never a block) when the
 * phone's country code disagrees.
 *
 * A move that changes pricing track (Nigeria <-> abroad) leaves any renewing
 * plan running to the end of its period and stops it renewing; the member
 * then chooses from the new country's plans.
 */
export async function saveWhereYouLive(
  mode: "confirm" | "change",
  country: string,
  city: string | null,
): Promise<WhereYouLiveResult> {
  if (!isLiveCountry(country)) return { error: "Choose a country from the list." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  const { data, error } = await supabase.rpc(mode === "confirm" ? "confirm_country" : "change_country", {
    p_country: country,
    p_city: country === "NG" ? null : city || null,
  });
  if (error) {
    // The database's own messages are written for members (22023); anything
    // else is for the logs.
    if (error.code === "22023") return { error: error.message };
    console.error("[where-you-live] save failed:", error.message);
    return { error: "That didn't save. Try again." };
  }

  const result = data as SetCountryResult;
  if (result.stop_renewing?.length) {
    const admin = createAdminClient();
    const { data: subs } = await supabase
      .from("subscriptions")
      .select("id, provider, tier")
      .in("id", result.stop_renewing.map((s) => s.id));
    for (const s of subs ?? []) {
      // Best effort: the plan is already marked (track_changed_at), so a
      // provider that can't be reached now is visible and can be retried.
      const r = admin
        ? await stopRenewal(admin, { id: s.id, provider: s.provider, tier: s.tier, profileId: user.id })
        : { error: "no service role" };
      if (r.error) console.error("[where-you-live] couldn't stop renewal:", s.id, r.error);
    }
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

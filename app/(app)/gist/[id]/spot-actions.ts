"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findPublicVenues, placesConfigured } from "@/lib/places";
import { notLiveError, requireLiveProfile } from "@/lib/live-profile";

export type SpotState = { error?: string; ok?: string } | null;

/**
 * Suggest date spots after a mutual "continue".
 *
 * Order of events matters: the database refuses to store a suggestion until
 * gist_mutual_continue() is true (0011), because a suggestion appearing early
 * would leak the other person's private answer.
 *
 * WHERE WE SEARCH — and a limitation worth stating. PRD §5.5 asks for spots
 * "roughly mid-point between the two users … given the users' stated
 * neighbourhoods". There is no neighbourhood field and no coordinates on a
 * profile; `city` is free text. So this anchors on a city:
 *
 *   - both in the same city  -> that city, marked 'midpoint'
 *   - one in Nigeria, one abroad -> the Nigeria-based member's city, marked
 *     'nigeria_side', and the UI says which side it chose
 *
 * True midpoint needs a neighbourhood or coordinate field that does not exist
 * yet. Recorded rather than faked.
 */
export async function suggestSpots(
  _prev: SpotState,
  formData: FormData,
): Promise<SpotState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };
  const live = await requireLiveProfile(supabase);
  if (!live.live) return { error: notLiveError(live) };

  const sessionId = String(formData.get("session_id") ?? "");
  if (!sessionId) return { error: "Which session is this for?" };

  if (!placesConfigured()) {
    return {
      error:
        "Spot suggestions aren't connected yet. You can still agree a place between you — pick somewhere public.",
    };
  }

  const { data: mutual } = await supabase.rpc("gist_mutual_continue", {
    p_session_id: sessionId,
  });
  if (!mutual) {
    return { error: "Suggestions appear once you've both said continue." };
  }

  const { data: session } = await supabase
    .from("gist_sessions")
    .select("proposer_id, invitee_id")
    .eq("id", sessionId)
    .single();
  if (!session) return { error: "That session doesn't exist." };

  // Both members' city and country, only to place the venue — read by the
  // server, never by either member's session (0033), and only after both
  // said continue (checked above). Neither is shown or stored.
  const admin = createAdminClient();
  if (!admin) return { error: "Spot suggestions aren't available right now. Agree somewhere public between you." };
  const { data: people } = await admin
    .from("profiles")
    .select("id, city, country_code")
    .in("id", [session.proposer_id, session.invitee_id]);

  const a = (people ?? []).find((p) => p.id === session.proposer_id);
  const b = (people ?? []).find((p) => p.id === session.invitee_id);

  const nigerian = [a, b].find((p) => p?.country_code === "NG");
  const bothNigerian = a?.country_code === "NG" && b?.country_code === "NG";
  const anchor: "midpoint" | "nigeria_side" =
    bothNigerian || a?.country_code === b?.country_code ? "midpoint" : "nigeria_side";

  const near =
    anchor === "nigeria_side" ? nigerian?.city : a?.city ?? b?.city;

  if (!near) {
    return {
      error:
        "Add your city in your profile and we can suggest somewhere public to meet.",
    };
  }

  const venues = await findPublicVenues({ near, limit: 5 });
  if (venues.length === 0) {
    return {
      error:
        "Nothing came back for that city just now. Try again later, or agree somewhere public between you.",
    };
  }

  const { error } = await supabase.from("date_spots").insert(
    venues.map((v) => ({
      session_id: sessionId,
      place_id: v.place_id,
      name: v.name,
      address: v.address,
      category: v.category,
      lat: v.lat,
      lng: v.lng,
      anchor,
    })),
  );

  if (error) return { error: error.message };

  revalidatePath(`/gist/${sessionId}`);
  return { ok: "A few public places you could meet." };
}

/**
 * Accept, swap or ignore a suggestion.
 *
 * Accepting records a choice; it books nothing and tells no one. The stake
 * flow (PRD §5.5) is the next step and stays a separate, deliberate act.
 */
export async function setSpotStatus(
  _prev: SpotState,
  formData: FormData,
): Promise<SpotState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };
  const live = await requireLiveProfile(supabase);
  if (!live.live) return { error: notLiveError(live) };

  const spotId = String(formData.get("spot_id") ?? "");
  const sessionId = String(formData.get("session_id") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!["accepted", "swapped", "ignored"].includes(status)) {
    return { error: "That isn't something you can do to a suggestion." };
  }

  const { error } = await supabase
    .from("date_spots")
    .update({ status })
    .eq("id", spotId);

  if (error) return { error: error.message };

  revalidatePath(`/gist/${sessionId}`);
  return {
    ok:
      status === "accepted"
        ? "Saved. Agree a time between you, then you can both stake it."
        : "Noted.",
  };
}

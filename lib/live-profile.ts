import type { createClient } from "@/lib/supabase/server";

/**
 * No live profile, no access (PRD §5.1.2). Ported from
 * live-profile-and-prompt-14 onto main (0029).
 *
 * "You can't look at people who can't see you." Until a member's own profile
 * is live — phone confirmed, Verified Real passed, not restricted, four
 * photos, main photo face-matched — they can't load a feed, see another
 * member, send or accept a Gist invite, message, or arrange a date.
 *
 * The DATABASE is the control: 0029 puts the rule in row-level security and
 * in every feed, invite, message and date function, so a client calling the
 * API directly is refused exactly as the app is. This module lets guarded
 * pages and actions say why, in plain words, instead of an empty list or a
 * raw 403.
 *
 * Every page, route handler and server action in a feed, profile-view,
 * invite, message or date route must call requireLiveProfile() and act on
 * the result; scripts/check-constraints.mjs fails the build if one doesn't.
 *
 * Never call it from what stays open whatever the status: verification,
 * photos, Toastly Help, settings, Your data (export and deletion), the safety
 * kit, report and block, Couple Mode, coins, and attendance and safety on a
 * date already arranged.
 */

type Supabase = ReturnType<typeof createClient>;

export type LiveStatus = {
  live: boolean;
  /** Was live before: "access paused", not "not live yet". */
  wasLive: boolean;
  phoneConfirmed: boolean;
  verifiedReal: boolean;
  /** Restricted by a person in review (0025) — never automatically. */
  restricted: boolean;
  photoCount: number;
  minPhotos: number;
  mainPhoto: "matched" | "checking" | "missing";
  /** Gender and who they'd like to meet (0036). */
  aboutYou: boolean;
  /** At least one prompt answer (0036). */
  firstAnswer: boolean;
};

const NOT_LIVE: LiveStatus = {
  live: false,
  wasLive: false,
  phoneConfirmed: false,
  verifiedReal: false,
  restricted: false,
  photoCount: 0,
  minPhotos: 4,
  mainPhoto: "missing",
  aboutYou: false,
  firstAnswer: false,
};

/**
 * The signed-in member's own live status. Fails closed: if it can't be read,
 * the member is treated as not live. Never throws, so a guarded page can
 * always render its explanation.
 */
export async function requireLiveProfile(supabase: Supabase): Promise<LiveStatus> {
  const { data, error } = await supabase.rpc("live_profile_status");
  if (error || !data) return NOT_LIVE;
  const s = data as Record<string, unknown>;
  return {
    live: s.live === true,
    wasLive: s.was_live === true,
    phoneConfirmed: s.phone === true,
    verifiedReal: s.verified === true,
    restricted: s.restricted === true,
    photoCount: Number(s.photo_count ?? 0),
    minPhotos: Number(s.photos_min ?? 4),
    mainPhoto: s.main === "matched" ? "matched" : s.main === "pending" || s.main === "review" ? "checking" : "missing",
    aboutYou: s.about_you === true,
    firstAnswer: s.prompt === true,
  };
}

/** What a guarded server action returns to a member who isn't live. */
export function notLiveError(status: LiveStatus): string {
  if (status.restricted) return "Your account is restricted while our team reviews it, so this is paused.";
  return status.wasLive
    ? "Your profile is hidden for now, so this is paused. Open Today to see what's needed to restore it."
    : "Your profile isn't live yet. Finish verification, add your photos and answer a prompt first.";
}

/** True when the database refused because someone in it isn't live (PT403). */
export function isNotLiveError(error: { message?: string; code?: string } | null): boolean {
  return Boolean(error && (error.code === "PT403" || /isn't live yet/.test(error.message ?? "")));
}

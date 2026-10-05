import type { createClient } from "@/lib/supabase/server";

/**
 * No live profile, no access (PRD §5.1.2).
 *
 * "You can't look at people who can't see you." Until a member's own profile
 * is live — phone confirmed, Verified Real passed, four photos, main photo
 * face-matched — they cannot load a feed, see another member, send or accept
 * a Gist invite, message, or arrange a date.
 *
 * The DATABASE is the control: 0013 puts the same rule in row-level security
 * and in every feed, invite, message and date function, so a client calling
 * the API directly is refused exactly as the app is. This module exists so
 * that guarded pages and actions can say why, in plain words, instead of
 * rendering an empty list or a raw 403.
 *
 * Every page, route handler and server action in a feed, profile-view,
 * invite, message or date route must call requireLiveProfile() and act on
 * the result. scripts/check-constraints.mjs fails the build if one doesn't.
 *
 * Always available whatever the status: verification, photo upload, account
 * and privacy settings, the safety kit, report and block — and, once they
 * exist, Toastly Help, data export and account deletion. Never call this
 * from any of those.
 */

type Supabase = ReturnType<typeof createClient>;

export type LiveStatus = {
  live: boolean;
  /** Was live before. Distinguishes "access paused" from "not live yet". */
  wasLive: boolean;
  phoneConfirmed: boolean;
  verifiedReal: boolean;
  photoCount: number;
  minPhotos: number;
  mainPhoto: "matched" | "checking" | "missing";
  /** A replacement main photo is being checked; the matched one stays live. */
  replacementChecking: boolean;
  /** Set by a person in review (0018), never automatically. */
  standing: "good" | "restricted" | "removed";
  /** The category the member is told (CLAUDE.md: always told why). */
  standingReason: "pricing" | "safety" | "married" | "photos" | "verification" | "other" | null;
};

const NOT_LIVE: LiveStatus = {
  live: false,
  wasLive: false,
  phoneConfirmed: false,
  verifiedReal: false,
  photoCount: 0,
  minPhotos: 4,
  mainPhoto: "missing",
  replacementChecking: false,
  standing: "good",
  standingReason: null,
};

/**
 * The signed-in member's own live status.
 *
 * Fails closed: if the status can't be read, the member is treated as not
 * live. Never throws, so a guarded page can always render its explanation.
 */
export async function requireLiveProfile(supabase: Supabase): Promise<LiveStatus> {
  const { data, error } = await supabase.rpc("live_profile_status");
  if (error || !data) return NOT_LIVE;

  const s = data as Record<string, unknown>;
  return {
    live: s.live === true,
    wasLive: s.was_live === true,
    phoneConfirmed: s.phone_confirmed === true,
    verifiedReal: s.verified_real === true,
    photoCount: Number(s.photo_count ?? 0),
    minPhotos: Number(s.min_photos ?? 4),
    mainPhoto:
      s.main_photo === "matched" || s.main_photo === "checking"
        ? s.main_photo
        : "missing",
    replacementChecking: s.replacement_checking === true,
    standing: s.standing === "restricted" || s.standing === "removed" ? s.standing : "good",
    standingReason: (s.standing_reason as LiveStatus["standingReason"]) ?? null,
  };
}

/** What a guarded server action returns to a member who isn't live. */
export function notLiveError(status: LiveStatus): string {
  return status.wasLive
    ? "Your profile is hidden for now, so this is paused. Open Today's matches to see what's needed to restore it."
    : "Your profile isn't live yet. Finish verification and add your photos first.";
}

/**
 * True when the database refused a write because someone in it isn't live.
 * 0013 raises `profile_not_live` (SQLSTATE PT403) — for the caller, or for
 * the other person when their profile has since been hidden.
 */
export function isNotLiveError(error: { message?: string; code?: string } | null): boolean {
  return Boolean(error && (error.code === "PT403" || /profile_not_live/.test(error.message ?? "")));
}

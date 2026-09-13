/**
 * Profile and entitlement types, mirroring supabase/migrations/0001.
 *
 * The product rules these encode are enforced in SQL and RLS, not here —
 * types are documentation, not a control.
 */

export type IntentLevel =
  | "casual"
  | "open_to_serious"
  | "serious"
  | "marriage_minded";

export type RelationshipHistory =
  | "single"
  | "divorced"
  | "widowed"
  | "single_parent";

export type FieldVisibility = "private" | "on_match" | "public";

export type Tier =
  | "starter"
  | "premium"
  | "premium_plus"
  | "diaspora"
  | "diaspora_plus";

export type VerificationStage =
  | "unverified"
  | "phone_verified"
  | "verified_real"
  | "id_confirmed";

export type MatchPool = "back_home" | "diaspora" | "both";

export type Profile = {
  id: string;
  created_at: string;
  updated_at: string;
  display_name: string;
  date_of_birth: string | null;
  city: string | null;
  country_code: string;
  bio: string | null;
  gender: "woman" | "man" | "non_binary" | "prefer_not_to_say" | null;
  /** Collected, filterable, never a gate. */
  intent: IntentLevel | null;
  pool: MatchPool;

  // Optional, display-only. Never used to exclude anyone from anyone's feed.
  religion: string | null;
  tribe: string | null;
  languages: string[];
  history: RelationshipHistory | null;
  has_children: boolean | null;
  profession: string | null;
  education: string | null;

  religion_visibility: FieldVisibility;
  tribe_visibility: FieldVisibility;
  languages_visibility: FieldVisibility;
  profession_visibility: FieldVisibility;
  education_visibility: FieldVisibility;
  /** Defaults to on_match — never public on the feed card by default. */
  history_visibility: FieldVisibility;

  stage: VerificationStage;
  phone_verified_at: string | null;
  liveness_verified_at: string | null;
  id_confirmed_at: string | null;
  profession_verified_at: string | null;

  paused: boolean;
};

/** The "Verified Real" badge: phone + liveness. NIN/BVN is a second ring. */
export function isVerifiedReal(p: Pick<Profile, "stage">): boolean {
  return p.stage === "verified_real" || p.stage === "id_confirmed";
}

export function hasSecondRing(p: Pick<Profile, "stage">): boolean {
  return p.stage === "id_confirmed";
}

/**
 * The optional fields, in one place, so a screen can render them
 * consistently and nothing can quietly treat one as required.
 */
export const OPTIONAL_FIELDS = [
  "religion",
  "tribe",
  "languages",
  "history",
  "has_children",
  "profession",
  "education",
] as const;

export type OptionalField = (typeof OPTIONAL_FIELDS)[number];

export const INTENT_LABELS: Record<IntentLevel, string> = {
  casual: "Casual — seeing who's out there",
  open_to_serious: "Open to something serious",
  serious: "Looking for a relationship",
  marriage_minded: "Marriage-minded",
};

export const HISTORY_LABELS: Record<RelationshipHistory, string> = {
  single: "Single",
  divorced: "Divorced",
  widowed: "Widowed",
  single_parent: "Single parent",
};

export const VISIBILITY_LABELS: Record<FieldVisibility, string> = {
  private: "Only me",
  on_match: "Revealed when we match",
  public: "On my profile",
};

export const POOL_LABELS: Record<MatchPool, string> = {
  back_home: "Back home",
  diaspora: "My diaspora community",
  both: "Both",
};

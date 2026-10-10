import type { SupabaseClient } from "@supabase/supabase-js";
import type { FaithFields } from "@/lib/faith";
import type { GenotypeValue } from "@/lib/genotype";
import type { ChildrenCount, IntentLevel, RelationshipHistory, VerificationStage, WantsChildren } from "@/lib/types/profile";

/**
 * Another member's profile, as the database gives it to this viewer
 * (profile_for, 0033). The ONLY way the app reads another member: no policy
 * lets a member select another member's row in profiles, profile_history or
 * profile_photos.
 *
 * Only what the owner shows this viewer comes back. A field that isn't shown
 * is absent — not null, not blank — so there is nothing to tell hidden from
 * empty, and nothing hidden ever reaches the server's memory, let alone the
 * browser. null means the viewer can't open this profile at all (0032).
 */
export type MemberProfile = {
  id: string;
  display_name: string;
  city?: string;
  stage: VerificationStage;
  intent?: IntentLevel;
  age?: number;
  /** Matched as this viewer may know it (viewer_matched, 0032). */
  matched: boolean;
  languages?: string[];
  tribe?: string;
  profession?: string;
  profession_verified?: true;
  education?: string;
  history?: RelationshipHistory;
  /** Never "prefer_not_to_say": profile_for leaves that out. */
  children?: Exclude<ChildrenCount, "prefer_not_to_say">;
  wants_children?: WantsChildren;
  genotype?: GenotypeValue;
  /** Only between two people with a Gist between them. */
  time_zone?: string;
  /** Per the owner's reveal choice; main photo first. Storage paths to sign. */
  photos?: { id: string; path: string }[];
} & Partial<Omit<FaithFields, "religion_visibility">>;

export async function getMemberProfile(supabase: SupabaseClient, ownerId: string): Promise<MemberProfile | null> {
  const { data } = await supabase.rpc("profile_for", { p_owner: ownerId });
  return (data as MemberProfile | null) ?? null;
}

/** The same for several members — the day's six, a Gist list. Keyed by id. */
export async function getMemberProfiles(
  supabase: SupabaseClient,
  ownerIds: string[],
): Promise<Record<string, MemberProfile>> {
  const unique = Array.from(new Set(ownerIds));
  const rows = await Promise.all(unique.map((id) => getMemberProfile(supabase, id)));
  const out: Record<string, MemberProfile> = {};
  for (const m of rows) if (m) out[m.id] = m;
  return out;
}

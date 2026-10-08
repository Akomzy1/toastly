import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Woman or man — the only two (decided 8 October 2026; 0036). A man meets
 * women and a woman meets men; there is no separate "who you'd like to meet".
 * The labels come from gender_options, which the database holds to exactly
 * these two codes.
 */
export type GenderOption = { code: "woman" | "man"; label: string };

export const DEFAULT_GENDER_OPTIONS: GenderOption[] = [
  { code: "woman", label: "Woman" },
  { code: "man", label: "Man" },
];

export async function getGenderOptions(supabase: SupabaseClient): Promise<GenderOption[]> {
  const { data, error } = await supabase.from("gender_options").select("code, label").order("sort");
  if (error || !data?.length) return DEFAULT_GENDER_OPTIONS;
  return data as GenderOption[];
}

/** "woman" or "man", or null for anything else. */
export function parseGender(gender: string): "woman" | "man" | null {
  return gender === "woman" || gender === "man" ? gender : null;
}

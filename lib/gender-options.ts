import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Gender and "who you'd like to meet" come from one config list in the
 * database (gender_options, 0036): Woman/Man by default. A member chooses
 * from it at sign-up; the database refuses anything else and matches two
 * members only if each fits the other's choice.
 */
export type GenderOption = { code: string; label: string; plural: string };

/** If the list can't be read, the default — the database still decides. */
export const DEFAULT_GENDER_OPTIONS: GenderOption[] = [
  { code: "woman", label: "Woman", plural: "Women" },
  { code: "man", label: "Man", plural: "Men" },
];

export async function getGenderOptions(supabase: SupabaseClient): Promise<GenderOption[]> {
  const { data, error } = await supabase.from("gender_options").select("code, label, plural").eq("active", true).order("sort");
  if (error || !data?.length) return DEFAULT_GENDER_OPTIONS;
  return data as GenderOption[];
}

/** The member's choices, checked against the list. Null when invalid. */
export function parseGenderChoice(
  options: GenderOption[],
  gender: string,
  seeking: string[],
): { gender: string; seeking: string[] } | null {
  const codes = new Set(options.map((o) => o.code));
  const wanted = Array.from(new Set(seeking)).filter((s) => codes.has(s));
  if (!codes.has(gender) || wanted.length === 0 || wanted.length !== new Set(seeking).size) return null;
  return { gender, seeking: wanted };
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isLiveCountry } from "@/lib/countries";
import type { FieldVisibility } from "@/lib/types/profile";

export type ProfileState = { error?: string; ok?: string } | null;

const VISIBILITIES = ["private", "on_match", "public"] as const;

const CHILDREN_VALUES = ["none", "one", "two", "three_plus", "prefer_not_to_say"] as const;
const WANTS_CHILDREN_VALUES = ["yes", "no", "open", "not_sure"] as const;

function vis(formData: FormData, key: string, fallback: FieldVisibility) {
  const v = String(formData.get(key) ?? "");
  return (VISIBILITIES as readonly string[]).includes(v)
    ? (v as FieldVisibility)
    : fallback;
}

function optional(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? "").trim();
  return v === "" ? null : v;
}

/**
 * Save profile.
 *
 * Every field touched here except display_name is optional and display-only.
 * None of them may ever be used to exclude a member from someone else's feed
 * (CLAUDE.md) — they are stored, shown according to the member's own
 * visibility choice, and may power filters the member applies to their OWN
 * search. Blank is a first-class answer and must never be penalised.
 *
 * Intent is saved when given and left null otherwise. It never blocks.
 */
export async function saveProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  const displayName = String(formData.get("display_name") ?? "").trim();
  if (displayName.length < 2) {
    return { error: "Your name needs at least two characters." };
  }

  const intent = String(formData.get("intent") ?? "");
  const history = String(formData.get("history") ?? "");
  const children = String(formData.get("children") ?? "");
  const wantsChildren = String(formData.get("wants_children") ?? "");
  const languages = String(formData.get("languages") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Where the member lives is set at sign-up and changed in Settings
  // (confirm_country / change_country, 0027) — never here. A member abroad
  // may change their diaspora city here, but only to a city in the country
  // they live in; a Nigeria-based member has none (0010's CHECK agrees).
  const { data: me } = await supabase.from("profiles").select("country_code, diaspora_city").eq("id", user.id).single();
  const country = me?.country_code ?? "NG";
  let diasporaCity: string | null = null;
  const cityRaw = country !== "NG" ? optional(formData, "diaspora_city") : null;
  if (cityRaw) {
    const { data: city } = await supabase
      .from("diaspora_cities")
      .select("slug")
      .eq("slug", cityRaw)
      .eq("country_code", country)
      .maybeSingle();
    if (!city) return { error: "Choose a city in the country you live in." };
    diasporaCity = city.slug;
  }

  // Religion and denomination are NOT saved here: the Faith section saves
  // them on its own, with its consent sheet (faith-actions.ts; PRD §5.2.3).

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      city: optional(formData, "city"),
      bio: optional(formData, "bio"),
      diaspora_city: diasporaCity,
      time_zone: optional(formData, "time_zone"),

      // Never a gate: stored when offered, null when not.
      intent: intent || null,

      tribe: optional(formData, "tribe"),
      languages,
      profession: optional(formData, "profession"),
      education: optional(formData, "education"),

      tribe_visibility: vis(formData, "tribe_visibility", "public"),
      languages_visibility: vis(formData, "languages_visibility", "public"),
      profession_visibility: vis(formData, "profession_visibility", "public"),
      education_visibility: vis(formData, "education_visibility", "public"),

      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  // Relationship history lives in its own table since 0013, where RLS
  // enforces the member's visibility choice. Falls back to on_match, never
  // public — the database default says the same.
  const { error: historyError } = await supabase.from("profile_history").upsert({
    profile_id: user.id,
    history: history || null,
    // 0044: a count only (no names, ages or details), under the same
    // setting as relationship history.
    children: (CHILDREN_VALUES as readonly string[]).includes(children) ? children : null,
    visibility: vis(formData, "history_visibility", "on_match"),
    // Its own setting; shown on the full profile unless hidden.
    wants_children: (WANTS_CHILDREN_VALUES as readonly string[]).includes(wantsChildren) ? wantsChildren : null,
    wants_children_visibility: vis(formData, "wants_children_visibility", "public"),
    updated_at: new Date().toISOString(),
  });
  if (historyError) return { error: historyError.message };

  revalidatePath("/profile");
  return { ok: "Saved." };
}

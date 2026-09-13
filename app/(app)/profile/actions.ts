"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FieldVisibility } from "@/lib/types/profile";

export type ProfileState = { error?: string; ok?: string } | null;

const VISIBILITIES = ["private", "on_match", "public"] as const;

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
  const hasChildren = String(formData.get("has_children") ?? "");
  const languages = String(formData.get("languages") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      city: optional(formData, "city"),
      bio: optional(formData, "bio"),
      pool: String(formData.get("pool") ?? "back_home"),

      // Never a gate: stored when offered, null when not.
      intent: intent || null,

      religion: optional(formData, "religion"),
      tribe: optional(formData, "tribe"),
      languages,
      history: history || null,
      has_children: hasChildren === "" ? null : hasChildren === "yes",
      profession: optional(formData, "profession"),
      education: optional(formData, "education"),

      religion_visibility: vis(formData, "religion_visibility", "public"),
      tribe_visibility: vis(formData, "tribe_visibility", "public"),
      languages_visibility: vis(formData, "languages_visibility", "public"),
      profession_visibility: vis(formData, "profession_visibility", "public"),
      education_visibility: vis(formData, "education_visibility", "public"),
      // Falls back to on_match, never public — the DB default says the same.
      history_visibility: vis(formData, "history_visibility", "on_match"),

      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/profile");
  return { ok: "Saved." };
}

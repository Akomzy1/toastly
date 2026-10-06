"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isLiveCountry } from "@/lib/countries";
import type { FieldVisibility } from "@/lib/types/profile";
import { DENOMINATIONS, FAITH_OTHER_MAX, isListedReligion, type Denomination } from "@/lib/faith";
import { FAITH_CONSENT } from "@/lib/consent";
import { recordConsent } from "@/lib/consent-record";

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

type FaithInput = {
  religion: string | null;
  religion_other: string | null;
  denomination: Denomination | null;
  denomination_other: string | null;
};

/**
 * The faith fields from the form. A religion stored before the option list
 * (free text) comes back unchanged and is kept as it was — the database only
 * checks the list when religion changes.
 */
function readFaith(formData: FormData): FaithInput | { error: string } {
  const religion = optional(formData, "religion");
  const religionOther = religion === "Other" ? optional(formData, "religion_other") : null;
  if (religion === "Other" && (!religionOther || religionOther.length > FAITH_OTHER_MAX)) {
    return { error: `Tell us your religion, in ${FAITH_OTHER_MAX} characters or fewer.` };
  }
  const options = isListedReligion(religion) ? DENOMINATIONS[religion] : undefined;
  const raw = optional(formData, "denomination");
  const denomination = options?.find((d) => d.value === raw)?.value ?? null;
  const denominationOther = denomination === "other" ? optional(formData, "denomination_other") : null;
  if (denomination === "other" && (!denominationOther || denominationOther.length > FAITH_OTHER_MAX)) {
    return { error: `Tell us your denomination, in ${FAITH_OTHER_MAX} characters or fewer.` };
  }
  return { religion, religion_other: religionOther, denomination, denomination_other: denominationOther };
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

  // Religion and denomination (PRD §5.2.3). The database enforces the lists,
  // denomination only with Christian or Muslim, and changing religion
  // clearing denomination (0030). Here: the consent line, the first time.
  const faith = readFaith(formData);
  if ("error" in faith) return { error: faith.error };
  const { data: stored } = await supabase
    .from("profiles")
    .select("religion, denomination")
    .eq("id", user.id)
    .single();
  const adding =
    (faith.religion !== null && faith.religion !== (stored?.religion ?? null)) ||
    (faith.denomination !== null && faith.denomination !== (stored?.denomination ?? null));
  if (adding) {
    const { data: agreed } = await supabase
      .from("consents")
      .select("id")
      .eq("profile_id", user.id)
      .eq("kind", "faith_display")
      .eq("version", FAITH_CONSENT.version)
      .limit(1);
    if (!agreed?.length) {
      if (formData.get("faith_agreed") !== "on") {
        return { error: "Tick the box to show your faith on your profile — or leave religion blank." };
      }
      const consent = await recordConsent(supabase, user.id, "faith_display");
      if (!consent.ok) return { error: "That didn't save. Try again." };
    }
  }

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

      // Removing either deletes the value.
      religion: faith.religion,
      religion_other: faith.religion_other,
      denomination: faith.denomination,
      denomination_other: faith.denomination_other,
      tribe: optional(formData, "tribe"),
      languages,
      profession: optional(formData, "profession"),
      education: optional(formData, "education"),

      // One setting covers religion and denomination: shown or hidden.
      religion_visibility: formData.get("religion_visibility") === "private" ? "private" : "public",
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
    has_children: hasChildren === "" ? null : hasChildren === "yes",
    visibility: vis(formData, "history_visibility", "on_match"),
    updated_at: new Date().toISOString(),
  });
  if (historyError) return { error: historyError.message };

  revalidatePath("/profile");
  return { ok: "Saved." };
}

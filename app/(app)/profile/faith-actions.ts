"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordConsent } from "@/lib/consent-record";
import { FAITH_CONSENT } from "@/lib/consent";
import { DENOMINATIONS, FAITH_OTHER_MAX, isListedReligion, type Denomination } from "@/lib/faith";

/**
 * The Faith section of Edit profile (PRD §5.2.3; faith-editor.slim.html).
 * Saves as the member picks, separate from the profile form — as genotype
 * does — so the form's Save never touches faith.
 *
 * The database enforces the lists, denomination only with Christian or
 * Muslim, changing religion clearing denomination, and consent first (0030).
 * Nothing here reads a tier, and nothing filters, ranks or matches on faith.
 */

export type FaithResult = { error?: string; needsConsent?: true } | null;

export type FaithInput = {
  religion: string | null;
  religion_other: string | null;
  denomination: Denomination | null;
  denomination_other: string | null;
};

const PATH = "/profile/edit";

async function signedIn() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

async function hasConsent(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data } = await supabase
    .from("consents")
    .select("id")
    .eq("profile_id", userId)
    .eq("kind", "faith_display")
    .eq("version", FAITH_CONSENT.version)
    .limit(1);
  return Boolean(data?.length);
}

/** The consent sheet's "Add to my profile": the wording, with its version. */
export async function agreeToShowFaith(): Promise<FaithResult> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };
  const consent = await recordConsent(supabase, user.id, "faith_display");
  return consent.ok ? null : { error: "That didn't save. Try again." };
}

/** Save religion and denomination together. Removing a value deletes it. */
export async function saveFaith(input: FaithInput): Promise<FaithResult> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };

  const religion = input.religion?.trim() || null;
  const religionOther = religion === "Other" ? input.religion_other?.trim() || null : null;
  if (religion === "Other" && (!religionOther || religionOther.length > FAITH_OTHER_MAX)) {
    return { error: `Tell us your religion, in ${FAITH_OTHER_MAX} characters or fewer.` };
  }
  const options = isListedReligion(religion) ? DENOMINATIONS[religion] : undefined;
  const denomination = options?.find((d) => d.value === input.denomination)?.value ?? null;
  const denominationOther = denomination === "other" ? input.denomination_other?.trim() || null : null;
  if (denomination === "other" && (!denominationOther || denominationOther.length > FAITH_OTHER_MAX)) {
    return { error: `Tell us your denomination, in ${FAITH_OTHER_MAX} characters or fewer.` };
  }

  const { data: stored } = await supabase.from("profiles").select("religion, denomination").eq("id", user.id).single();
  const adding =
    (religion !== null && religion !== (stored?.religion ?? null)) ||
    (denomination !== null && denomination !== (stored?.denomination ?? null));
  if (adding && !(await hasConsent(supabase, user.id))) return { needsConsent: true };

  const { error } = await supabase
    .from("profiles")
    .update({
      religion,
      religion_other: religionOther,
      denomination,
      denomination_other: denominationOther,
      // "Shown" is the default when faith is first entered.
      ...(stored?.religion == null && religion !== null ? { religion_visibility: "public" } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (error) return { error: "That didn't save. Try again." };
  revalidatePath(PATH);
  return null;
}

/** One switch covers religion and denomination: shown, or hidden. */
export async function setFaithShown(shown: boolean): Promise<FaithResult> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };
  const { error } = await supabase
    .from("profiles")
    .update({ religion_visibility: shown ? "public" : "private" })
    .eq("id", user.id);
  if (error) return { error: "That didn't save. Try again." };
  revalidatePath(PATH);
  return null;
}

/** "Remove faith from my profile": both fields and the permission are deleted. */
export async function removeFaith(): Promise<FaithResult> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };
  const { error } = await supabase.rpc("remove_faith");
  if (error) return { error: "That didn't save. Try again." };
  revalidatePath(PATH);
  return null;
}

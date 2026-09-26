"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  GENOTYPE_CONSENT_VERSION,
  isGenotypeValue,
  isGenotypeVisibility,
} from "@/lib/genotype";

export type GenotypeState = { error?: string; ok?: string } | null;

/**
 * Genotype actions — part of the display path (see lib/genotype.ts).
 *
 * Nothing here logs a value, and no error returned to the client repeats one
 * or relays the database's message: a health value must not end up in a log
 * line, a toast or an error report. Values are validated HERE, before the
 * database is called, so an invalid one never reaches a Postgres error log.
 *
 * The database enforces the consent version too (migration 0014): consent is
 * accepted only for the current wording, and saving requires it.
 *
 * Free on every tier: nothing in this file reads a plan.
 */

async function signedIn() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

const TRY_AGAIN = "We couldn't save that. Please try again.";

/** The separate, timestamped consent step — before any value can be entered. */
export async function recordGenotypeConsent(
  _prev: GenotypeState,
  formData: FormData,
): Promise<GenotypeState> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };

  if (formData.get("agree") !== "on") {
    return { error: "Tick the box to agree, or choose Not now." };
  }

  const { error } = await supabase.rpc("record_genotype_consent", {
    p_version: GENOTYPE_CONSENT_VERSION,
  });
  if (error) return { error: TRY_AGAIN };

  revalidatePath("/profile");
  return { ok: "Thank you." };
}

/** Saves the value and who can see it together — the entry and visibility screens. */
export async function saveGenotype(
  _prev: GenotypeState,
  formData: FormData,
): Promise<GenotypeState> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };

  const value = String(formData.get("genotype") ?? "");
  const visibility = String(formData.get("visibility") ?? "private");

  if (!isGenotypeValue(value)) return { error: "Choose one of the options." };
  if (!isGenotypeVisibility(visibility)) return { error: "Choose who can see it." };

  const { error } = await supabase.rpc("set_genotype", {
    p_value: value,
    p_visibility: visibility,
  });
  if (error) return { error: TRY_AGAIN };

  revalidatePath("/profile");
  return { ok: "Saved." };
}

/**
 * Complete deletion: the value and the consent together, with nothing kept.
 * Confirmed by the delete sheet, and always allowed.
 */
export async function deleteGenotype(
  _prev: GenotypeState,
  formData: FormData,
): Promise<GenotypeState> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };

  if (formData.get("confirm") !== "on") {
    return { error: "Please confirm first." };
  }

  const { error } = await supabase.rpc("delete_genotype");
  if (error) return { error: "We couldn't delete it. Please try again." };

  revalidatePath("/profile");
  return { ok: "Genotype deleted" };
}

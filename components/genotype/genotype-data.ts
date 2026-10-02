import { createClient } from "@/lib/supabase/server";
import { isGenotypeValue, type GenotypeValue } from "@/lib/genotype";

/**
 * SERVER ONLY. The one way the rest of the app obtains another member's
 * genotype — and only ever to display it to a permitted viewer.
 *
 * Returns null for "not permitted", "not entered" and "not shared back"
 * alike (get_genotype_for, migration 0014), so a caller cannot tell which it
 * was and must render nothing at all — no "hidden" label, no lock, no
 * placeholder (genotype-display.slim.html).
 *
 * Before migration 0014 has run the function does not exist; the call
 * errors, data is null, and this returns null — so nothing breaks.
 */
export async function getVisibleGenotype(
  ownerId: string,
): Promise<GenotypeValue | null> {
  const supabase = createClient();
  const { data } = await supabase.rpc("get_genotype_for", { p_owner: ownerId });
  return typeof data === "string" && isGenotypeValue(data) ? data : null;
}

/** The same, for a handful of members at once — the day's six. */
export async function getVisibleGenotypes(
  ownerIds: string[],
): Promise<Record<string, GenotypeValue>> {
  const entries = await Promise.all(
    ownerIds.map(async (id) => [id, await getVisibleGenotype(id)] as const),
  );
  const out: Record<string, GenotypeValue> = {};
  for (const [id, value] of entries) if (value) out[id] = value;
  return out;
}

/**
 * The member's own genotype, for their data download (privacy policy §10).
 * The owner is always a permitted viewer — this displays it to them as a
 * file. Never used for anything else.
 */
export async function getOwnGenotypeForExport(): Promise<
  | { value: string; visibility: string; consented_at: string; consent_version: string }
  | { unavailable: true }
  | null
> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_own_genotype");
  if (error) return { unavailable: true };
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;
  return {
    value: row.value === "unknown" ? "I don't know yet" : row.value,
    visibility: row.visibility,
    consented_at: row.consented_at,
    consent_version: row.consent_version,
  };
}

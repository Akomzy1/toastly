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

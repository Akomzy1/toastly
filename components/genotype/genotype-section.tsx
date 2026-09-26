import { createClient } from "@/lib/supabase/server";
import {
  GENOTYPE_CONSENT_VERSION,
  isGenotypeValue,
  isGenotypeVisibility,
} from "@/lib/genotype";
import { GenotypeSettings } from "./genotype-settings";

/**
 * The member's own genotype, for the profile page — part of the display path.
 *
 * Reads only the member's OWN row, through get_own_genotype(), and hands it
 * to the settings form. A consent given to an older wording counts as no
 * consent: the member is asked again before they can make changes.
 */
export async function GenotypeSection() {
  const supabase = createClient();
  const { data } = await supabase.rpc("get_own_genotype");
  const row = (Array.isArray(data) ? data[0] : null) as {
    value: string | null;
    visibility: string | null;
    consented_at: string | null;
    consent_version: string | null;
  } | null;

  const consentedBefore = Boolean(row?.consented_at);
  const consented =
    consentedBefore && row?.consent_version === GENOTYPE_CONSENT_VERSION;

  const value = row?.value && isGenotypeValue(row.value) ? row.value : null;
  const visibility =
    row?.visibility && isGenotypeVisibility(row.visibility)
      ? row.visibility
      : "private";

  return (
    <GenotypeSettings
      consented={consented}
      reconsent={consentedBefore && !consented}
      value={value}
      visibility={visibility}
    />
  );
}

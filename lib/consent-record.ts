import type { SupabaseClient } from "@supabase/supabase-js";
import { CONSENT, type ConsentKind } from "@/lib/consent";

export type { ConsentKind };

/**
 * Record that the member agreed, with the version of the wording they saw
 * (lib/consent.ts; 0029 consents — append-only, the member's own row). A
 * check never runs without it. Returns the time agreed, which goes to Smile
 * ID as the consent timestamp.
 */
export async function recordConsent(
  supabase: SupabaseClient,
  profileId: string,
  kind: ConsentKind,
): Promise<{ ok: true; agreedAt: string } | { ok: false }> {
  const { data, error } = await supabase
    .from("consents")
    .insert({ profile_id: profileId, kind, version: CONSENT[kind].version })
    .select("agreed_at")
    .single();
  if (error || !data) return { ok: false };
  return { ok: true, agreedAt: data.agreed_at as string };
}

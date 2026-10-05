import type { createClient } from "@/lib/supabase/server";
import { CONSENT, type ConsentKind } from "@/lib/consent";

/**
 * Record a verification consent before the check it covers runs.
 *
 * SERVER ONLY. The version comes from lib/consent.ts — the wording this
 * server is showing — never from the browser. Returns false, and the check
 * must not run, if the box wasn't ticked or the record couldn't be written.
 */
export async function recordConsent(
  supabase: ReturnType<typeof createClient>,
  profileId: string,
  kind: ConsentKind,
  formData: FormData,
): Promise<{ ok: true; agreedAt: string } | { ok: false }> {
  if (formData.get("agreed") !== "on") return { ok: false };
  const agreedAt = new Date().toISOString();
  const { error } = await supabase.from("consents").insert({
    profile_id: profileId,
    kind,
    version: CONSENT[kind].version,
    agreed_at: agreedAt,
  });
  return error ? { ok: false } : { ok: true, agreedAt };
}

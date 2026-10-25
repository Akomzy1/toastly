"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lagosInputToIso } from "@/lib/beta";

export type SettingsState = { ok?: string; error?: string } | null;

export type BetaResult<T = Record<string, unknown>> = { ok: true; data: T } | { ok: false; error: string };

/**
 * The beta approval screen's actions (staff only). These do nothing the
 * database doesn't already enforce: every function it calls checks the caller
 * is staff, refuses what the rules refuse (outside Lagos, over the cap, an
 * application whose number has already signed up), and writes the audit log.
 * The sentences it returns are the database's own, written for staff.
 *
 * There is no export and no messaging here, on purpose: the approved numbers
 * are shown on the screen (staff_beta_list) so the invitations are sent by
 * hand. Nothing in this folder may send a message to an applicant.
 */
export async function betaOverview(): Promise<BetaResult> {
  const { data, error } = await createClient().rpc("staff_beta_overview");
  return error ? { ok: false, error: error.message } : { ok: true, data: data as Record<string, unknown> };
}

export async function betaList(filters: {
  status?: string;
  gender?: string;
  area?: string;
  limit?: number;
  offset?: number;
}): Promise<BetaResult> {
  const { data, error } = await createClient().rpc("staff_beta_list", {
    p_status: filters.status || null,
    p_gender: filters.gender || null,
    p_area: filters.area || null,
    p_limit: filters.limit ?? 100,
    p_offset: filters.offset ?? 0,
  });
  return error ? { ok: false, error: error.message } : { ok: true, data: data as Record<string, unknown> };
}

/** Approve, waitlist or decline one application or a batch (with a wave for an approval). */
export async function betaDecide(ids: string[], status: "approved" | "waitlisted" | "declined", wave?: number | null): Promise<BetaResult> {
  const { data, error } = await createClient().rpc("staff_beta_decide", {
    p_ids: ids,
    p_status: status,
    p_wave: wave ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/staff/beta");
  return { ok: true, data: data as Record<string, unknown> };
}

/** The cap, the target split, when applications open and when the beta closes (null = open). */
export async function betaUpdateSettings(patch: {
  cap?: number;
  women_target_pct?: number;
  applications_open_at?: string;
  beta_closes_at?: string | null;
}): Promise<BetaResult> {
  const { data, error } = await createClient().rpc("staff_beta_update_settings", { p_patch: patch });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/staff/beta");
  return { ok: true, data: data as Record<string, unknown> };
}

/**
 * The settings form: the cap, the target split, when applications open, and when
 * the beta closes (blank = open). Dates are typed in Lagos time. Every rule is
 * the database's; its sentences come back as they are.
 */
export async function saveBetaSettings(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const cap = Number(formData.get("cap"));
  const pct = Number(formData.get("women_target_pct"));
  if (!Number.isInteger(cap) || !Number.isInteger(pct)) return { error: "The cap and the split are whole numbers." };
  const opens = lagosInputToIso(formData.get("applications_open_at"));
  if (!opens) return { error: "Choose when applications open." };
  const closesRaw = String(formData.get("beta_closes_at") ?? "").trim();
  const closes = closesRaw === "" ? null : lagosInputToIso(closesRaw);
  if (closesRaw !== "" && !closes) return { error: "Choose a valid date for when the beta closes, or leave it empty." };

  const result = await betaUpdateSettings({ cap, women_target_pct: pct, applications_open_at: opens, beta_closes_at: closes });
  return result.ok ? { ok: "Saved." } : { error: result.error };
}

export async function betaFeedback(category?: string, limit = 50, offset = 0): Promise<BetaResult> {
  const { data, error } = await createClient().rpc("staff_beta_feedback", {
    p_category: category || null,
    p_limit: limit,
    p_offset: offset,
  });
  return error ? { ok: false, error: error.message } : { ok: true, data: data as Record<string, unknown> };
}

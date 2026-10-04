"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Date actions (PRD §5.5; 0023). Every rule — who may stake, the cut-off,
 * the check-in radius and window, the contest period, the safety override —
 * lives in the database functions. These only pass the member's choice on
 * and show the database's own message when it says no.
 */

export type DateState = { ok?: string; error?: string } | null;

async function member() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function proposeDate(_prev: DateState, formData: FormData): Promise<DateState> {
  const { supabase, user } = await member();
  if (!user) return { error: "Please sign in again." };

  const spotId = String(formData.get("spot_id") ?? "");
  const at = new Date(String(formData.get("at_iso") ?? ""));
  const stake = Number(formData.get("stake"));
  if (!spotId) return { error: "Accept a spot first." };
  if (Number.isNaN(at.getTime())) return { error: "Pick a day and a time." };
  if (!Number.isInteger(stake)) return { error: "Choose how many coins to stake." };

  const { data, error } = await supabase.rpc("date_propose", { p_spot_id: spotId, p_at: at.toISOString(), p_stake: stake });
  if (error) return { error: error.message };
  redirect(`/dates/${data as string}`);
}

async function run(id: string, fn: string, args: Record<string, unknown>, ok: string): Promise<DateState> {
  const { supabase, user } = await member();
  if (!user) return { error: "Please sign in again." };
  if (!id) return { error: "Which date is this?" };
  const { error } = await supabase.rpc(fn, { p_id: id, ...args });
  revalidatePath(`/dates/${id}`);
  revalidatePath("/coins");
  return error ? { error: error.message } : { ok };
}

const idOf = (f: FormData) => String(f.get("date_id") ?? "");

export async function stakeDate(_p: DateState, f: FormData) {
  return run(idOf(f), "date_stake", {}, "You're both in. See you there.");
}

export async function declineDate(_p: DateState, f: FormData) {
  return run(idOf(f), "date_decline", {}, "No problem. Their coins have gone back to them.");
}

export async function cancelDate(_p: DateState, f: FormData) {
  const safety = f.get("safety") === "1";
  return run(
    idOf(f),
    "date_cancel",
    { p_safety: safety },
    safety ? "Cancelled. Every coin has come back. If something felt wrong, you can report them below." : "Cancelled. Every coin has come back.",
  );
}

export async function requestReschedule(_p: DateState, f: FormData): Promise<DateState> {
  const { supabase, user } = await member();
  if (!user) return { error: "Please sign in again." };
  const id = idOf(f);
  const { data, error } = await supabase.rpc("date_request_reschedule", { p_id: id });
  revalidatePath(`/dates/${id}`);
  if (error) return { error: error.message };
  return {
    ok: data
      ? "You both asked to move it. Every coin has come back — pick a new time from your Gist."
      : "Asked. If they ask too, the date is moved and every coin comes back.",
  };
}

export async function checkIn(_p: DateState, f: FormData): Promise<DateState> {
  const { supabase, user } = await member();
  if (!user) return { error: "Please sign in again." };
  const id = idOf(f);
  const lat = Number(f.get("lat"));
  const lng = Number(f.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { error: "We couldn't read your location. Try again." };
  // Passed straight to the check and dropped: the database keeps only the
  // time you checked in, never where you were.
  const { data, error } = await supabase.rpc("date_check_in", { p_id: id, p_lat: lat, p_lng: lng });
  revalidatePath(`/dates/${id}`);
  revalidatePath("/coins");
  if (error) return { error: error.message };
  return { ok: data === "both" ? "You're both here. Your coins are back. Enjoy it." : "You're checked in." };
}

export async function contestDate(_p: DateState, f: FormData) {
  return run(idOf(f), "date_contest", {}, "Thanks. A person on the team will look at it — nothing moves until they do.");
}

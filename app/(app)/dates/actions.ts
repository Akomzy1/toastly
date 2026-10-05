"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notLiveError, requireLiveProfile } from "@/lib/live-profile";
import { coinsOpen, COINS_HELD } from "@/lib/coins";

/**
 * Dates: arrange, stake, check in, cancel, answer a no-show (PRD §5.5,
 * Prompt 17, 0019). The database does every rule; these say so politely.
 *
 * ARRANGING and STAKING need a live profile (0013: "create dates").
 *
 * CHECKING IN, CANCELLING and ANSWERING A NO-SHOW on a date already
 * arranged deliberately do NOT: if a member's profile is hidden on the day
 * (a photo removed), blocking these would cost them their stake, and a
 * safety exit must never be blocked by anything. They still call
 * requireLiveProfile() — only to refuse a member a REVIEWER has removed.
 * scripts/check-constraints.mjs names these three as the only exemptions.
 */
export type DateState = { error?: string; ok?: string } | null;

async function signedIn() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Arrange a date at a spot you both accepted. */
export async function createDate(_prev: DateState, formData: FormData): Promise<DateState> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };
  const live = await requireLiveProfile(supabase);
  if (!live.live) return { error: notLiveError(live) };
  if (!coinsOpen()) return { error: COINS_HELD };

  const spot = String(formData.get("spot_id") ?? "");
  const when = new Date(String(formData.get("when") ?? ""));
  if (!spot || Number.isNaN(when.getTime())) return { error: "Choose a day and a time." };

  const { data: id, error } = await supabase.rpc("create_date", { p_spot: spot, p_when: when.toISOString() });
  if (error || !id) return { error: error?.message ?? "That date couldn't be arranged." };
  redirect(`/dates/${id}`);
}

/** Put your stake in. Purchased coins only. */
export async function stakeDate(_prev: DateState, formData: FormData): Promise<DateState> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };
  const live = await requireLiveProfile(supabase);
  if (!live.live) return { error: notLiveError(live) };
  if (!coinsOpen()) return { error: COINS_HELD };

  const id = String(formData.get("date_id") ?? "");
  const { error } = await supabase.rpc("stake_date", { p_commitment: id });
  if (error?.message.includes("not_enough_coins")) return { error: "You don't have enough coins that can be staked." };
  if (error) return { error: "Your stake couldn't be put in. Try again." };
  revalidatePath(`/dates/${id}`);
  return { ok: "staked" };
}

/** "I'm here" — location is compared once, in the database, and never kept. */
export async function checkIn(dateId: string, lat: number, lng: number): Promise<DateState> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };
  const live = await requireLiveProfile(supabase);
  if (!live.live && live.standing === "removed") return { error: notLiveError(live) };

  const { data, error } = await supabase.rpc("check_in", { p_commitment: dateId, p_lat: lat, p_lng: lng });
  if (error) return { error: "We couldn't check you in. Try again." };
  revalidatePath(`/dates/${dateId}`);
  return { ok: String(data) };
}

/** Cancel. Free before the cut-off; ALWAYS free for safety. */
export async function cancelDate(_prev: DateState, formData: FormData): Promise<DateState> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };
  const live = await requireLiveProfile(supabase);
  const safety = formData.get("safety") === "on";
  if (!live.live && live.standing === "removed" && !safety) return { error: notLiveError(live) };

  const id = String(formData.get("date_id") ?? "");
  const { data, error } = await supabase.rpc("cancel_date", { p_commitment: id, p_safety: safety });
  if (error) return { error: "That date couldn't be cancelled. Try again." };
  revalidatePath(`/dates/${id}`);
  revalidatePath("/coins");
  return { ok: safety ? "safety" : String(data) };
}

/** The absent member's answer: came_up, unsafe, or was_there (a person looks). */
export async function answerNoShow(_prev: DateState, formData: FormData): Promise<DateState> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please sign in again." };
  const live = await requireLiveProfile(supabase);
  const answer = String(formData.get("answer") ?? "");
  if (!live.live && live.standing === "removed" && answer !== "unsafe") return { error: notLiveError(live) };

  const id = String(formData.get("date_id") ?? "");
  const { error } = await supabase.rpc("answer_no_show", {
    p_commitment: id,
    p_answer: answer,
    p_note: String(formData.get("note") ?? "").slice(0, 1000) || null,
  });
  if (error) return { error: error.message.includes("24 hours") ? "The 24 hours to respond have passed." : "Your answer couldn't be sent. Try again." };
  revalidatePath(`/dates/${id}`);
  revalidatePath("/coins");
  return { ok: answer };
}

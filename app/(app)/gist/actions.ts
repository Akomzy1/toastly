"use server";

import { STARTER_MONTHLY_GISTS, gistCount } from "@/lib/plan-numbers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { capture } from "@/lib/analytics";
import { notLiveError, requireLiveProfile } from "@/lib/live-profile";

export type GistState = { error?: string; ok?: string } | null;

async function me() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * Gist invites (gist-invite prototypes 1–8).
 *
 * Every rule lives in the database (0020): only someone in today's six, one
 * open Gist per pair, the Starter cap (counted when a call CONNECTS, for both
 * people), invites closing after 3 days. These wrappers turn its messages
 * into calm copy and move the member to the next screen.
 */
function capMessage(message: string): string | null {
  if (/allowance/i.test(message)) return `You've used your ${gistCount(STARTER_MONTHLY_GISTS)} this month.`;
  return null;
}

/**
 * useCoins: at the monthly cap, send the invite as an extra Gist paid with
 * coins (0037). Nothing is taken now — the database charges the coins only
 * when the call connects, once.
 */
export async function inviteToGist(promptAnswerId: string, useCoins = false): Promise<GistState> {
  const { supabase, user } = await me();
  if (!user) return { error: "Please sign in again." };
  const live = await requireLiveProfile(supabase);
  if (!live.live) return { error: notLiveError(live) };

  const { data: sessionId, error } = await supabase.rpc("gist_invite", {
    p_prompt_answer_id: promptAnswerId,
    p_use_coins: useCoins,
  });
  if (error || typeof sessionId !== "string") {
    return { error: capMessage(error?.message ?? "") ?? error?.message ?? "That didn't send. Please try again." };
  }

  // Funnel step three: the first Gist invite this member has sent.
  const { count } = await supabase
    .from("gist_sessions")
    .select("id", { count: "exact", head: true })
    .eq("proposer_id", user.id);
  if ((count ?? 0) <= 1) await capture("first_gist", user.id, { medium: "voice" });

  revalidatePath("/gist");
  redirect(`/gist/${sessionId}/sent`);
}

/** The same, for a <form action>. */
export async function inviteToGistForm(_prev: GistState, formData: FormData): Promise<GistState> {
  return inviteToGist(String(formData.get("prompt_answer_id") ?? ""), formData.get("use_coins") === "1");
}

export async function respondToInvite(sessionId: string, accept: boolean): Promise<GistState> {
  const { supabase, user } = await me();
  if (!user) return { error: "Please sign in again." };
  const live = await requireLiveProfile(supabase);
  if (!live.live) return { error: notLiveError(live) };
  const { error } = await supabase.rpc("gist_respond", { p_session_id: sessionId, p_accept: accept });
  if (error) return { error: capMessage(error.message) ?? error.message };
  revalidatePath("/gist");
  revalidatePath(`/gist/${sessionId}`);
  return { ok: accept ? "accepted" : "declined" };
}

/** "Start now" / "Gist now": I'm ready. The call opens once you both are. */
export async function startNow(sessionId: string): Promise<GistState> {
  const { supabase, user } = await me();
  if (!user) return { error: "Please sign in again." };
  const live = await requireLiveProfile(supabase);
  if (!live.live) return { error: notLiveError(live) };
  const { data: session } = await supabase
    .from("gist_sessions")
    .select("proposer_id, status")
    .eq("id", sessionId)
    .single();
  if (!session || session.status !== "accepted") return { error: "This Gist can't start right now." };
  const field = session.proposer_id === user.id ? "proposer_ready_at" : "invitee_ready_at";
  const { error } = await supabase
    .from("gist_sessions")
    .update({ [field]: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) return { error: "This Gist can't start right now." };
  revalidatePath(`/gist/${sessionId}`);
  return { ok: "ready" };
}

export async function proposeTime(sessionId: string, at: string): Promise<GistState> {
  const { supabase, user } = await me();
  if (!user) return { error: "Please sign in again." };
  const live = await requireLiveProfile(supabase);
  if (!live.live) return { error: notLiveError(live) };
  const { error } = await supabase.rpc("gist_propose_time", { p_session_id: sessionId, p_at: at });
  if (error) return { error: error.message };
  revalidatePath(`/gist/${sessionId}`);
  revalidatePath("/gist");
  redirect(`/gist/${sessionId}`);
}

export async function confirmTime(sessionId: string): Promise<GistState> {
  const { supabase, user } = await me();
  if (!user) return { error: "Please sign in again." };
  const live = await requireLiveProfile(supabase);
  if (!live.live) return { error: notLiveError(live) };
  const { error } = await supabase.rpc("gist_confirm_time", { p_session_id: sessionId });
  if (error) return { error: error.message };
  revalidatePath(`/gist/${sessionId}`);
  revalidatePath("/gist");
  return { ok: "confirmed" };
}

/**
 * Record video degrading to audio.
 *
 * A weak connection degrades rather than freezes (Prompt 5). Recorded so the
 * product can tell "chose voice" apart from "video failed" — on the audience
 * this is built for, that difference matters.
 */
export async function recordDegraded(sessionId: string) {
  const { supabase, user } = await me();
  if (!user) return;
  await supabase
    .from("gist_sessions")
    .update({ degraded_to_voice_at: new Date().toISOString() })
    .eq("id", sessionId);
}

/**
 * The private double opt-in at the end.
 *
 * Each side answers without seeing the other's answer, and RLS only lets a
 * member read their own row. Nobody is ever told they were turned down.
 */
export async function submitOutcome(
  _prev: GistState,
  formData: FormData,
): Promise<GistState> {
  const { supabase, user } = await me();
  if (!user) return { error: "Please sign in again." };
  const live = await requireLiveProfile(supabase);
  if (!live.live) return { error: notLiveError(live) };

  const id = String(formData.get("session_id") ?? "");
  const wants = String(formData.get("continue") ?? "") === "yes";

  const { error } = await supabase.from("gist_outcomes").insert({
    session_id: id,
    profile_id: user.id,
    wants_to_continue: wants,
    // Shaped for the AriyaPlanner brief later (Prompt 8). Nothing consumes
    // it yet and the integration itself is explicitly out of scope.
    signals: {
      city: formData.get("city") ?? null,
      met_family_talk: formData.get("family") === "yes",
    },
  });

  if (error) return { error: error.message };

  await supabase
    .from("gist_sessions")
    .update({ status: "completed", ended_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath("/gist");
  return {
    ok: "Thanks — that stays private. If you both said yes, you'll both hear.",
  };
}


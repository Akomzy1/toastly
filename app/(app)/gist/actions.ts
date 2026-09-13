"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canUseVideo, type GistMedium } from "@/lib/gist";
import type { Tier } from "@/lib/types/profile";

export type GistState = { error?: string; ok?: string } | null;

async function me() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

async function tierOf(
  supabase: ReturnType<typeof createClient>,
  id: string,
): Promise<Tier> {
  const { data } = await supabase.rpc("current_tier", { p_profile_id: id });
  return (data as Tier | null) ?? "starter";
}

/**
 * Propose a Gist.
 *
 * The entitlement is enforced by a database trigger on insert, so this cannot
 * be bypassed by a modified client. The checks here exist to produce a decent
 * message rather than a raw constraint error.
 */
export async function proposeGist(
  _prev: GistState,
  formData: FormData,
): Promise<GistState> {
  const { supabase, user } = await me();
  if (!user) return { error: "Please sign in again." };

  const inviteeId = String(formData.get("invitee_id") ?? "");
  const medium = (String(formData.get("medium") ?? "voice") as GistMedium);
  const scheduledFor = String(formData.get("scheduled_for") ?? "");

  if (!inviteeId) return { error: "Who is this for?" };

  const tier = await tierOf(supabase, user.id);

  if (medium === "video" && !canUseVideo(tier)) {
    return {
      error:
        "Live video Gist is part of Premium Plus. You can propose a voice Gist now — voice is the default here, not a downgrade.",
    };
  }

  const { error } = await supabase.from("gist_sessions").insert({
    proposer_id: user.id,
    invitee_id: inviteeId,
    medium,
    scheduled_for: scheduledFor || null,
  });

  if (error) {
    // The trigger's message is the honest one; surface it rather than a
    // generic failure.
    if (/allowance/i.test(error.message)) {
      return {
        error:
          "That's both of your free Gist sessions for this month. They reset at the start of next month.",
      };
    }
    if (/Premium Plus/i.test(error.message)) {
      return { error: "Live video Gist is part of Premium Plus." };
    }
    return { error: error.message };
  }

  revalidatePath("/gist");
  return { ok: "Invite sent." };
}

export async function respondToGist(
  _prev: GistState,
  formData: FormData,
): Promise<GistState> {
  const { supabase, user } = await me();
  if (!user) return { error: "Please sign in again." };

  const id = String(formData.get("session_id") ?? "");
  const accept = String(formData.get("accept") ?? "") === "yes";

  const { error } = await supabase
    .from("gist_sessions")
    .update({ status: accept ? "accepted" : "declined" })
    .eq("id", id)
    .eq("invitee_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/gist");
  return { ok: accept ? "Accepted." : "Declined." };
}

/**
 * Opt in to the session.
 *
 * Mutual opt-in gates the hardware: a room token is only issued once BOTH
 * sides have marked themselves ready, so no microphone or camera can be
 * requested before the other person has agreed.
 */
export async function markReady(
  _prev: GistState,
  formData: FormData,
): Promise<GistState> {
  const { supabase, user } = await me();
  if (!user) return { error: "Please sign in again." };

  const id = String(formData.get("session_id") ?? "");
  const { data: session } = await supabase
    .from("gist_sessions")
    .select("proposer_id, invitee_id")
    .eq("id", id)
    .single();

  if (!session) return { error: "That session doesn't exist." };

  const field =
    session.proposer_id === user.id ? "proposer_ready_at" : "invitee_ready_at";

  const { error } = await supabase
    .from("gist_sessions")
    .update({ [field]: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath(`/gist/${id}`);
  return { ok: "Ready. Waiting for them to join." };
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

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { capture } from "@/lib/analytics";
import { takeAgentRequest } from "@/lib/ai/rate-limit";
import { FEEDBACK_COPY, mirrorAnswer } from "@/lib/answer-mirror";

const MAX_ANSWER = 300;

export type SaveState = { error?: string; ok?: boolean } | null;

/** Save the member's own answer. Their words, as typed. */
export async function savePromptAnswer(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const promptId = Number(formData.get("prompt_id"));
  const answer = String(formData.get("answer") ?? "").trim();
  if (!Number.isInteger(promptId) || promptId < 1) return { error: "Something went wrong. Please try again." };
  if (answer.length < 1) return { error: "Write an answer first." };
  if (answer.length > MAX_ANSWER) return { error: `Keep it under ${MAX_ANSWER} characters.` };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  const { error } = await supabase
    .from("prompt_answers")
    .upsert(
      { profile_id: user.id, prompt_id: promptId, answer, updated_at: new Date().toISOString() },
      { onConflict: "profile_id,prompt_id" },
    );
  if (error) return { error: "That didn't save. Please try again." };

  revalidatePath("/profile");
  return { ok: true };
}

export type FeedbackState = { feedback?: string; error?: string };

/**
 * Answer Mirror: one fixed line of feedback on the member's own draft. The
 * draft goes to the model and is not stored; the reply is a label, mapped
 * here to fixed copy. Free on every tier.
 */
export async function getAnswerFeedback(promptId: number, draft: string): Promise<FeedbackState> {
  const text = draft.trim();
  if (!text) return { error: "Write something first." };
  if (text.length > MAX_ANSWER) return { error: `Keep it under ${MAX_ANSWER} characters.` };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  const { data: prompt } = await supabase
    .from("prompts")
    .select("text")
    .eq("id", promptId)
    .eq("active", true)
    .maybeSingle();
  if (!prompt) return { error: "Something went wrong. Please try again." };

  if (!(await takeAgentRequest(user.id, "answer_mirror"))) {
    return { error: "Feedback is resting for today. Try again tomorrow." };
  }

  const result = await mirrorAnswer(prompt.text, text);
  if (!result.ok) return { error: "Feedback isn't available right now." };

  await capture("agent_answer_mirror", user.id, { label: result.label });
  return { feedback: FEEDBACK_COPY[result.label] };
}

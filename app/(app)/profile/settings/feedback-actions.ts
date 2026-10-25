"use server";

import { createClient } from "@/lib/supabase/server";
import { FEEDBACK_CATEGORIES, feedbackPage } from "@/lib/beta";

export type FeedbackState = { ok?: true; error?: string } | null;

/**
 * Settings → Send feedback (the beta). A category, the words, and the page it
 * was sent from — its path only, never the query string.
 *
 * What is written here is for Toastly's staff to read and nobody else. It is
 * never sent to analytics (PostHog) and never to a model: this file imports
 * neither, and a constraint check fails the build if it ever does. A person
 * with a safety concern should still use Report or Toastly Help; the form says
 * so, and "safety" is only a label that tells staff what they are reading.
 */
export async function sendFeedback(_prev: FeedbackState, formData: FormData): Promise<FeedbackState> {
  const category = String(formData.get("category") ?? "");
  const body = String(formData.get("body") ?? "");
  if (!FEEDBACK_CATEGORIES.some((c) => c.code === category)) return { error: "Choose a category." };
  if (body.trim().length === 0) return { error: "Write a few words first." };
  if (body.length > 2000) return { error: "That's a little long — keep it under 2,000 characters." };

  const supabase = createClient();
  const { error } = await supabase.rpc("submit_beta_feedback", {
    p_category: category,
    p_page: feedbackPage(formData.get("page")),
    p_body: body,
  });
  if (error) {
    // The database's own sentences are written for members (the daily limit,
    // "please sign in again"); anything else is a plain failure.
    return { error: error.code === "53400" || error.code === "42501" ? error.message : "We couldn't send that. Please try again." };
  }
  return { ok: true };
}

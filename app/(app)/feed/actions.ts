"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canSendText, replyKindFor } from "@/lib/feed";
import type { Tier } from "@/lib/types/profile";

export type ReplyState = { error?: string; ok?: string } | null;

/**
 * Open a conversation by replying to a specific prompt answer.
 *
 * There is no generic like, wave or "hi" here, and no endpoint that would
 * accept one — `prompt_answer_id` is required, so every opener is attached to
 * something the sender actually read.
 *
 * The Starter rule is enforced here, server-side, not in the UI: a Starter
 * member's outbound move is a Gist invite, and any free text they submit is
 * refused rather than quietly dropped.
 */
export async function replyToAnswer(
  _prev: ReplyState,
  formData: FormData,
): Promise<ReplyState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  const recipientId = String(formData.get("recipient_id") ?? "");
  const promptAnswerId = String(formData.get("prompt_answer_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!recipientId || !promptAnswerId) {
    return { error: "Pick an answer to reply to." };
  }

  const { data: tierRow } = await supabase.rpc("current_tier", {
    p_profile_id: user.id,
  });
  const tier = (tierRow as Tier | null) ?? "starter";

  const kind = replyKindFor(tier);

  if (kind === "text" && !body) {
    return { error: "Write something first." };
  }
  if (!canSendText(tier) && body) {
    // Not silently downgraded: the member is told what happened and why.
    return {
      error:
        "Starter can't send text messages. You can invite them to a Gist instead — that's your outbound channel on the free plan.",
    };
  }

  const { error } = await supabase.from("replies").insert({
    sender_id: user.id,
    recipient_id: recipientId,
    prompt_answer_id: promptAnswerId,
    kind,
    body: kind === "text" ? body : null,
  });

  if (error) return { error: error.message };

  revalidatePath("/feed");
  return {
    ok:
      kind === "gist_invite"
        ? "Gist invite sent."
        : "Sent. It'll be waiting for them.",
  };
}

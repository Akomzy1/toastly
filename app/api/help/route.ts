import { NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { capture } from "@/lib/analytics";
import { takeAgentRequest } from "@/lib/ai/rate-limit";
import { hasSafetySignal, runHelp, type HelpTurn } from "@/lib/concierge/agent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Toastly Help — one member message in, one assistant reply out.
 *
 * Reads run as the member (RLS applies); writes to the support tables use the
 * service role so a member can't forge an assistant turn. Free on every plan:
 * nothing here reads a tier except the read-only tool the member's question
 * may call.
 */

const MAX_MESSAGE = 1000;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!isSupabaseConfigured() || !admin) return json({ error: "Toastly Help isn't available right now." }, 503);

  let body: { conversation_id?: unknown; message?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Something went wrong. Please try again." }, 400);
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return json({ error: "Type a question first." }, 400);
  if (message.length > MAX_MESSAGE) return json({ error: "That's a long one — try a shorter question." }, 400);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "Please sign in again." }, 401);

  // The conversation: the member's own, or a new one.
  let conversationId = typeof body.conversation_id === "string" ? body.conversation_id : null;
  if (conversationId) {
    const { data: own } = await admin
      .from("support_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("profile_id", user.id)
      .maybeSingle();
    if (!own) conversationId = null;
  }
  if (!conversationId) {
    const { data: created, error } = await admin
      .from("support_conversations")
      .insert({ profile_id: user.id })
      .select("id")
      .single();
    if (error || !created) return json({ error: "Toastly Help isn't available right now." }, 503);
    conversationId = created.id as string;
  }

  await admin.from("support_messages").insert({
    conversation_id: conversationId,
    profile_id: user.id,
    role: "member",
    content: message,
  });

  // Safety first, without a model in the way.
  if (hasSafetySignal(message)) {
    await admin.from("support_conversations").update({ last_active_at: new Date().toISOString() }).eq("id", conversationId);
    return json({ conversation_id: conversationId, reply: { safety: true, handoff: "other", paragraphs: [], action: "safety_kit", language: "en" } });
  }

  if (!(await takeAgentRequest(user.id, "help"))) {
    return json({
      conversation_id: conversationId,
      reply: {
        safety: false,
        handoff: "other",
        language: "en",
        action: "none",
        paragraphs: ["You've asked a lot today, so Toastly Help is resting. A person on our team can pick this up instead."],
      },
    });
  }

  const { data: rows } = await admin
    .from("support_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(40);
  const history = (rows ?? []) as HelpTurn[];

  let reply;
  try {
    reply = await runHelp(history, supabase, user.id);
  } catch (e) {
    console.error("[help] model call failed:", (e as Error).name);
    reply = null;
  }
  if (!reply) {
    return json({
      conversation_id: conversationId,
      reply: {
        safety: false,
        handoff: "other",
        language: "en",
        action: "none",
        paragraphs: ["Sorry — I couldn't answer that just now. A person on our team can help instead."],
      },
    });
  }

  if (reply.paragraphs.length) {
    await admin.from("support_messages").insert({
      conversation_id: conversationId,
      profile_id: user.id,
      role: "assistant",
      content: reply.paragraphs.join("\n\n").slice(0, 4000),
    });
  }
  await admin.from("support_conversations").update({ last_active_at: new Date().toISOString() }).eq("id", conversationId);

  // Metadata only: labels and counts, never the question or the reply.
  await capture("agent_help_reply", user.id, {
    language: reply.language,
    action: reply.action,
    offered_handoff: Boolean(reply.handoff),
    safety: reply.safety,
  });

  return json({ conversation_id: conversationId, reply });
}

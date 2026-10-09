import { NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { capture } from "@/lib/analytics";
import { takeAgentRequest } from "@/lib/ai/rate-limit";
import { runHelp, type HelpReply, type HelpTurn } from "@/lib/concierge/agent";
import { decideHandoff, keywordCheck, slaLine } from "@/lib/help-escalation";
import { crisisLinesFor } from "@/lib/crisis-lines";
import { emergencyNumbersFor } from "@/lib/safety";
import { fileTicket, supportConfig } from "@/lib/support-alerts";
import type { HelpAnswer } from "@/lib/help-answer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Toastly Help — one member message in, one answer out.
 *
 * Reads run as the member (RLS applies); writes to the support tables use the
 * service role so a member can't forge an assistant turn. Free on every plan.
 *
 * Hand-offs (lib/help-escalation.ts) are decided HERE, on the server:
 *   - a keyword check runs first, without the model; a safety hit is urgent
 *     and the model is never asked;
 *   - otherwise the model returns {handoff, category}; each category's floor
 *     is enforced and the higher of model and keyword wins;
 *   - normal or urgent files the ticket (and alerts the team) at once;
 *   - after N member turns with no hand-off, a person is offered.
 */

const MAX_MESSAGE = 1000;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

const HANDED_OVER = {
  en: "I've passed this to a person on our team. They'll see what you've told me here, so you don't need to repeat it.",
  pcm: "I don pass am give person for our team. Dem go see wetin you don tell me here, so you no need talk am again.",
};
const UNAVAILABLE = "Sorry — I couldn't answer that just now. A person on our team can help instead.";
const RESTING = "You've asked a lot today, so Toastly Help is resting. A person on our team can pick this up instead.";

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
  const conversation = conversationId;

  await admin.from("support_messages").insert({
    conversation_id: conversation,
    profile_id: user.id,
    role: "member",
    content: message,
  });

  const [{ count: memberTurns }, { data: openTicket }, config] = await Promise.all([
    admin.from("support_messages").select("id", { count: "exact", head: true }).eq("conversation_id", conversation).eq("role", "member"),
    admin.from("support_tickets").select("id").eq("conversation_id", conversation).neq("status", "resolved").limit(1).maybeSingle(),
    supportConfig(admin),
  ]);

  const keyword = keywordCheck(message);

  // Safety first, without a model in the way: an urgent keyword hit never
  // reaches the model.
  let reply: HelpReply | null = null;
  let rested = false;
  if (keyword?.handoff !== "urgent") {
    if (!(await takeAgentRequest(user.id, "help"))) {
      rested = true;
    } else {
      const { data: rows } = await admin
        .from("support_messages")
        .select("role, content")
        .eq("conversation_id", conversation)
        .order("created_at", { ascending: true })
        .limit(40);
      const history = (rows ?? []) as HelpTurn[];
      try {
        reply = await runHelp(history, supabase, user.id);
      } catch (e) {
        console.error("[help] model call failed:", (e as Error).name);
        reply = null;
      }
    }
  }

  // Repeated verification failure is counted, not guessed.
  let failedVerifications = 0;
  if (reply && (reply.category === "verification" || reply.category === "verification_repeat")) {
    const { count } = await admin
      .from("verification_sessions")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", user.id)
      .eq("product", "smartselfie")
      .in("status", ["block", "error"]);
    failedVerifications = count ?? 0;
  }

  const decision = decideHandoff({
    model: reply ? { handoff: reply.handoff, category: reply.category } : null,
    keyword,
    memberTurns: memberTurns ?? 1,
    offerAfterTurns: config.offerAfterTurns,
    ticketOpen: Boolean(openTicket),
    failedVerifications,
  });
  const language = reply?.language ?? "en";

  let answer: HelpAnswer;
  if (decision.handoff !== "none") {
    const ticket = await fileTicket(admin, {
      profileId: user.id,
      conversationId: conversation,
      category: decision.category,
      handoff: decision.handoff,
      trigger: decision.trigger ?? "member_asked",
    });
    const safety = decision.handoff === "urgent";
    let country = "NG";
    if (safety) {
      const { data: me } = await supabase.from("profiles").select("country_code").eq("id", user.id).maybeSingle();
      country = (me?.country_code as string | null) ?? "NG";
    }
    answer = {
      language,
      paragraphs: safety ? [] : [HANDED_OVER[language]],
      action: "none",
      handoff: decision.handoff,
      category: decision.category,
      ticket: ticket ? { reference: ticket.reference, sla: slaLine(ticket.slaMinutes, language) } : null,
      offer_person: false,
      safety,
      crisis: safety && decision.category === "self_harm" ? crisisLinesFor(country) : null,
      emergency: safety ? emergencyNumbersFor(country) : [],
    };
    // Filing failed: the member must still reach a person.
    if (!ticket) answer.paragraphs = [...answer.paragraphs, "If you don't hear from us, email support@trytoastly.com."];
  } else {
    answer = {
      language,
      paragraphs: reply?.paragraphs.length ? reply.paragraphs : [rested ? RESTING : UNAVAILABLE],
      action: reply?.action ?? "none",
      handoff: "none",
      category: decision.category,
      ticket: null,
      // No answer at all, or N turns without one: offer a person.
      offer_person: decision.offerPerson || !reply,
      safety: false,
      crisis: null,
      emergency: [],
    };
  }

  const said = [...answer.paragraphs, answer.ticket?.sla ?? ""].filter(Boolean).join("\n\n");
  if (said) {
    await admin.from("support_messages").insert({
      conversation_id: conversation,
      profile_id: user.id,
      role: "assistant",
      content: said.slice(0, 4000),
    });
  }
  await admin.from("support_conversations").update({ last_active_at: new Date().toISOString() }).eq("id", conversation);
  // An open ticket keeps the latest of the conversation.
  if (openTicket || answer.ticket) await admin.rpc("touch_support_ticket", { p_conversation: conversation });

  // Metadata only: labels and counts, never the question or the reply.
  await capture("agent_help_reply", user.id, {
    language,
    action: answer.action,
    handoff: answer.handoff,
    offered_person: answer.offer_person,
    safety: answer.safety,
  });

  return json({ conversation_id: conversation, reply: answer });
}

import { featureFlags } from "@/lib/features";
import { conciergeSystem } from "@/lib/concierge/system";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HAIKU, aiClient } from "@/lib/ai/client";
import { redact } from "@/lib/ai/redact";
import { CONCIERGE_TOOLS, runConciergeTool, type TicketCategory } from "@/lib/concierge/tools";

/**
 * Toastly Help — the Verification & Support Concierge (PRD §5.9 #1).
 *
 * Labelled as AI at first contact (the panel says so every time it opens).
 * No persona name, no small talk beyond the task. Task scope: why a liveness
 * check failed (from status codes only), ID-check options, payment problems,
 * coin deposits, plan questions, how features work. English and Pidgin.
 *
 * Stateless: every request sends the recent turns read back from Supabase.
 * The payload is the member's own words (redacted) and tool results built
 * from allow-listed fields — never their profile.
 *
 * A person decides refunds, disputes, appeals and any account restriction.
 * The assistant can only OFFER a hand-off; the member taps to file it.
 */

export const REPLY_ACTIONS = ["none", "retry_selfie", "check_id", "payment", "coins", "safety_kit"] as const;
export type ReplyAction = (typeof REPLY_ACTIONS)[number];

export type HelpLanguage = "en" | "pcm";

export type HelpReply = {
  language: HelpLanguage;
  paragraphs: string[];
  action: ReplyAction;
  handoff: TicketCategory | null;
  safety: boolean;
};

export type HelpTurn = { role: "member" | "assistant"; content: string };

const REPLY_SCHEMA = {
  type: "object",
  properties: {
    language: { type: "string", enum: ["en", "pcm"] },
    paragraphs: { type: "array", items: { type: "string" } },
    action: { type: "string", enum: [...REPLY_ACTIONS] },
  },
  required: ["language", "paragraphs", "action"],
  additionalProperties: false,
} as const;

// Facts are drawn from shipped copy and the PRD. If the product changes, this
// changes with it — the assistant must never promise what Toastly doesn't do.
const SYSTEM = conciergeSystem(featureFlags());

/** Plain signals that skip the model and go straight to safety resources. */
const SAFETY_SIGNALS =
  /\b(kill (myself|me)|suicid|self[- ]?harm|end my life|rap(e|ed)|assault|kidnap|blackmail|threaten|in danger|emergency|he hit me|she hit me|dem wan kill|i no safe)\b/i;

export function hasSafetySignal(text: string): boolean {
  return SAFETY_SIGNALS.test(text);
}

const MAX_TURNS = 12;
const MAX_TOOL_ROUNDS = 4;

function parseReply(raw: string): Pick<HelpReply, "language" | "paragraphs" | "action"> | null {
  let v: unknown;
  try {
    v = JSON.parse(raw.trim());
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const language = o.language === "pcm" ? "pcm" : o.language === "en" ? "en" : null;
  const action = (REPLY_ACTIONS as readonly string[]).includes(o.action as string) ? (o.action as ReplyAction) : null;
  const paragraphs = Array.isArray(o.paragraphs)
    ? o.paragraphs.filter((p): p is string => typeof p === "string" && p.trim().length > 0).slice(0, 4)
    : [];
  if (!language || !action || paragraphs.length === 0) return null;
  return { language, paragraphs, action };
}

export async function runHelp(
  history: HelpTurn[],
  supabase: SupabaseClient,
  profileId: string,
): Promise<HelpReply | null> {
  const client = aiClient();
  if (!client) return null;

  const messages: Anthropic.MessageParam[] = history.slice(-MAX_TURNS).map((t) => ({
    role: t.role === "member" ? "user" : "assistant",
    content: t.role === "member" ? redact(t.content) : t.content,
  }));
  // The API requires the first turn to be the member's.
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length) return null;

  let handoff: TicketCategory | null = null;
  let safety = false;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: HAIKU,
      max_tokens: 1024,
      system: SYSTEM,
      tools: CONCIERGE_TOOLS,
      output_config: { format: { type: "json_schema", schema: REPLY_SCHEMA } },
      messages,
    });

    if (response.stop_reason === "refusal") return null;

    if (response.stop_reason === "tool_use") {
      const uses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const use of uses) {
        const outcome = await runConciergeTool(use.name, use.input, supabase, profileId);
        if (outcome.handoff) handoff = outcome.handoff;
        if (outcome.safety) safety = true;
        results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(outcome.result) });
      }
      // Safety stops the task: no further model turn, fixed copy instead.
      if (safety) return { language: "en", paragraphs: [], action: "safety_kit", handoff: "other", safety: true };
      messages.push({ role: "user", content: results });
      continue;
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const reply = parseReply(text);
    if (!reply) {
      console.error("[help] unparseable reply", { length: text.length });
      return null;
    }
    return { ...reply, handoff, safety: false };
  }
  return null;
}

import { featureFlags } from "@/lib/features";
import { conciergeSystem } from "@/lib/concierge/system";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HAIKU, aiClient } from "@/lib/ai/client";
import { redact } from "@/lib/ai/redact";
import { CONCIERGE_TOOLS, runConciergeTool } from "@/lib/concierge/tools";
import { HANDOFF_LEVELS, HELP_CATEGORIES, isCategory, type Handoff, type HelpCategory } from "@/lib/help-escalation";

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
 * The assistant never files anything: it returns {handoff, category} as
 * structured output, and the Help route decides with lib/help-escalation.ts
 * (a keyword check can raise it; the higher wins) and files the ticket.
 */

export const REPLY_ACTIONS = ["none", "retry_selfie", "check_id", "payment", "coins"] as const;
export type ReplyAction = (typeof REPLY_ACTIONS)[number];

export type HelpLanguage = "en" | "pcm";

/** The model's answer: words for the member, plus its hand-off verdict. */
export type HelpReply = {
  language: HelpLanguage;
  paragraphs: string[];
  action: ReplyAction;
  handoff: Handoff;
  category: HelpCategory;
};

export type HelpTurn = { role: "member" | "assistant"; content: string };

const REPLY_SCHEMA = {
  type: "object",
  properties: {
    language: { type: "string", enum: ["en", "pcm"] },
    paragraphs: { type: "array", items: { type: "string" } },
    action: { type: "string", enum: [...REPLY_ACTIONS] },
    handoff: { type: "string", enum: [...HANDOFF_LEVELS] },
    category: { type: "string", enum: [...HELP_CATEGORIES] },
  },
  required: ["language", "paragraphs", "action", "handoff", "category"],
  additionalProperties: false,
} as const;

// Facts are drawn from shipped copy and the PRD. If the product changes, this
// changes with it — the assistant must never promise what Toastly doesn't do.
const SYSTEM = conciergeSystem(featureFlags());

const MAX_TURNS = 12;
const MAX_TOOL_ROUNDS = 4;

function parseReply(raw: string): HelpReply | null {
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
  const handoff = (HANDOFF_LEVELS as readonly string[]).includes(o.handoff as string) ? (o.handoff as Handoff) : null;
  const category = isCategory(o.category) ? o.category : null;
  if (!language || !action || !handoff || !category) return null;
  // A hand-off may come with no words: the route supplies the copy.
  if (paragraphs.length === 0 && handoff === "none") return null;
  return { language, paragraphs, action, handoff, category };
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
        results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(outcome.result) });
      }
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
    return reply;
  }
  return null;
}

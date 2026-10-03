import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Toastly Help's tools — READ-ONLY, plus two proposals the member confirms.
 *
 * The complete list is CONCIERGE_TOOL_NAMES. A constraint check fails the
 * build if a tool is added that moves money, changes an account or reads
 * chats. Each read runs through the MEMBER'S OWN session, so row-level
 * security still applies: the assistant can never see more than the member.
 *
 * What each read returns is an allow-list of fields (status codes and
 * counts), never a profile: no name, photo, protected attribute, genotype,
 * message, Gist data, selfie or ID number.
 */

export const CONCIERGE_TOOL_NAMES = [
  "get_verification_status",
  "get_subscription_status",
  "get_coin_balance",
  "create_support_ticket",
  "escalate_safety",
] as const;

export type ConciergeToolName = (typeof CONCIERGE_TOOL_NAMES)[number];

export const TICKET_CATEGORIES = ["refund", "dispute", "appeal", "payment", "verification", "other"] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

const EMPTY_INPUT = { type: "object", properties: {}, additionalProperties: false } as const;

export const CONCIERGE_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_verification_status",
    description:
      "Read the member's verification stage and the status code of their latest selfie check and latest ID check. Returns codes only — never images or numbers.",
    input_schema: EMPTY_INPUT,
  },
  {
    name: "get_subscription_status",
    description: "Read the member's current plan (starter, premium, premium_plus, diaspora or diaspora_plus).",
    input_schema: EMPTY_INPUT,
  },
  {
    name: "get_coin_balance",
    description: "Read the member's coin balance, split into coins they bought (refundable on request) and stake credit (from a date the other person missed; usable only as a future date deposit, never cashed out).",
    input_schema: EMPTY_INPUT,
  },
  {
    name: "create_support_ticket",
    description:
      "Offer to pass this to a person on the Toastly team. Use it for refunds, disputes, appeals, charges you can't explain, or whenever the member asks for a person. It does NOT file anything: the member sees a button and decides.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { category: { type: "string", enum: [...TICKET_CATEGORIES] } },
      required: ["category"],
      additionalProperties: false,
    },
  },
  {
    name: "escalate_safety",
    description:
      "Use immediately if the member describes distress, danger, threats, assault, blackmail, self-harm or any emergency. Stops the task and shows safety resources and a person.",
    input_schema: EMPTY_INPUT,
  },
];

export type ToolOutcome = {
  /** What goes back to the model as the tool_result. */
  result: Record<string, unknown>;
  /** A hand-off the member can confirm with one tap. */
  handoff?: TicketCategory;
  /** Stop the task and show safety resources. */
  safety?: boolean;
};

export async function runConciergeTool(
  name: string,
  input: unknown,
  supabase: SupabaseClient,
  profileId: string,
): Promise<ToolOutcome> {
  switch (name as ConciergeToolName) {
    case "get_verification_status": {
      const [{ data: profile }, { data: sessions }] = await Promise.all([
        supabase.from("profiles").select("stage").eq("id", profileId).single(),
        supabase
          .from("verification_sessions")
          .select("product, status, result_code")
          .eq("profile_id", profileId)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      const latest = (product: string) => {
        const s = (sessions ?? []).find((x) => x.product === product);
        return s ? { status: s.status, reason_code: s.result_code } : null;
      };
      return {
        result: {
          stage: profile?.stage ?? "unknown",
          selfie_check: latest("smartselfie"),
          id_check: latest("biometric_kyc"),
        },
      };
    }
    case "get_subscription_status": {
      const { data } = await supabase.rpc("current_tier", { p_profile_id: profileId });
      return { result: { plan: typeof data === "string" ? data : "unknown" } };
    }
    case "get_coin_balance": {
      const [{ data: balance }, { data: withdrawable }] = await Promise.all([
        supabase.rpc("coin_balance", { p_profile_id: profileId }),
        supabase.rpc("withdrawable_balance", { p_profile_id: profileId }),
      ]);
      const total = typeof balance === "number" ? balance : 0;
      const bought = typeof withdrawable === "number" ? withdrawable : 0;
      return { result: { coins: total, bought_coins: bought, stake_credit: Math.max(0, total - bought) } };
    }
    case "create_support_ticket": {
      const raw = (input as { category?: unknown } | null)?.category;
      const category = (TICKET_CATEGORIES as readonly string[]).includes(raw as string)
        ? (raw as TicketCategory)
        : "other";
      return {
        result: { offered: true, note: "The member now sees a 'Pass this to our team' button. Nothing is filed until they tap it." },
        handoff: category,
      };
    }
    case "escalate_safety":
      return { result: { shown: true }, safety: true };
    default:
      return { result: { error: "unknown tool" } };
  }
}

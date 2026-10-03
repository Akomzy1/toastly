import Anthropic from "@anthropic-ai/sdk";

/**
 * The one way Toastly calls a model — server side only.
 *
 * PRD §5.9 and CLAUDE.md, enforced here and by scripts/check-constraints.mjs:
 *   - Claude only. No second LLM vendor, no vendor-hosted agent sessions
 *     (no Managed Agents, no OpenAI Agents API): every call is a stateless
 *     Messages API request, and any state lives in Supabase.
 *   - Haiku for both launch agents: they are high-volume and narrow.
 *   - Every payload is built from an allow-list of permitted fields by the
 *     caller, and redacted (lib/ai/redact.ts) before it is sent. Protected
 *     attributes, genotype, member-to-member messages, Gist data, selfies and
 *     ID numbers are never sent.
 *   - Agents in the infrastructure, never in the intimacy: nothing here
 *     writes, suggests or rewrites words for a member.
 */

export const HAIKU = "claude-haiku-4-5";

let client: Anthropic | null = null;

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Returns null when no key is set, so callers degrade instead of throwing. */
export function aiClient(): Anthropic | null {
  if (!aiConfigured()) return null;
  client ??= new Anthropic({ maxRetries: 2, timeout: 30_000 });
  return client;
}

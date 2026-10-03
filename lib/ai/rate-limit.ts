import { createAdminClient } from "@/lib/supabase/admin";

/** Requests per member per agent per rolling 24 hours. Free on every tier. */
export const AGENT_DAILY_LIMIT = { help: 60, answer_mirror: 30 } as const;

export type AgentName = keyof typeof AGENT_DAILY_LIMIT;

/**
 * Count-and-record. Metadata only (who, which agent, when) in
 * agent_requests; the purge drops rows after a week. Returns false when the
 * member is over the limit, or when the server can't record the request.
 */
export async function takeAgentRequest(profileId: string, agent: AgentName): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from("agent_requests")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("agent", agent)
    .gte("created_at", since);
  if (error || (count ?? 0) >= AGENT_DAILY_LIMIT[agent]) return false;
  const { error: insertError } = await admin.from("agent_requests").insert({ profile_id: profileId, agent });
  return !insertError;
}

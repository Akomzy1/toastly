import { NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

/**
 * Shared plumbing for the Gist call routes. Every read and write runs as the
 * member (RLS applies); the clock itself lives in security-definer functions
 * (0019), so a member can't move it.
 */

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function memberSession() {
  if (!isSupabaseConfigured()) return { supabase: null, user: null };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export type GistClock = {
  ends_at: string | null;
  extended: boolean;
  you_asked_to_extend: boolean;
  they_asked_to_extend: boolean;
  finished: boolean;
  /** The shared question card both people are on (0022). */
  deck_index: number;
};

/** The clock as the server sees it, from the member's own view of the row. */
export async function readClock(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  userId: string,
): Promise<GistClock | null> {
  const { data: s } = await supabase
    .from("gist_sessions")
    .select("proposer_id, ends_at, extended_at, proposer_extend_at, invitee_extend_at, deck_index")
    .eq("id", sessionId)
    .maybeSingle();
  if (!s) return null;
  const isProposer = s.proposer_id === userId;
  return {
    ends_at: s.ends_at,
    extended: Boolean(s.extended_at),
    you_asked_to_extend: Boolean(isProposer ? s.proposer_extend_at : s.invitee_extend_at),
    they_asked_to_extend: Boolean(isProposer ? s.invitee_extend_at : s.proposer_extend_at),
    finished: Boolean(s.ends_at && Date.now() >= Date.parse(s.ends_at)),
    deck_index: typeof s.deck_index === "number" ? s.deck_index : 0,
  };
}

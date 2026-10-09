import { NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { featureFlags } from "@/lib/features";

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
  /** How many of this Gist's cards are done — the card both people are on (0022). */
  deck_index: number;
  /** This Gist's own cards, in order (0039); empty until the call starts. */
  deck: { position: number; text: string }[];
  /**
   * Video (0040). null — no video control at all — while VIDEO_GIST_ENABLED
   * is off, or when neither person has Premium Plus or Diaspora Plus.
   */
  video: GistVideo | null;
};

export type GistVideo = {
  state: "off" | "requested" | "on";
  /** You asked (and are waiting), rather than them. */
  asked_by_you: boolean;
  /** A request was declined: no more in this Gist. */
  declined: boolean;
  /** When "Ask for video" opens (the call's start + the configured wait). */
  ask_from: string | null;
  /** The configured wait, for "Available after N minutes". */
  ask_after_seconds: number;
  off_reason: string | null;
};

/** The clock as the server sees it, from the member's own view of the row. */
export async function readClock(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  userId: string,
): Promise<GistClock | null> {
  const { data: s } = await supabase
    .from("gist_sessions")
    .select("proposer_id, ends_at, started_at, extended_at, proposer_extend_at, invitee_extend_at, deck_index, video_state, video_requested_by, video_declined_at, video_off_reason")
    .eq("id", sessionId)
    .maybeSingle();
  if (!s) return null;
  const { data: cards } = await supabase.rpc("gist_deck", { p_session_id: sessionId });
  const isProposer = s.proposer_id === userId;
  let video: GistVideo | null = null;
  if (featureFlags().videoGist) {
    const [{ data: allowed }, { data: cfg }] = await Promise.all([
      supabase.rpc("gist_video_allowed", { p_session_id: sessionId }),
      supabase.from("gist_config").select("video_ask_after_seconds").maybeSingle(),
    ]);
    if (allowed === true) {
      const wait = (cfg?.video_ask_after_seconds as number | undefined) ?? 180;
      video = {
        state: (s.video_state as GistVideo["state"]) ?? "off",
        asked_by_you: s.video_requested_by === userId,
        declined: Boolean(s.video_declined_at),
        ask_from: s.started_at ? new Date(Date.parse(s.started_at) + wait * 1000).toISOString() : null,
        ask_after_seconds: wait,
        off_reason: s.video_off_reason ?? null,
      };
    }
  }
  return {
    ends_at: s.ends_at,
    extended: Boolean(s.extended_at),
    you_asked_to_extend: Boolean(isProposer ? s.proposer_extend_at : s.invitee_extend_at),
    they_asked_to_extend: Boolean(isProposer ? s.invitee_extend_at : s.proposer_extend_at),
    finished: Boolean(s.ends_at && Date.now() >= Date.parse(s.ends_at)),
    deck_index: typeof s.deck_index === "number" ? s.deck_index : 0,
    deck: ((cards ?? []) as { deck_position: number; question: string }[]).map((c) => ({ position: c.deck_position, text: c.question })),
    video,
  };
}

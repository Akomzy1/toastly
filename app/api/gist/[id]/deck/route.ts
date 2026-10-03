import { json, memberSession, readClock } from "@/lib/gist-clock";

export const dynamic = "force-dynamic";

/**
 * Next or Skip on the shared question card. Either person can tap, after
 * agreeing out loud; the server moves the deck one step for both. `expected`
 * is the card the tapper was looking at, so two taps at once move it once.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { supabase, user } = await memberSession();
  if (!supabase) return json({ error: "unavailable" }, 503);
  if (!user) return json({ error: "Please sign in again." }, 401);

  let body: { expected?: unknown; skip?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad request" }, 400);
  }
  const expected = typeof body.expected === "number" && Number.isInteger(body.expected) ? body.expected : null;
  if (expected === null || expected < 0) return json({ error: "bad request" }, 400);

  const { error } = await supabase.rpc("gist_deck_advance", {
    p_session_id: params.id,
    p_expected: expected,
    p_skip: body.skip === true,
  });
  if (error) return json({ error: error.message }, 409);
  const clock = await readClock(supabase, params.id, user.id);
  return json({ clock });
}

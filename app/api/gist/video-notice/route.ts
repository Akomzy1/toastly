import { json, memberSession } from "@/lib/gist-clock";
import { featureFlags } from "@/lib/features";

export const dynamic = "force-dynamic";

/**
 * The one-time "we can't stop someone recording their screen" notice has
 * been seen (0041): recorded once per member, so it isn't shown again on any
 * device. Refused while VIDEO_GIST_ENABLED is off.
 */
export async function POST() {
  if (!featureFlags().videoGist) return json({ error: "Video isn't available yet." }, 404);
  const { supabase, user } = await memberSession();
  if (!supabase) return json({ error: "unavailable" }, 503);
  if (!user) return json({ error: "Please sign in again." }, 401);
  const { error } = await supabase.rpc("acknowledge_video_notice");
  if (error) return json({ error: error.message }, 409);
  return json({ ok: true });
}

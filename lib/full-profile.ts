import { STARTER_MONTHLY_GISTS } from "@/lib/plan-numbers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canSendText } from "@/lib/feed";
import { shownFaithLine } from "@/lib/faith";
import { genotypeForOthers } from "@/lib/genotype";
import { getMemberProfile } from "@/lib/member-profile";
import type { FullProfileOrigin, FullProfileView } from "@/lib/full-profile-view";
import { HISTORY_LABELS, INTENT_LABELS, type Tier } from "@/lib/types/profile";

/**
 * SERVER ONLY. Everything another member's full profile shows this viewer
 * (PRD §5.2.4; full-profile-view.slim.html).
 *
 * The profile comes from profile_for (0033): the database returns only the
 * fields the owner shows this viewer, and nothing at all unless the viewer
 * can open the profile (0032). A field that isn't shown is simply absent — no
 * placeholder, no "hidden" label. Nothing here records that it was opened.
 */

const INVITE_OPEN_MS = 3 * 24 * 60 * 60 * 1000;

export async function loadFullProfile(
  supabase: SupabaseClient,
  viewerId: string,
  ownerId: string,
): Promise<FullProfileView | null> {
  if (ownerId === viewerId) return null;
  const m = await getMemberProfile(supabase, ownerId);
  if (!m) return null;

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: answers }, { data: six }, { data: invites }, { data: tierRow }, { data: used }] = await Promise.all([
    supabase
      .from("prompt_answers")
      .select("id, answer, created_at, prompts(text)")
      .eq("profile_id", ownerId)
      .order("created_at", { ascending: true }),
    supabase.from("daily_feed").select("candidate_id").eq("profile_id", viewerId).eq("feed_date", today).eq("candidate_id", ownerId),
    supabase
      .from("gist_sessions")
      .select("id, created_at")
      .eq("proposer_id", ownerId)
      .eq("invitee_id", viewerId)
      .eq("status", "proposed")
      .order("created_at", { ascending: false })
      .limit(1),
    supabase.rpc("current_tier", { p_profile_id: viewerId }),
    supabase.rpc("voice_gists_this_month", { p_profile_id: viewerId }),
  ]);

  const paid = canSendText(((tierRow as Tier | null) ?? "starter") as Tier);
  const inSix = (six ?? []).length > 0;
  const openInvite = (invites ?? []).find((g) => Date.now() - Date.parse(g.created_at) < INVITE_OPEN_MS);
  const origin: FullProfileOrigin = openInvite ? "invite" : m.matched ? "matched" : inSix ? "six" : "reached_out";

  // The paths profile_for returned; storage signs them only under the
  // owner's reveal rules (can_see_photo_file).
  let photos: FullProfileView["photos"] = [];
  if (m.photos?.length) {
    const { data: signed } = await supabase.storage
      .from("profile-photos")
      .createSignedUrls(m.photos.map((p) => p.path), 60 * 30);
    photos = m.photos
      .map((p) => ({ id: p.id, url: signed?.find((s) => s.path === p.path)?.signedUrl ?? "" }))
      .filter((x) => x.url);
  }

  const details: FullProfileView["details"] = [];
  if (m.languages?.length) details.push({ label: "Languages", value: m.languages.join(" · ") });
  if (m.tribe) details.push({ label: "Tribe", value: m.tribe });
  const faith = shownFaithLine(m);
  if (faith) details.push({ label: "Faith", value: faith });
  if (m.profession) details.push({ label: "Profession", value: m.profession, verified: m.profession_verified === true });
  if (m.education) details.push({ label: "Education", value: m.education });
  if (m.history) details.push({ label: "Relationship history", value: HISTORY_LABELS[m.history] });
  if (m.genotype) details.push({ label: "Genotype", value: genotypeForOthers(m.genotype) });

  return {
    id: m.id,
    name: m.display_name,
    first: m.display_name.split(" ")[0],
    age: typeof m.age === "number" ? m.age : null,
    city: m.city ?? null,
    origin,
    photos,
    idChecked: m.stage === "id_confirmed",
    intent: m.intent ? INTENT_LABELS[m.intent] : null,
    answers: ((answers ?? []) as { id: string; answer: string; prompts: { text?: string } | { text?: string }[] | null }[]).map((a) => ({
      id: a.id,
      prompt: (Array.isArray(a.prompts) ? a.prompts[0]?.text : a.prompts?.text) ?? "",
      answer: a.answer,
    })),
    // A Starter Gist invite can only go to someone in today's six (gist_invite, 0029).
    action: openInvite ? "none" : paid ? "reply" : inSix ? "gist" : "none",
    gistsLeft: paid ? null : Math.max(0, STARTER_MONTHLY_GISTS - ((used as number | null) ?? 0)),
    details,
    invite: openInvite ? { sessionId: openInvite.id, starter: !paid } : null,
  };
}

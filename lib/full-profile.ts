import type { SupabaseClient } from "@supabase/supabase-js";
import { getVisibleGenotype } from "@/components/genotype/genotype-data";
import { canSendText } from "@/lib/feed";
import { loadFaithLineFor } from "@/lib/faith";
import { genotypeForOthers } from "@/lib/genotype";
import type { FullProfileOrigin, FullProfileView } from "@/lib/full-profile-view";
import {
  HISTORY_LABELS,
  INTENT_LABELS,
  type FieldVisibility,
  type IntentLevel,
  type RelationshipHistory,
  type Tier,
} from "@/lib/types/profile";

/**
 * SERVER ONLY. Everything another member's full profile shows this viewer
 * (PRD §5.2.4; full-profile-view.slim.html).
 *
 * Every read goes through the viewer's own session, so the database decides:
 * the profile row, answers, photos and history are readable only through
 * can_open_profile (0032), and each field then follows its own visibility for
 * this viewer. A field that isn't shown is simply absent — no placeholder, no
 * "hidden" label. Nothing here records that the profile was opened.
 */

/** Shown to this viewer? 'public' always; 'on_match' once they're matched. */
function shown(v: FieldVisibility | null | undefined, matched: boolean): boolean {
  return v === "public" || (v === "on_match" && matched);
}

const INVITE_OPEN_MS = 3 * 24 * 60 * 60 * 1000;

export async function loadFullProfile(
  supabase: SupabaseClient,
  viewerId: string,
  ownerId: string,
): Promise<FullProfileView | null> {
  if (ownerId === viewerId) return null;
  const { data: can } = await supabase.rpc("can_open_profile", { p_owner: ownerId });
  if (can !== true) return null;

  const today = new Date().toISOString().slice(0, 10);
  const [
    { data: p },
    { data: age },
    { data: matched },
    { data: answers },
    { data: photoRows },
    { data: six },
    { data: invites },
    { data: tierRow },
    { data: used },
    faith,
    genotype,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, display_name, city, stage, intent, main_photo_id, languages, languages_visibility, tribe, tribe_visibility, profession, profession_visibility, profession_verified_at, education, education_visibility",
      )
      .eq("id", ownerId)
      .maybeSingle(),
    supabase.rpc("age_for", { p_owner: ownerId }),
    supabase.rpc("i_am_matched_with", { p_owner: ownerId }),
    supabase
      .from("prompt_answers")
      .select("id, answer, created_at, prompts(text)")
      .eq("profile_id", ownerId)
      .order("created_at", { ascending: true }),
    supabase.from("profile_photos").select("id, storage_path, position").eq("profile_id", ownerId).order("position"),
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
    loadFaithLineFor(supabase, ownerId),
    getVisibleGenotype(ownerId),
  ]);
  if (!p) return null;

  // Its own statement: relationship history lives in profile_history (0013),
  // never on profiles, and follows its owner's choice for this viewer.
  const { data: history } = await supabase.from("profile_history").select("history").eq("profile_id", ownerId).maybeSingle();

  const isMatched = matched === true;
  const paid = canSendText(((tierRow as Tier | null) ?? "starter") as Tier);
  const inSix = (six ?? []).length > 0;
  const openInvite = (invites ?? []).find((g) => Date.now() - Date.parse(g.created_at) < INVITE_OPEN_MS);

  const origin: FullProfileOrigin = openInvite ? "invite" : isMatched ? "matched" : inSix ? "six" : "reached_out";

  // Main photo first, then the rest in the owner's order.
  const rows = (photoRows ?? []) as { id: string; storage_path: string; position: number }[];
  rows.sort((a, b) => (a.id === p.main_photo_id ? -1 : b.id === p.main_photo_id ? 1 : a.position - b.position));
  let photos: FullProfileView["photos"] = [];
  if (rows.length) {
    const { data: signed } = await supabase.storage
      .from("profile-photos")
      .createSignedUrls(rows.map((r) => r.storage_path), 60 * 30);
    photos = rows
      .map((r) => ({ id: r.id, url: signed?.find((s) => s.path === r.storage_path)?.signedUrl ?? "" }))
      .filter((x) => x.url);
  }

  const details: FullProfileView["details"] = [];
  const languages = (p.languages as string[] | null) ?? [];
  if (languages.length && shown(p.languages_visibility, isMatched)) details.push({ label: "Languages", value: languages.join(" · ") });
  if (p.tribe?.trim() && shown(p.tribe_visibility, isMatched)) details.push({ label: "Tribe", value: p.tribe.trim() });
  if (faith) details.push({ label: "Faith", value: faith });
  if (p.profession?.trim() && shown(p.profession_visibility, isMatched)) {
    details.push({ label: "Profession", value: p.profession.trim(), verified: !!p.profession_verified_at });
  }
  if (p.education?.trim() && shown(p.education_visibility, isMatched)) details.push({ label: "Education", value: p.education.trim() });
  const h = (history as { history: RelationshipHistory | null } | null)?.history;
  if (h) details.push({ label: "Relationship history", value: HISTORY_LABELS[h] });
  if (genotype) details.push({ label: "Genotype", value: genotypeForOthers(genotype) });

  const name = p.display_name as string;
  return {
    id: p.id,
    name,
    first: name.split(" ")[0],
    age: typeof age === "number" ? age : null,
    city: p.city ?? null,
    origin,
    photos,
    idChecked: p.stage === "id_confirmed",
    intent: p.intent ? INTENT_LABELS[p.intent as IntentLevel] : null,
    answers: ((answers ?? []) as { id: string; answer: string; prompts: { text?: string } | { text?: string }[] | null }[]).map((a) => ({
      id: a.id,
      prompt: (Array.isArray(a.prompts) ? a.prompts[0]?.text : a.prompts?.text) ?? "",
      answer: a.answer,
    })),
    // A Starter Gist invite can only go to someone in today's six (gist_invite, 0029).
    action: openInvite ? "none" : paid ? "reply" : inSix ? "gist" : "none",
    gistsLeft: paid ? null : Math.max(0, 2 - ((used as number | null) ?? 0)),
    details,
    invite: openInvite ? { sessionId: openInvite.id, starter: !paid } : null,
  };
}

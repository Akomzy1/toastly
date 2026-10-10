"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { capture } from "@/lib/analytics";
import { requireLiveProfile, notLiveError } from "@/lib/live-profile";
import { FILTER_RELIGIONS, FILTER_TRIBES, FILTER_WANTS_CHILDREN, type MemberFilters } from "@/lib/filters";

export type FiltersResult = { error?: string } | null;

/**
 * Save the member's own filters (PRD §5.2.4). A plan with advanced filters
 * is required — the database refuses anyone else (0031). PostHog hears only
 * that filters changed: never which religion, tribe or children answer was
 * chosen.
 */
export async function saveFilters(input: MemberFilters): Promise<FiltersResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };
  const live = await requireLiveProfile(supabase);
  if (!live.live) return { error: notLiveError(live) };

  const { data: allowed } = await supabase.rpc("i_have_advanced_filters");
  if (allowed !== true) return { error: "Filters come with Premium, Premium Plus, Diaspora and Diaspora Plus." };

  const religions = FILTER_RELIGIONS.filter((r) => input.religions.includes(r));
  const tribes = FILTER_TRIBES.filter((t) => input.tribes.includes(t));
  const wantsChildren = FILTER_WANTS_CHILDREN.map((w) => w.value).filter((v) => (input.wants_children ?? []).includes(v));
  const { error } = await supabase.from("member_filters").upsert({
    profile_id: user.id,
    religions,
    religion_include_unsaid: input.religion_include_unsaid !== false,
    tribes,
    tribe_include_unsaid: input.tribe_include_unsaid !== false,
    wants_children: wantsChildren,
    wants_children_include_unsaid: input.wants_children_include_unsaid !== false,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: "That didn't save. Try again." };

  await capture("filters_changed", user.id);
  revalidatePath("/profile/filters");
  revalidatePath("/feed");
  return null;
}

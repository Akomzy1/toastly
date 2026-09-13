import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { MatchCard } from "./match-card";
import { canSendText, DAILY_MATCH_COUNT, type FeedCandidate } from "@/lib/feed";
import {
  isVerifiedReal,
  type Profile,
  type Tier,
} from "@/lib/types/profile";

export const metadata: Metadata = {
  title: "Today's matches",
  robots: { index: false, follow: false },
};

/** Which optional fields this candidate chose to show publicly. */
function visibleTags(p: Partial<Profile>): string[] {
  const out: string[] = [];
  if (p.tribe && p.tribe_visibility === "public") out.push(p.tribe);
  if (p.religion && p.religion_visibility === "public") out.push(p.religion);
  if (p.languages?.length && p.languages_visibility === "public") {
    out.push(...p.languages);
  }
  if (p.profession && p.profession_visibility === "public") out.push(p.profession);
  // Relationship history is deliberately absent: it defaults to on_match and
  // is never shown on a feed card by default (CLAUDE.md).
  return out;
}

export default async function FeedPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("stage, display_name")
    .eq("id", user.id)
    .single();

  // The trust layer: you cannot browse before you are verified.
  if (!me || !isVerifiedReal(me)) redirect("/verify");

  const { data: tierRow } = await supabase.rpc("current_tier", {
    p_profile_id: user.id,
  });
  const tier = (tierRow as Tier | null) ?? "starter";

  // Builds today's six if they don't exist yet, and returns the same six on
  // every subsequent load — refreshing never re-rolls the deck.
  const { data: feed } = await supabase.rpc("build_daily_feed", {
    p_profile_id: user.id,
  });

  const ids = (feed ?? []).map((f: { candidate_id: string }) => f.candidate_id);

  const { data: candidates } = ids.length
    ? await supabase
        .from("profiles")
        .select(
          "id, display_name, city, stage, tribe, religion, languages, profession, tribe_visibility, religion_visibility, languages_visibility, profession_visibility",
        )
        .in("id", ids)
    : { data: [] };

  const { data: answers } = ids.length
    ? await supabase
        .from("prompt_answers")
        .select("id, profile_id, answer, prompts(text)")
        .in("profile_id", ids)
    : { data: [] };

  const cards: FeedCandidate[] = (feed ?? []).map(
    (f: { candidate_id: string }) => {
      const c = (candidates ?? []).find((x) => x.id === f.candidate_id);
      return {
        id: f.candidate_id,
        display_name: c?.display_name ?? "Member",
        city: c?.city ?? null,
        stage: (c?.stage as FeedCandidate["stage"]) ?? "verified_real",
        answers: (answers ?? [])
          .filter((a) => a.profile_id === f.candidate_id)
          .map((a) => ({
            id: a.id,
            prompt:
              (a.prompts as unknown as { text: string } | null)?.text ?? "Prompt",
            answer: a.answer,
          })),
        tags: visibleTags(c ?? {}),
      };
    },
  );

  return (
    <div className="mx-auto grid max-w-[640px] gap-6 px-5 py-section-y">
      <div className="grid gap-2">
        <h1 className="text-h3 text-ink-900">Today&rsquo;s matches</h1>
        <p className="text-ui text-grey-600">
          {DAILY_MATCH_COUNT} people, once a day. Read what they wrote and
          reply to something specific. When they&rsquo;re gone, they&rsquo;re
          gone — go and live your life.
        </p>
      </div>

      {/* The count is identical on every tier, and the page says so, so that
          nobody reads scarcity as a limit they could pay to remove. */}
      <Notice tone="info">
        Everybody gets {DAILY_MATCH_COUNT} a day — free or paid, the number
        never changes. Paying improves how well the {DAILY_MATCH_COUNT} are
        matched to you, never how many there are.
      </Notice>

      {cards.length === 0 ? (
        /* Empty state. NOT IN THE PROTOTYPE — flagged. */
        <Card className="grid gap-3 p-[26px]">
          <h2 className="text-h5 text-ink-900">No matches today</h2>
          <p className="text-ui text-grey-600">
            There aren&rsquo;t enough verified members in your pool yet.
            Tomorrow&rsquo;s feed will try again — and widening your pool in
            settings gives it more to work with.
          </p>
          <Button variant="outline" asChild className="justify-self-start">
            <Link href="/profile">Profile settings</Link>
          </Button>
        </Card>
      ) : (
        <div className="grid gap-5">
          {cards.map((c) => (
            <MatchCard key={c.id} candidate={c} canSendText={canSendText(tier)} />
          ))}
        </div>
      )}

      <p className="text-nav text-grey-600">
        That&rsquo;s everyone for today. No deck to shuffle, nothing saved for
        later.
      </p>
    </div>
  );
}

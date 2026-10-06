import type { Metadata } from "next";
import { ScreenBand } from "@/components/app/screen-band";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { FeedFallbackNotice } from "@/components/app/feed-fallback-notice";
import { PoolPlanNotice } from "@/components/app/pool-plan-notice";
import { getVisibleGenotypes } from "@/components/genotype/genotype-data";
import { MatchCard } from "./match-card";
import { DAILY_MATCH_COUNT, type FeedCandidate } from "@/lib/feed";
import {
  isVerifiedReal,
  type Profile,
  type Tier,
} from "@/lib/types/profile";
import { requireLiveProfile } from "@/lib/live-profile";
import { ProfileNotLive } from "@/components/app/profile-not-live";

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

  // No live profile, no access (PRD §5.1.2): checked before anything about
  // anyone else is read. The database refuses regardless (0029); this says why.
  const live = await requireLiveProfile(supabase);
  if (!live.live) return <ProfileNotLive status={live} />;

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

  // Non-null when the member asked for diaspora matching but their city
  // hasn't opened yet, so the six came from the back-home pool instead. The
  // substitution is never silent (PRD §5.6).
  const { data: fallbackCity } = await supabase.rpc("pool_fallback_city", {
    p_profile_id: user.id,
  });

  // Non-null ('tier') when the member asked for diaspora matching without a
  // Diaspora plan (0012): the six came from back home. Told, never silent —
  // and this takes precedence over the city notice, which is for cities not
  // yet open.
  const [{ data: poolRestriction }, { data: myCountry }] = await Promise.all([
    supabase.rpc("pool_restriction", { p_profile_id: user.id }),
    supabase.from("profiles").select("country_code").eq("id", user.id).maybeSingle(),
  ]);
  const needsDiasporaPlan = poolRestriction === "tier" && (myCountry?.country_code ?? "NG") !== "NG";

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

  // Present only where both have chosen to share (0014). Under the match
  // definition that is rare in the daily six — but this is where
  // genotype-display.slim.html puts it.
  const sharedGenotypes = await getVisibleGenotypes(ids);

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
        genotype: sharedGenotypes[f.candidate_id] ?? null,
      };
    },
  );

  return (
    <>
      <ScreenBand title="Today's six" sub="Refreshes daily" />
    <div className="mx-auto grid max-w-[640px] gap-6 px-5 pb-section-y pt-5 lg:pt-4">
      <div className="grid gap-2">
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

      {/* Built against design/prototype/feed-fallback-notice.slim.html. Says
          plainly which pool the six came from, and why, rather than leaving a
          diaspora member to wonder why everyone is in Lagos. */}
      {needsDiasporaPlan ? <PoolPlanNotice /> : fallbackCity ? <FeedFallbackNotice city={String(fallbackCity)} /> : null}

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
            <Link href="/profile/edit">Profile settings</Link>
          </Button>
        </Card>
      ) : (
        <div className="grid gap-5">
          {cards.map((c) => (
            <MatchCard key={c.id} candidate={c} />
          ))}
        </div>
      )}

      <p className="text-nav text-grey-600">
        That&rsquo;s everyone for today. No deck to shuffle, nothing saved for
        later.
      </p>
    </div>
    </>
  );
}

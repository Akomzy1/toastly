import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { FeedFallbackNotice } from "@/components/app/feed-fallback-notice";
import { MatchCard } from "./match-card";
import { ProfileNotLive } from "@/components/app/profile-not-live";
import { canSendText, DAILY_MATCH_COUNT, type FeedCandidate } from "@/lib/feed";
import { requireLiveProfile } from "@/lib/live-profile";
import { type Profile, type Tier } from "@/lib/types/profile";

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
  // anyone else is read. The database refuses the feed regardless (0013);
  // this is so the member is told why rather than shown an empty six.
  const live = await requireLiveProfile(supabase);
  if (!live.live) return <ProfileNotLive status={live} />;

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

  // A member abroad who asked for diaspora matching without a Diaspora plan
  // is on back home because of the plan, not because their city is closed —
  // so they get the plan line from pool-choice, never the fallback notice
  // (which 0020 stops returning for them).
  const { data: me } = await supabase
    .from("profiles")
    .select("country_code, pool")
    .eq("id", user.id)
    .single();
  const planLine =
    me?.country_code !== "NG" &&
    (me?.pool === "diaspora" || me?.pool === "both") &&
    tier !== "diaspora" &&
    tier !== "diaspora_plus";

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

  // A candidate whose profile was hidden after today's six were built is no
  // longer readable (0013), and is dropped rather than shown as a blank card.
  const cards: FeedCandidate[] = (feed ?? []).flatMap(
    (f: { candidate_id: string }) => {
      const c = (candidates ?? []).find((x) => x.id === f.candidate_id);
      if (!c) return [];
      return {
        id: f.candidate_id,
        display_name: c.display_name,
        city: c.city ?? null,
        stage: c.stage as FeedCandidate["stage"],
        answers: (answers ?? [])
          .filter((a) => a.profile_id === f.candidate_id)
          .map((a) => ({
            id: a.id,
            prompt:
              (a.prompts as unknown as { text: string } | null)?.text ?? "Prompt",
            answer: a.answer,
          })),
        tags: visibleTags(c),
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

      {/* Built against design/prototype/feed-fallback-notice.slim.html. Says
          plainly which pool the six came from, and why, rather than leaving a
          diaspora member to wonder why everyone is in Lagos. */}
      {fallbackCity ? <FeedFallbackNotice city={String(fallbackCity)} /> : null}

      {/* The line and button from pool-choice.slim.html's free-plan state,
          reused here — the feed has no prototype for this case (flagged). */}
      {planLine ? (
        <div className="grid gap-3 rounded-[14px] border border-ink-900/[.12] bg-white px-3.5 py-[15px]">
          <p className="text-[14.5px] leading-[1.6] text-ink-800">
            Match with Nigerians in your city on a Diaspora plan, from $15 a
            month. Until then, your six are from back home.
          </p>
          <Link
            href="/pricing"
            className="grid min-h-12 place-items-center rounded-lg border border-ink-900/20 px-[18px] py-3 text-ui font-semibold text-ink-900 no-underline transition-colors hover:border-green-500 hover:bg-green-50 hover:text-ink-900"
          >
            See Diaspora plans
          </Link>
        </div>
      ) : null}

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
            <Link href="/preferences">Match preferences</Link>
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

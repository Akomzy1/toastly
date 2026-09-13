import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, FeatureCard } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import {
  HANDOFF_TRIGGER,
  MILESTONE_LABELS,
  type MilestoneKind,
} from "@/lib/couple";

export const metadata: Metadata = {
  title: "Couple Mode",
  robots: { index: false, follow: false },
};

/**
 * Couple Mode.
 *
 * NOT IN THE PROTOTYPE — flagged. The marketing pages describe it; there is
 * no in-app Couple Mode screen in the approved design.
 *
 * Note what this page does NOT do: it never reads a tier, and there is no
 * upgrade prompt anywhere on it. Couple Mode is free on every tier including
 * Starter, and a paywall here would be the exact error three prototype pages
 * made.
 */
export default async function CouplePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: couple } = await supabase
    .from("couples")
    .select("id, status, started_at, member_a, member_b")
    .in("status", ["proposed", "active"])
    .maybeSingle();

  const { data: milestones } = couple
    ? await supabase
        .from("couple_milestones")
        .select("id, kind, occurred_on, note")
        .eq("couple_id", couple.id)
        .order("occurred_on", { ascending: false })
    : { data: [] };

  const { data: brief } = couple
    ? await supabase
        .from("couple_briefs")
        .select("a_consented_at, b_consented_at")
        .eq("couple_id", couple.id)
        .maybeSingle()
    : { data: null };

  const engaged = (milestones ?? []).some(
    (m) => m.kind === HANDOFF_TRIGGER,
  );
  const bothConsented = Boolean(
    brief?.a_consented_at && brief?.b_consented_at,
  );

  if (!couple) {
    return (
      <div className="mx-auto grid max-w-[640px] gap-6 px-5 py-section-y">
        <div className="grid gap-2">
          <h1 className="text-h3 text-ink-900">Couple Mode</h1>
          <p className="text-ui text-grey-600">
            A shared, private space for two: milestones, saved dates and a
            timeline that lives somewhere other than a chat thread.
          </p>
        </div>

        {/* Free on every plan. Stated plainly, because the whole point is
            that nobody has to buy their way into it. */}
        <Notice tone="info" title="Free on every plan, including Starter">
          Couple Mode and the AriyaPlanner handoff aren&rsquo;t part of any
          subscription. They never have been and never will be.
        </Notice>

        <Card className="grid gap-3 p-[26px]">
          <h2 className="text-h5 text-ink-900">You&rsquo;re not in one yet</h2>
          <p className="text-ui text-grey-600">
            When you&rsquo;re both ready, either of you can propose it. Both
            profiles pause together — no quiet browsing on one side.
          </p>
          <Button variant="outline" asChild className="justify-self-start">
            <Link href="/inbox">Go to your messages</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-[640px] gap-6 px-5 py-section-y">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h3 text-ink-900">Couple Mode</h1>
        <Badge variant={couple.status === "active" ? "verified" : "optional"}>
          {couple.status === "active" ? "Active" : "Waiting on them"}
        </Badge>
      </div>

      {couple.status === "active" ? (
        <Notice tone="success">
          Both your profiles are paused. Leaving is one tap, from either side,
          and un-pauses you both.
        </Notice>
      ) : (
        <Notice tone="info">
          They haven&rsquo;t accepted yet. Nothing is shared and neither
          profile is paused until you both agree.
        </Notice>
      )}

      <Card className="grid gap-4 p-[26px]">
        <h2 className="text-h5 text-ink-900">Your timeline</h2>
        {!milestones?.length ? (
          <p className="text-ui text-grey-600">
            Nothing logged yet. Milestones are yours to add — a first date, the
            day it became official, meeting the families.
          </p>
        ) : (
          <ol className="grid list-none gap-3 p-0">
            {milestones.map((m) => (
              <li key={m.id} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="mt-2 h-2 w-2 flex-shrink-0 rounded-pill bg-gold-500"
                />
                <span className="grid gap-0.5">
                  <span className="text-ui font-semibold text-ink-900">
                    {MILESTONE_LABELS[m.kind as MilestoneKind]}
                  </span>
                  <span className="text-caption uppercase text-grey-400">
                    {new Date(m.occurred_on).toLocaleDateString()}
                  </span>
                  {m.note ? (
                    <span className="text-ui text-grey-600">{m.note}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {/* The handoff. Engagement is the trigger, but nothing moves without
          both people consenting — and nothing is transmitted at all yet. */}
      {engaged ? (
        <FeatureCard>
          <Badge variant="tier" className="justify-self-start">
            Engaged
          </Badge>
          <h2 className="text-h5 text-ink-900">Planning the wedding</h2>
          <p className="text-ui text-grey-600">
            AriyaPlanner can pick this up — introduction ceremony, traditional
            wedding, white wedding — using what you&rsquo;ve already told
            Toastly, so you don&rsquo;t start from a blank form.
          </p>
          {bothConsented ? (
            <Notice tone="info" title="You've both agreed to share your brief">
              Your details are ready to carry across. The handoff itself
              isn&rsquo;t switched on yet — nothing has been sent anywhere.
            </Notice>
          ) : (
            <Notice tone="locked" title="Both of you need to agree first">
              Nothing about you is shared with AriyaPlanner unless you both say
              so, and you&rsquo;ll see exactly what it covers before you do.
            </Notice>
          )}
        </FeatureCard>
      ) : null}
    </div>
  );
}

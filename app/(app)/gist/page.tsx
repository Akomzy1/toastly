import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import {
  canUseVideo,
  GIST_DEFAULT_MINUTES,
  voiceRemaining,
  type GistStatus,
} from "@/lib/gist";
import type { Tier } from "@/lib/types/profile";

export const metadata: Metadata = {
  title: "Gist sessions",
  robots: { index: false, follow: false },
};

const STATUS_LABEL: Record<GistStatus, string> = {
  proposed: "Invited",
  accepted: "Confirmed",
  live: "Live now",
  completed: "Done",
  declined: "Declined",
  cancelled: "Cancelled",
  expired: "Expired",
};

export default async function GistPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tierRow } = await supabase.rpc("current_tier", {
    p_profile_id: user.id,
  });
  const tier = (tierRow as Tier | null) ?? "starter";

  const { data: usedRow } = await supabase.rpc("voice_gists_this_month", {
    p_profile_id: user.id,
  });
  const used = (usedRow as number | null) ?? 0;
  const remaining = voiceRemaining(tier, used);

  const { data: sessions } = await supabase
    .from("gist_sessions")
    .select("id, medium, status, scheduled_for, proposer_id, invitee_id")
    .or(`proposer_id.eq.${user.id},invitee_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="mx-auto grid max-w-[640px] gap-6 px-5 py-section-y">
      <div className="grid gap-2">
        <h1 className="text-h3 text-ink-900">Gist sessions</h1>
        <p className="text-ui text-grey-600">
          A scheduled voice call with guided prompts — {GIST_DEFAULT_MINUTES}{" "}
          minutes by default, extendable once. Neither of you sees the
          other&rsquo;s number, ever.
        </p>
      </div>

      {/* Voice is the default and the free path — never framed as a downgrade
          from video. */}
      <Card className="grid gap-3 p-[26px]">
        <h2 className="text-h5 text-ink-900">This month</h2>
        {remaining === null ? (
          <p className="text-ui text-grey-600">
            Unlimited voice Gist sessions on your plan. {used} so far this
            month.
          </p>
        ) : (
          <p className="text-ui text-grey-600">
            <strong className="text-ink-900">
              {remaining} of 2 voice sessions left
            </strong>{" "}
            this month. They reset at the start of next month.
          </p>
        )}

        {canUseVideo(tier) ? (
          <Badge variant="tier" className="justify-self-start">
            Live video available
          </Badge>
        ) : (
          /* A paid feature, stated plainly — not an error, and not a nag. */
          <Notice tone="locked">
            Live video Gist is part of Premium Plus. Voice is the default here
            either way — it&rsquo;s the point of a Gist, not a lesser version
            of one.
          </Notice>
        )}
      </Card>

      {!sessions?.length ? (
        <Card className="grid gap-3 p-[26px]">
          <h2 className="text-h5 text-ink-900">No sessions yet</h2>
          <p className="text-ui text-grey-600">
            Reply to something on today&rsquo;s feed to propose your first one.
          </p>
          <Button variant="outline" asChild className="justify-self-start">
            <Link href="/feed">Today&rsquo;s matches</Link>
          </Button>
        </Card>
      ) : (
        <ul className="grid list-none gap-4 p-0">
          {sessions.map((s) => (
            <li key={s.id}>
              <Card className="flex flex-wrap items-center justify-between gap-4 p-[26px]">
                <div className="grid gap-1.5">
                  <span className="flex items-center gap-2">
                    <Badge variant={s.medium === "video" ? "tier" : "verified"}>
                      {s.medium === "video" ? "Live video" : "Voice"}
                    </Badge>
                    <span className="text-caption uppercase text-grey-600">
                      {STATUS_LABEL[s.status as GistStatus]}
                    </span>
                  </span>
                  <p className="text-ui text-ink-900">
                    {s.scheduled_for
                      ? new Date(s.scheduled_for).toLocaleString()
                      : "Not scheduled yet"}
                  </p>
                </div>
                <Button variant="outline" asChild>
                  <Link href={`/gist/${s.id}`}>Open</Link>
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

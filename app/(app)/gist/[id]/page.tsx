import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { SafetyActions } from "@/components/safety/safety-actions";
import { ReadyForm } from "./ready-form";
import { OutcomeForm } from "./outcome-form";
import {
  canUseVideo,
  GIST_DEFAULT_MINUTES,
  GIST_EXTENSION_MINUTES,
  isJoinable,
  type GistStatus,
} from "@/lib/gist";
import { isLiveKitConfigured } from "@/lib/livekit";
import type { Tier } from "@/lib/types/profile";

export const metadata: Metadata = {
  title: "Gist session",
  robots: { index: false, follow: false },
};

export default async function GistSessionPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: session } = await supabase
    .from("gist_sessions")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!session) notFound();

  const { data: tierRow } = await supabase.rpc("current_tier", {
    p_profile_id: user.id,
  });
  const tier = (tierRow as Tier | null) ?? "starter";

  const { data: questions } = await supabase
    .from("gist_questions")
    .select("id, text, depth")
    .order("sort_order");

  const isProposer = session.proposer_id === user.id;
  const youReady = isProposer
    ? Boolean(session.proposer_ready_at)
    : Boolean(session.invitee_ready_at);
  const theyReady = isProposer
    ? Boolean(session.invitee_ready_at)
    : Boolean(session.proposer_ready_at);
  const joinable = isJoinable(session);

  // The other participant, for the report and block action below.
  const otherId: string = isProposer ? session.invitee_id : session.proposer_id;
  const { data: other } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", otherId)
    .maybeSingle();
  const otherName = other?.display_name ?? "this member";

  // Video is only ever offered when the entitlement allows it AND the session
  // was proposed as video. The token itself withholds camera publish rights
  // otherwise, so this is presentation on top of a real control.
  const videoAllowed = session.medium === "video" && canUseVideo(tier);

  return (
    <div className="mx-auto grid max-w-[640px] gap-6 px-5 py-section-y">
      <div className="grid gap-2">
        <Link href="/gist" className="text-nav text-green-500">
          ← All sessions
        </Link>
        <h1 className="text-h3 text-ink-900">
          {session.medium === "video" ? "Live video Gist" : "Voice Gist"}
        </h1>
        <p className="text-ui text-grey-600">
          {GIST_DEFAULT_MINUTES} minutes, extendable once by{" "}
          {GIST_EXTENSION_MINUTES}. Nobody sees anybody&rsquo;s phone number —
          the call runs inside Toastly.
        </p>
      </div>

      {/* Mutual opt-in. Nothing touches a microphone or camera until both
          sides have said yes — the token is not issued before that. */}
      {!joinable ? (
        <Card className="grid gap-4 p-[26px]">
          <h2 className="text-h5 text-ink-900">Before anything turns on</h2>
          <p className="text-ui text-grey-600">
            Your microphone stays off until you both opt in. Nothing is
            recorded, and either of you can leave at any point.
          </p>
          <ul className="grid list-none gap-2 p-0 text-ui">
            <li className="flex items-center gap-2.5">
              <Badge variant={youReady ? "verified" : "optional"}>
                {youReady ? "You're ready" : "Waiting on you"}
              </Badge>
            </li>
            <li className="flex items-center gap-2.5">
              <Badge variant={theyReady ? "verified" : "optional"}>
                {theyReady ? "They're ready" : "Waiting on them"}
              </Badge>
            </li>
          </ul>
          {!youReady ? <ReadyForm sessionId={session.id} /> : null}
        </Card>
      ) : (
        <Card className="grid gap-4 p-[26px]">
          <h2 className="text-h5 text-ink-900">Ready to join</h2>
          {!isLiveKitConfigured() ? (
            /* Honest about what isn't wired, rather than a dead button. */
            <Notice tone="locked" title="Calling isn't connected yet">
              LiveKit credentials aren&rsquo;t set in this environment, so the
              call can&rsquo;t start. The session, the deck and the entitlement
              rules all work — only the media transport is missing.
            </Notice>
          ) : (
            <Button className="justify-self-start">Join session</Button>
          )}
          <p className="text-nav text-grey-600">
            {videoAllowed
              ? "If the connection weakens, video drops to audio rather than freezing."
              : "This is a voice session. Your camera will not be requested."}
          </p>
        </Card>
      )}

      {/* The shared deck: both people see the same question at the same time,
          walking from playful to real. */}
      <Card className="grid gap-4 p-[26px]">
        <div className="grid gap-1.5">
          <h2 className="text-h5 text-ink-900">Your question deck</h2>
          <p className="text-ui text-grey-600">
            Shared, and in this order. Nobody has to open with &ldquo;hi how
            are you&rdquo;.
          </p>
        </div>
        <ol className="grid list-none gap-3 p-0">
          {(questions ?? []).map((q, i) => (
            <li key={q.id} className="flex gap-3">
              <span className="font-serif text-ui text-green-500">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="grid gap-1">
                <span className="text-ui text-ink-900">{q.text}</span>
                <span className="text-caption uppercase text-grey-400">
                  {q.depth === 1 ? "Warm-up" : q.depth === 2 ? "Going deeper" : "Real"}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </Card>

      {/* Private double opt-in, only once the session has run. */}
      {(session.status as GistStatus) === "live" ||
      (session.status as GistStatus) === "completed" ? (
        <OutcomeForm sessionId={session.id} />
      ) : null}

      {/* Safety & Trust promises "every screen has a report action, including
          inside a Gist session". Until now this screen had none. Never behind
          a plan: a voice Gist is a Starter member's only conversation channel,
          so this is exactly where a free member most needs it. */}
      <SafetyActions memberId={otherId} name={otherName} />
    </div>
  );
}

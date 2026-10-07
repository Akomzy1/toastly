import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMemberProfile } from "@/lib/member-profile";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { SafetyActions } from "@/components/safety/safety-actions";
import { GenotypeChip } from "@/components/genotype/genotype-chip";
import { getVisibleGenotype } from "@/components/genotype/genotype-data";
import { OutcomeForm } from "./outcome-form";
import { SpotSuggestions, type Spot } from "./spot-suggestions";
import { GistCall } from "@/components/gist/gist-call";
import { ScreenBand } from "@/components/app/screen-band";
import {
  AfterAccepting,
  AutoRefresh,
  ReceivedView,
  SenderOutcome,
  StartPanel,
  TimePending,
} from "@/components/gist/invite-views";
import { loadInvite } from "@/lib/gist-invites";
import { canSendText } from "@/lib/feed";
import { localDay, localTime12 } from "@/lib/scheduling";
import { placesConfigured } from "@/lib/places";
import {
  canUseVideo,
  GIST_DEFAULT_MINUTES,
  GIST_EXTENSION_MINUTES,
  type GistStatus,
} from "@/lib/gist";
import { isLiveKitConfigured } from "@/lib/livekit";
import type { Tier } from "@/lib/types/profile";
import { requireLiveProfile } from "@/lib/live-profile";
import { ProfileNotLive } from "@/components/app/profile-not-live";

export const metadata: Metadata = {
  title: "Gist session",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * One Gist, from invite to call. Routes by state:
 *   proposed            invitee: received (6) · sender: waiting (8)
 *   declined / expired  sender: outcome (8) · invitee: passed
 *   accepted            invitee: after accepting (7) · sender: said yes (8),
 *                       then picking a time, then Start now
 *   both started, live  the call, the deck, "continue?"
 * Report and block sit under every state.
 */
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

  // No live profile, no access (PRD §5.1.2): checked before anything about
  // anyone else is read. The database refuses regardless (0029); this says why.
  const live = await requireLiveProfile(supabase);
  if (!live.live) return <ProfileNotLive status={live} />;

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
    .order("sort_order")
    .order("id");

  const isProposer = session.proposer_id === user.id;
  const youReady = isProposer
    ? Boolean(session.proposer_ready_at)
    : Boolean(session.invitee_ready_at);
  const theyReady = isProposer
    ? Boolean(session.invitee_ready_at)
    : Boolean(session.proposer_ready_at);
  const bothReady = youReady && theyReady;

  // The other participant, for the report and block action below.
  const otherId: string = isProposer ? session.invitee_id : session.proposer_id;
  // Only through profile_for (0033); null when the profile can't be opened.
  const other = await getMemberProfile(supabase, otherId);
  const otherName = other?.display_name ?? "this member";

  // Null unless both have chosen to share with each other (0014).
  const otherGenotype = await getVisibleGenotype(otherId);

  // Date spots exist only after both people privately said continue — the
  // database refuses to store one before that (0011), and this page shows
  // nothing at all until then.
  const { data: mutual } = await supabase.rpc("gist_mutual_continue", {
    p_session_id: params.id,
  });

  const { data: spots } = mutual
    ? await supabase
        .from("date_spots")
        .select("id, name, address, category, anchor, status")
        .eq("session_id", params.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  // Prompt 17: the date proposal behind an accepted spot — the member's
  // stakeable balance, the limits, and any date already open from this Gist.
  const booking = mutual
    ? await Promise.all([
        supabase.rpc("purchased_balance", { p_profile_id: user.id }),
        supabase.from("coin_config").select("stake_min, stake_max, cancel_cutoff_hours").maybeSingle(),
        supabase
          .from("date_commitments")
          .select("id, status")
          .eq("session_id", params.id)
          .in("status", ["pending", "confirmed", "provisional_no_show", "under_review"])
          .maybeSingle(),
      ]).then(([bal, cfg, open]) =>
        cfg.data
          ? {
              stakeable: Math.max(0, (bal.data as number | null) ?? 0),
              stakeMin: cfg.data.stake_min,
              stakeMax: cfg.data.stake_max,
              cutoffHours: cfg.data.cancel_cutoff_hours,
              openDate: open.data ?? null,
            }
          : undefined,
      )
    : undefined;

  // --- The invite states ---------------------------------------------------
  const ctx = await loadInvite(supabase, params.id, user.id);
  if (!ctx) notFound();
  const starter = !canSendText(tier);
  const status = ctx.effectiveStatus;
  // Their full profile, when the access rule allows it (0032) — always for an
  // invitation received, on every plan, before accepting.
  const canOpen = other !== null;
  const safety = (
    <div className="mx-auto grid w-full max-w-[680px] gap-3 px-3.5 pb-8">
      {canOpen === true ? (
        <Link href={`/members/${otherId}`} className="inline-flex min-h-11 items-center justify-self-start text-nav font-semibold text-green-500">
          See {otherName.split(" ")[0]}&rsquo;s full profile
        </Link>
      ) : null}
      <SafetyActions memberId={otherId} name={otherName} />
    </div>
  );
  const zone = (z: string | null) => z ?? "Africa/Lagos";
  const crossZone = zone(ctx.me.zone) !== zone(ctx.other.zone);
  const at12 = (iso: string, z: string | null) => {
    const d = new Date(iso);
    return `${localDay(d, zone(z))} · ${localTime12(d, zone(z))}`;
  };

  if (status === "proposed" || status === "declined" || status === "expired") {
    return (
      <>
        {ctx.iAmProposer ? (
          <SenderOutcome
            sessionId={ctx.id}
            name={ctx.other.name}
            answer={ctx.answer}
            kind={status === "proposed" ? "waiting" : status}
            starter={starter}
            online={false}
          />
        ) : (
          <ReceivedView
            sessionId={ctx.id}
            name={ctx.other.name}
            city={ctx.other.city}
            answer={ctx.answer}
            starter={starter}
            passed={status === "declined" ? "declined" : status === "expired" ? "closed" : null}
          />
        )}
        {status === "proposed" ? <AutoRefresh every={20_000} /> : null}
        {safety}
      </>
    );
  }

  if (status === "accepted" && !bothReady) {
    const { data: online } = await supabase.rpc("gist_partner_online", { p_session_id: params.id });
    const confirmed = ctx.timeConfirmed && ctx.scheduledFor;
    if (ctx.scheduledFor && ctx.timeProposedByMe !== null && !ctx.timeConfirmed) {
      return (
        <>
          <TimePending
            sessionId={ctx.id}
            name={ctx.other.name}
            pickedByMe={ctx.timeProposedByMe}
            mine={at12(ctx.scheduledFor, ctx.me.zone)}
            theirs={at12(ctx.scheduledFor, ctx.other.zone)}
            crossZone={crossZone}
          />
          <AutoRefresh />
          {safety}
        </>
      );
    }
    if (!confirmed && !youReady) {
      const now = new Date();
      return (
        <>
          {ctx.iAmProposer ? (
            <SenderOutcome
              sessionId={ctx.id}
              name={ctx.other.name}
              answer={ctx.answer}
              kind="accepted"
              starter={starter}
              online={online === true}
            />
          ) : (
            <AfterAccepting
              sessionId={ctx.id}
              name={ctx.other.name}
              city={ctx.other.city}
              myName={ctx.me.name}
              online={online === true}
              crossZone={crossZone}
              nowMine={localTime12(now, zone(ctx.me.zone))}
              nowTheirs={localTime12(now, zone(ctx.other.zone))}
              myCity={ctx.me.city}
              zoneLine={
                crossZone
                  ? `${ctx.other.first} is in ${ctx.other.city ?? "another time zone"}. Every time you see will show on both clocks.`
                  : "You're in the same time zone, so one clock is all you need."
              }
            />
          )}
          <AutoRefresh />
          {safety}
        </>
      );
    }
  }

  // Live video transport is Phase 2 (P2-D). A session proposed as video by an
  // entitled member runs as voice for now, and the page says so.
  const videoPending = session.medium === "video" && canUseVideo(tier);

  return (
    <>
    <ScreenBand title="Voice Gist" sub={`with ${otherName.split(" ")[0]}`} back="/gist" />
    <div className="mx-auto grid max-w-[640px] gap-6 px-5 pb-section-y pt-5 lg:pt-4">
      <div className="grid gap-2">
        <p className="text-ui text-grey-600">
          {GIST_DEFAULT_MINUTES} minutes, extendable once by{" "}
          {GIST_EXTENSION_MINUTES}. Nobody sees anybody&rsquo;s phone number —
          the call runs inside Toastly.
        </p>
        {/* genotype-display.slim.html: one quiet fact chip, or nothing
            at all — never a "hidden" label or a placeholder. */}
        {otherGenotype ? (
          <div className="flex flex-wrap gap-2">
            <GenotypeChip value={otherGenotype} ground="paper" />
          </div>
        ) : null}
      </div>

      {/* Mutual opt-in: the call opens only once BOTH have tapped Start now
          — no token, and no microphone, before that. */}
      {!bothReady ? (
        <Card className="grid gap-4 p-[26px]">
          <StartPanel
            sessionId={session.id}
            name={otherName}
            when={ctx.timeConfirmed && ctx.scheduledFor ? at12(ctx.scheduledFor, ctx.me.zone) : null}
            youReady={youReady}
          />
          <AutoRefresh />
        </Card>
      ) : (
        <Card className="grid gap-4 p-[26px]">
          {videoPending ? (
            <Notice tone="info">
              Live video isn&rsquo;t switched on yet, so this Gist runs as a
              voice call.
            </Notice>
          ) : null}
          {!isLiveKitConfigured() ? (
            /* Honest about what isn't wired, rather than a dead button. */
            <Notice tone="locked" title="Calling isn't connected yet">
              LiveKit credentials aren&rsquo;t set in this environment, so the
              call can&rsquo;t start.
            </Notice>
          ) : (
            <GistCall sessionId={session.id} otherName={otherName} questions={(questions ?? []) as { id: number; text: string; depth: number }[]} />
          )}
        </Card>
      )}

      {/* The question deck now lives inside the call, one card at a time,
          the same on both screens (components/gist/gist-call.tsx, 0022). */}

      {/* Private double opt-in, only once the session has run. */}
      {(session.status as GistStatus) === "live" ||
      (session.status as GistStatus) === "completed" ? (
        <OutcomeForm sessionId={session.id} />
      ) : null}

      <SpotSuggestions
        sessionId={session.id}
        spots={(spots ?? []) as Spot[]}
        mutual={Boolean(mutual)}
        configured={placesConfigured()}
        matchFirst={otherName.split(" ")[0]}
        booking={booking}
      />

      {/* Safety & Trust promises "every screen has a report action, including
          inside a Gist session". Until now this screen had none. Never behind
          a plan: a voice Gist is a Starter member's only conversation channel,
          so this is exactly where a free member most needs it. */}
      <SafetyActions memberId={otherId} name={otherName} />
    </div>
    </>
  );
}

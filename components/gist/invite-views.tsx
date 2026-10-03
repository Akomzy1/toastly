"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { confirmTime, respondToInvite, startNow } from "@/app/(app)/gist/actions";
import { Notice } from "@/components/ui/notice";
import { AMBER, AnswerQuote, AnswerStrip, Band, CARD, ClockIcon, Monogram, NOTE, OUTLINE, OUTLINE_WHITE } from "./invite-parts";

/**
 * The gist-invite screens that act: received (6), after accepting (7), what
 * the sender sees (8), plus two states the prototypes don't draw — confirming
 * a picked time, and waiting for the other person after "Start now" —
 * flagged as invented, built from the same cards.
 */

type Answer = { prompt: string; answer: string; mine: boolean } | null;

export function AutoRefresh({ every = 12_000 }: { every?: number }) {
  const router = useRouter();
  React.useEffect(() => {
    const t = window.setInterval(() => router.refresh(), every);
    return () => window.clearInterval(t);
  }, [router, every]);
  return null;
}

function Seal() {
  return (
    <span aria-hidden="true" className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-pill bg-green-800">
      <svg width="24" height="24" viewBox="-1.5 -1.5 27 27" fill="none">
        <path
          d="M12 2.5 14.1 4l2.5-.5.9 2.4 2.2 1.3-.6 2.5 1.5 2.1-1.5 2.1.6 2.5-2.2 1.3-.9 2.4-2.5-.5L12 21.5 9.9 20l-2.5.5-.9-2.4-2.2-1.3.6-2.5L3.4 12l1.5-2.1-.6-2.5 2.2-1.3.9-2.4 2.5.5z"
          stroke="#FFB300"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path d="m8.6 12.2 2.3 2.3 4.5-4.8" stroke="#FFB300" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function Online({ first }: { first: string }) {
  return (
    <p className="m-0 inline-flex items-center justify-center gap-[7px] text-[13px] font-semibold text-success">
      <span aria-hidden="true" className="h-2 w-2 rounded-pill bg-success" />
      {first} is online now
    </p>
  );
}

function useAct() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  async function act(fn: () => Promise<{ error?: string; ok?: string } | null>, after?: () => void) {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (r?.error) setError(r.error);
    else {
      after?.();
      router.refresh();
    }
  }
  return { busy, error, act };
}

// --- 6. Receiving an invite ------------------------------------------------

export function ReceivedView({
  sessionId,
  name,
  city,
  answer,
  starter,
  passed,
}: {
  sessionId: string;
  name: string;
  city: string | null;
  answer: Answer;
  starter: boolean;
  /** Declined by you, or closed. */
  passed: "declined" | "closed" | null;
}) {
  const first = name.split(" ")[0];
  const { busy, error, act } = useAct();
  return (
    <div className="mx-auto grid w-full max-w-[680px]">
      <Band title="Gist invite" sub={`from ${first}`} back="/gist" />
      <div className="grid content-start gap-5 px-3.5 pb-6 pt-5">
        <div className={CARD}>
          <div className="flex items-center gap-3.5">
            <Monogram name={name} size={72} />
            <div className="grid min-w-0 gap-[3px]">
              <p className="m-0 font-serif text-[20px] font-bold leading-[1.2] text-ink-900">{name}</p>
              {city ? <p className="m-0 text-[13px] text-grey-400">{city}</p> : null}
            </div>
          </div>
          <div className="flex items-center gap-2.5 border-t border-ink-900/[.08] pt-3">
            <Seal />
            <span className="grid min-w-0 gap-px">
              <span className="text-nav font-semibold text-ink-900">Verified Real</span>
              {/* "Photos match their selfie" waits for the photo match
                  (Prompt 14, parked) — decision of 3 October 2026. */}
              <span className="text-[13px] leading-[1.4] text-grey-600">Passed a live selfie check</span>
            </span>
          </div>
        </div>

        {passed ? (
          <div role="status" className="grid gap-4">
            <div className="grid gap-2 px-0.5">
              <h2 className="m-0 font-serif text-[22px] font-bold leading-[1.25] text-ink-900 [text-wrap:balance]">
                {passed === "declined" ? "You've passed on this one." : "This invite has closed."}
              </h2>
              <p className="m-0 text-ui leading-[1.6] text-ink-800">
                {passed === "declined"
                  ? `We'll let ${first} know, without a reason. Nothing else changes.`
                  : "Invites close after three days. Nothing else changes."}
              </p>
            </div>
            <Link href="/gist" className={OUTLINE}>
              Back to your Gists
            </Link>
          </div>
        ) : (
          <div className="grid gap-5">
            <div className="grid gap-2.5">
              <h2 className="m-0 px-0.5 font-serif text-[22px] font-bold leading-[1.25] text-ink-900 [text-wrap:balance]">
                {first} wants to Gist about your answer
              </h2>
              {answer ? (
                <div className={CARD}>
                  <AnswerQuote label="Your answer" prompt={answer.prompt} answer={answer.answer} />
                </div>
              ) : null}
            </div>
            <div className="flex items-start gap-2.5 rounded-lg border border-champagne/90 bg-gold-50 px-3 py-[13px]">
              <span className="mt-px flex-shrink-0">
                <ClockIcon color="#CC8F00" />
              </span>
              <p className="m-0 text-nav leading-[1.55] text-gold-800">
                <strong className="font-semibold">18 minutes, voice only,</strong> with a shared deck of questions to get you
                both talking.
              </p>
            </div>
            {error ? <Notice tone="error">{error}</Notice> : null}
            <div className="grid gap-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <button type="button" disabled={busy} onClick={() => act(() => respondToInvite(sessionId, false))} className={OUTLINE_WHITE}>
                  Decline
                </button>
                <button type="button" disabled={busy} onClick={() => act(() => respondToInvite(sessionId, true))} className={OUTLINE_WHITE}>
                  Accept
                </button>
              </div>
              {/* A Gist counts when it connects, for both people (decision of
                  3 October 2026), so "It's free to accept" is only the whole
                  truth on a paid plan. */}
              <p className="m-0 text-center text-[13px] leading-normal text-grey-600">
                {starter
                  ? "It's free to accept. If the call happens, it counts as one of your 2 Gists this month."
                  : "It's free to accept."}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- 8. What the sender sees -------------------------------------------------

export function SenderOutcome({
  sessionId,
  name,
  answer,
  kind,
  starter,
  online,
}: {
  sessionId: string;
  name: string;
  answer: Answer;
  kind: "waiting" | "accepted" | "declined" | "expired";
  starter: boolean;
  online: boolean;
}) {
  const first = name.split(" ")[0];
  const { busy, error, act } = useAct();
  const unused = starter ? "Your Gist wasn't used." : "";
  const copy = {
    waiting: { headline: `Waiting on ${first}.`, body: "We'll let you know when they reply. Invites close after three days." },
    accepted: { headline: `${first} said yes to a Gist.`, body: "Start now, or pick a time that suits you both." },
    declined: { headline: `${first} has passed on this one.`, body: unused },
    expired: { headline: "This invite has closed.", body: unused },
  }[kind];

  return (
    <div className="mx-auto grid w-full max-w-[680px]">
      <Band title="Your Gist invite" sub={`to ${first}`} back="/gist" />
      <div className="grid content-start gap-6 px-3.5 pb-6 pt-7">
        <div role="status" className="grid justify-items-center gap-3 px-1.5 text-center">
          <Monogram name={name} size={80} />
          <h2 className="m-0 mt-1.5 font-serif text-[24px] font-bold leading-[1.2] text-ink-900 [text-wrap:balance]">{copy.headline}</h2>
          {copy.body ? <p className="m-0 text-ui leading-[1.6] text-ink-800">{copy.body}</p> : null}
        </div>

        {answer ? (
          <div className="grid gap-[3px] rounded-[14px] border border-ink-900/[.12] bg-white px-[13px] py-3">
            <AnswerStrip whose={answer.mine ? "Your answer" : `${first}'s answer`} prompt={answer.prompt} answer={answer.answer} />
          </div>
        ) : null}

        {error ? <Notice tone="error">{error}</Notice> : null}

        {kind === "accepted" ? (
          <div className="grid gap-2.5">
            {online ? <Online first={first} /> : null}
            {online ? (
              <button type="button" disabled={busy} onClick={() => act(() => startNow(sessionId))} className={AMBER}>
                Gist now
              </button>
            ) : null}
            <Link href={`/gist/${sessionId}/schedule`} className={online ? OUTLINE : AMBER}>
              Pick a time
            </Link>
          </div>
        ) : (
          <div className="grid gap-2.5">
            <Link href="/feed" className={AMBER}>
              Back to today&rsquo;s six
            </Link>
            <Link href="/gist" className={OUTLINE}>
              See your Gists
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

// --- 7. After accepting --------------------------------------------------------

export function AfterAccepting({
  sessionId,
  name,
  city,
  myName,
  online,
  crossZone,
  nowMine,
  nowTheirs,
  myCity,
  zoneLine,
}: {
  sessionId: string;
  name: string;
  city: string | null;
  myName: string;
  online: boolean;
  crossZone: boolean;
  nowMine: string | null;
  nowTheirs: string | null;
  myCity: string | null;
  zoneLine: string;
}) {
  const first = name.split(" ")[0];
  const [schedule, setSchedule] = React.useState(!online);
  const { busy, error, act } = useAct();
  return (
    <div className="mx-auto grid w-full max-w-[680px]">
      <Band title={`Gist with ${first}`} sub={city ?? undefined} back="/gist" />
      <div className="grid content-start gap-[22px] px-3.5 pb-6 pt-7">
        {!schedule ? (
          <div className="grid gap-[22px]">
            <div className="grid justify-items-center gap-3.5 px-1.5 text-center">
              <span className="flex items-center">
                <span className="rounded-pill border-[3px] border-paper">
                  <Monogram name={myName} size={58} />
                </span>
                <span className="-ml-3.5 rounded-pill border-[3px] border-paper">
                  <Monogram name={name} size={58} />
                </span>
              </span>
              <Online first={first} />
              <h2 className="m-0 font-serif text-[24px] font-bold leading-[1.2] text-ink-900 [text-wrap:balance]">
                You&rsquo;re both here — Gist now?
              </h2>
              <p className="m-0 text-ui leading-[1.6] text-ink-800">18 minutes, voice only. The questions open once you&rsquo;ve both joined.</p>
            </div>
            {error ? <Notice tone="error">{error}</Notice> : null}
            <div className="grid gap-2.5">
              <button type="button" disabled={busy} onClick={() => act(() => startNow(sessionId))} className={AMBER}>
                Start now
              </button>
              <button type="button" onClick={() => setSchedule(true)} className={OUTLINE}>
                Pick a time instead
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-[22px]">
            <div className="grid gap-2 px-0.5">
              <p className="m-0 font-sans text-chip font-semibold uppercase tracking-[0.12em] text-green-500">You said yes</p>
              <h2 className="m-0 font-serif text-[24px] font-bold leading-[1.2] text-ink-900 [text-wrap:balance]">
                Next, pick a time with {first}.
              </h2>
              <p className="m-0 text-ui leading-[1.6] text-ink-800">{zoneLine}</p>
            </div>
            {crossZone && nowMine && nowTheirs ? (
              <div className="grid gap-[11px] rounded-[14px] border border-ink-900/[.12] bg-white px-[13px] py-3.5">
                <span className="text-[12.5px] font-semibold text-grey-600">Right now</span>
                <span className="grid grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] items-stretch gap-3">
                  <span className="grid min-w-0 gap-[3px]">
                    <span className="text-chip font-semibold uppercase tracking-[0.08em] text-grey-400">You{myCity ? ` · ${myCity}` : ""}</span>
                    <span className="font-serif text-[22px] font-bold tabular-nums text-ink-900">{nowMine}</span>
                  </span>
                  <span className="bg-ink-900/10" />
                  <span className="grid min-w-0 gap-[3px]">
                    <span className="text-chip font-semibold uppercase tracking-[0.08em] text-grey-400">
                      {first}
                      {city ? ` · ${city}` : ""}
                    </span>
                    <span className="font-serif text-[22px] font-bold tabular-nums text-ink-900">{nowTheirs}</span>
                  </span>
                </span>
              </div>
            ) : null}
            <div className="grid gap-2.5">
              <Link href={`/gist/${sessionId}/schedule`} className={AMBER}>
                {crossZone ? "Pick a time on both clocks" : "Pick a time"}
              </Link>
              <p className="m-0 text-center text-[13px] leading-[1.55] text-grey-600">{first} confirms the time before anything is set.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Not in the prototypes: confirming a picked time; waiting after Start now -

export function TimePending({
  sessionId,
  name,
  pickedByMe,
  mine,
  theirs,
  crossZone,
}: {
  sessionId: string;
  name: string;
  pickedByMe: boolean;
  mine: string;
  theirs: string;
  crossZone: boolean;
}) {
  const first = name.split(" ")[0];
  const { busy, error, act } = useAct();
  return (
    <div className="mx-auto grid w-full max-w-[680px]">
      <Band title={`Gist with ${first}`} sub="Picking a time" back="/gist" />
      <div className="grid content-start gap-5 px-3.5 pb-6 pt-7">
        <div className="grid gap-2 px-0.5">
          <h2 className="m-0 font-serif text-[24px] font-bold leading-[1.2] text-ink-900 [text-wrap:balance]">
            {pickedByMe ? `Waiting on ${first} to confirm.` : `${first} picked a time.`}
          </h2>
          <p className="m-0 text-ui leading-[1.6] text-ink-800">
            {pickedByMe ? "Nothing is set until they confirm." : "Confirm it, or pick another time that suits you better."}
          </p>
        </div>
        <div className="grid gap-[3px] rounded-[14px] border border-ink-900/[.12] bg-white px-[13px] py-3.5">
          <span className="text-[12.5px] font-semibold text-grey-600">You</span>
          <span className="font-serif text-[22px] font-bold tabular-nums text-ink-900">{mine}</span>
          {crossZone ? <span className="text-nav text-grey-600">{theirs} for {first}</span> : null}
        </div>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <div className="grid gap-2.5">
          {!pickedByMe ? (
            <button type="button" disabled={busy} onClick={() => act(() => confirmTime(sessionId))} className={AMBER}>
              Confirm this time
            </button>
          ) : null}
          <Link href={`/gist/${sessionId}/schedule`} className={OUTLINE}>
            Pick another time
          </Link>
        </div>
      </div>
    </div>
  );
}

export function StartPanel({
  sessionId,
  name,
  when,
  youReady,
}: {
  sessionId: string;
  name: string;
  /** Set when a time is confirmed. */
  when: string | null;
  youReady: boolean;
}) {
  const first = name.split(" ")[0];
  const { busy, error, act } = useAct();
  return (
    <div className="grid gap-3">
      <h2 className="text-h5 text-ink-900">{youReady ? `Waiting for ${first} to start` : when ? `Booked for ${when}` : "Ready when you are"}</h2>
      <p className={NOTE}>
        {youReady
          ? "The call opens as soon as they tap Start now. You can leave this page; it will be here."
          : "Tap Start now when you're both ready. Your microphone stays off until you both have."}
      </p>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {!youReady ? (
        <button type="button" disabled={busy} onClick={() => act(() => startNow(sessionId))} className={AMBER}>
          Start now
        </button>
      ) : null}
    </div>
  );
}

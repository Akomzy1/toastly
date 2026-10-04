"use client";

import * as React from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import {
  cancelDate,
  checkIn,
  contestDate,
  declineDate,
  requestReschedule,
  stakeDate,
  type DateState,
} from "@/app/(app)/dates/actions";
import { Notice } from "@/components/ui/notice";

/**
 * A date, in every state (PRD §5.5; 0023).
 *
 * NOT IN A PROTOTYPE — flagged (Prompt 17). Built from the in-app cards and
 * buttons until the coins and attendance design is exported.
 *
 * Copy is warm by rule (CLAUDE.md): showing up for each other, never
 * "forfeit", "penalty" or "fine"; never "wallet", "escrow", "transfer" or
 * "cash out".
 */

export type DateViewProps = {
  id: string;
  status: string;
  stake: number;
  stakeable: number;
  venue: string;
  address: string;
  when: string;
  otherFirst: string;
  sessionId: string | null;
  iProposed: boolean;
  iStaked: boolean;
  iCheckedIn: boolean;
  theyCheckedIn: boolean;
  iAskedMove: boolean;
  theyAskedMove: boolean;
  iWasAbsent: boolean;
  contestBy: string | null;
  cancelReason: string | null;
  cancelledByMe: boolean;
  beforeCutoff: boolean;
  cutoffHours: number;
  windowOpen: boolean;
  windowLabel: string;
  radius: number;
};

const CARD = "grid gap-3 rounded-xl border border-ink-900/[.12] bg-white px-[15px] py-4";
const CAPS = "m-0 font-sans text-chip font-semibold uppercase tracking-[0.12em] text-green-500";
const BODY = "m-0 text-ui leading-[1.6] text-ink-800";
const SMALL = "m-0 text-nav leading-[1.55] text-grey-600";
const PRIMARY =
  "min-h-12 w-full rounded-lg bg-gold-500 px-5 py-3.5 text-button text-green-800 transition-colors duration-200 hover:bg-gold-300 disabled:bg-grey-200 disabled:text-grey-600";
const OUTLINE =
  "min-h-12 w-full rounded-lg border border-ink-900/[.18] bg-white px-5 py-3.5 text-button text-ink-900 transition-colors duration-200 hover:border-ink-900/40 disabled:text-grey-400";
const QUIET = "min-h-11 w-full border-0 bg-transparent p-2.5 text-nav font-medium text-grey-600 hover:text-ink-900";

function Result({ state }: { state: DateState }) {
  if (state?.error) return <Notice tone="error">{state.error}</Notice>;
  if (state?.ok) return <Notice tone="success">{state.ok}</Notice>;
  return null;
}

function Btn({ label, busy, className, name, value }: { label: string; busy: string; className: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className} name={name} value={value}>
      {pending ? busy : label}
    </button>
  );
}

/** One action, one form, its own result line. */
function Act({
  id,
  action,
  label,
  busy,
  className = PRIMARY,
  extra,
}: {
  id: string;
  action: (s: DateState, f: FormData) => Promise<DateState>;
  label: string;
  busy: string;
  className?: string;
  extra?: Record<string, string>;
}) {
  const [state, run] = useFormState(action, null);
  return (
    <form action={run} className="grid gap-2">
      <input type="hidden" name="date_id" value={id} />
      {Object.entries(extra ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Result state={state} />
      <Btn label={label} busy={busy} className={className} />
    </form>
  );
}

/**
 * "I'm here." The consent line is on screen before the browser asks for
 * location; the position is sent once, checked against the venue, and only
 * the check-in time is kept.
 */
function CheckIn({ id, venue, radius }: { id: string; venue: string; radius: number }) {
  const [state, run] = useFormState(checkIn, null);
  const form = React.useRef<HTMLFormElement>(null);
  const lat = React.useRef<HTMLInputElement>(null);
  const lng = React.useRef<HTMLInputElement>(null);
  const [locating, setLocating] = React.useState(false);
  const [locError, setLocError] = React.useState<string | null>(null);

  function locate() {
    setLocError(null);
    if (!("geolocation" in navigator)) {
      setLocError("This browser can't share a location, so check-in won't work here.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        if (lat.current && lng.current && form.current) {
          lat.current.value = String(pos.coords.latitude);
          lng.current.value = String(pos.coords.longitude);
          form.current.requestSubmit();
        }
      },
      () => {
        setLocating(false);
        setLocError("We couldn't get your location. Allow location for Toastly and try again.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  return (
    <form ref={form} action={run} className="grid gap-2.5">
      <input type="hidden" name="date_id" value={id} />
      <input ref={lat} type="hidden" name="lat" />
      <input ref={lng} type="hidden" name="lng" />
      <p className={SMALL}>
        When you tap, your phone shares your location once. We check you&rsquo;re within {radius} m of {venue}, keep
        only that you checked in, and never store where you were.
      </p>
      {locError ? <Notice tone="error">{locError}</Notice> : null}
      <Result state={state} />
      <CheckInButton locating={locating} onTap={locate} />
    </form>
  );
}

function CheckInButton({ locating, onTap }: { locating: boolean; onTap: () => void }) {
  const { pending } = useFormStatus();
  return (
    <button type="button" onClick={onTap} disabled={locating || pending} className={PRIMARY}>
      {locating ? "Finding you…" : pending ? "Checking in…" : "I'm here"}
    </button>
  );
}

function Summary({ p }: { p: DateViewProps }) {
  return (
    <div className={CARD}>
      <p className={CAPS}>The plan</p>
      <p className="m-0 font-serif text-[22px] font-bold leading-tight text-ink-900">{p.venue}</p>
      {p.address ? <p className={SMALL}>{p.address}</p> : null}
      <p className={BODY}>{p.when}</p>
      <p className={SMALL}>
        {p.stake} coins each · a public place, with other people around.
      </p>
    </div>
  );
}

function Status({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={CARD} aria-live="polite">
      <p className={CAPS}>{title}</p>
      {children}
    </div>
  );
}

/** Cancel and move — offered while a date is pending or confirmed. */
function Changes({ p }: { p: DateViewProps }) {
  return (
    <div className={CARD}>
      <p className={CAPS}>Plans changed?</p>
      {p.beforeCutoff ? (
        <>
          <p className={SMALL}>More than {p.cutoffHours} hours to go, so cancelling returns every coin.</p>
          <Act id={p.id} action={cancelDate} label="Cancel the date" busy="Cancelling…" className={OUTLINE} />
        </>
      ) : (
        <p className={SMALL}>
          It&rsquo;s within {p.cutoffHours} hours. You can ask to move it — if {p.otherFirst} asks too, every coin comes
          back — or cancel for your safety.
        </p>
      )}
      {p.iAskedMove ? (
        <p className={SMALL}>You asked to move it. Waiting for {p.otherFirst}.</p>
      ) : (
        <>
          {p.theyAskedMove ? <p className={BODY}>{p.otherFirst} asked to move it. Agree, and every coin comes back.</p> : null}
          <Act id={p.id} action={requestReschedule} label={p.theyAskedMove ? "Agree to move it" : "Ask to move it"} busy="Asking…" className={OUTLINE} />
        </>
      )}
      {/* Always free, at any time — PRD §5.5's safety override. */}
      <Act id={p.id} action={cancelDate} label="Cancel for my safety" busy="Cancelling…" className={QUIET} extra={{ safety: "1" }} />
    </div>
  );
}

export function DateView(p: DateViewProps) {
  const gistLink = p.sessionId ? (
    <Link href={`/gist/${p.sessionId}`} className={`${OUTLINE} flex items-center justify-center`}>
      Back to your Gist
    </Link>
  ) : null;

  switch (p.status) {
    case "pending":
      return (
        <>
          <Summary p={p} />
          {p.iStaked ? (
            <Status title="Waiting for them">
              <p className={BODY}>
                You&rsquo;ve staked. When {p.otherFirst} stakes too, the date is on. If they don&rsquo;t answer before the
                time, your coins come back.
              </p>
            </Status>
          ) : (
            <Status title={`${p.otherFirst} proposed a date`}>
              <p className={BODY}>
                Stake {p.stake} coins to say yes. You both show up, you both get them back.
              </p>
              {p.stakeable < p.stake ? (
                <Notice tone="info">
                  You can stake {p.stakeable} {p.stakeable === 1 ? "coin" : "coins"} right now.
                  <Link href="/coins" className="flex min-h-11 items-center font-semibold underline">
                    See your coins
                  </Link>
                </Notice>
              ) : null}
              <Act id={p.id} action={stakeDate} label={`Stake ${p.stake} coins`} busy="Staking…" />
              <Act id={p.id} action={declineDate} label="Not this time" busy="Sending…" className={QUIET} />
            </Status>
          )}
          {p.iStaked ? <Changes p={p} /> : null}
        </>
      );

    case "confirmed":
      return (
        <>
          <Summary p={p} />
          <Status title="You're both in">
            {p.iCheckedIn ? (
              <p className={BODY}>
                You&rsquo;re checked in.{" "}
                {p.theyCheckedIn ? "" : `When ${p.otherFirst} checks in, your coins come back to you both.`}
              </p>
            ) : p.windowOpen ? (
              <>
                <p className={BODY}>Arrived? Check in so you both get your coins back.</p>
                <CheckIn id={p.id} venue={p.venue} radius={p.radius} />
              </>
            ) : (
              <p className={BODY}>Check-in opens on the day, from {p.windowLabel}.</p>
            )}
            {p.theyCheckedIn && !p.iCheckedIn ? <p className={SMALL}>{p.otherFirst} has checked in.</p> : null}
          </Status>
          {p.iCheckedIn ? null : <Changes p={p} />}
        </>
      );

    case "provisional_no_show":
      return (
        <>
          <Summary p={p} />
          {p.iWasAbsent ? (
            <Status title="We didn't see you check in">
              <p className={BODY}>
                If you were there, tell us by {p.contestBy} and a person on the team will look at it. If not, your{" "}
                {p.stake} coins go to {p.otherFirst}, who showed up.
              </p>
              <Act id={p.id} action={contestDate} label="I was there" busy="Sending…" />
              <p className={SMALL}>If you stayed away because you felt unsafe, report them below — your coins come back.</p>
            </Status>
          ) : (
            <Status title="Thanks for showing up">
              <p className={BODY}>
                {p.otherFirst} didn&rsquo;t check in. They have until {p.contestBy} to tell us what happened. If they
                don&rsquo;t, their coins come to you.
              </p>
            </Status>
          )}
        </>
      );

    case "under_review":
      return (
        <>
          <Summary p={p} />
          <Status title="A person is looking at this">
            <p className={BODY}>
              {p.iWasAbsent ? "You told us you were there." : `${p.otherFirst} told us they were there.`} Someone on the
              team will decide, and nothing moves until they do.
            </p>
          </Status>
        </>
      );

    case "completed":
      return (
        <>
          <Summary p={p} />
          <Status title="You both made it">
            <p className={BODY}>Your coins are back. Thanks for showing up for each other.</p>
          </Status>
          {gistLink}
        </>
      );

    case "no_show":
      return (
        <>
          <Summary p={p} />
          {p.iWasAbsent ? (
            <Status title="This one didn't happen">
              <p className={BODY}>You didn&rsquo;t check in, so your {p.stake} coins went to {p.otherFirst}, who showed up.</p>
              <p className={SMALL}>
                If you stayed away because you felt unsafe, report them below within 7 days — your coins come back.
              </p>
            </Status>
          ) : (
            <Status title="Thanks for showing up">
              <p className={BODY}>They didn&rsquo;t make it — their coins are now in your balance.</p>
              <Link href="/coins" className={`${OUTLINE} flex items-center justify-center`}>
                See your coins
              </Link>
            </Status>
          )}
        </>
      );

    default: {
      const why: Record<string, string> = {
        notice: p.cancelledByMe ? "You cancelled in good time." : `${p.otherFirst} cancelled in good time.`,
        declined: p.cancelledByMe
          ? "You said not this time."
          : p.iProposed
            ? `${p.otherFirst} couldn't make this one.`
            : "This one wasn't confirmed in time.",
        reschedule: "You agreed to move it. Pick a new time from your Gist.",
        safety: p.cancelledByMe ? "You cancelled for your safety." : "This date was cancelled.",
        neither_attended: "Neither of you checked in.",
      };
      return (
        <>
          <Summary p={p} />
          <Status title="Cancelled">
            <p className={BODY}>
              {why[p.cancelReason ?? ""] ?? "This date didn't go ahead."} Every coin came back.
            </p>
          </Status>
          {gistLink}
        </>
      );
    }
  }
}

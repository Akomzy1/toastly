"use client";

import * as React from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { answerNoShow, cancelDate, checkIn, stakeDate } from "../actions";
import { Notice } from "@/components/ui/notice";
import { AppBand, AppColumn } from "@/components/app/app-band";
import { COINS_HELD } from "@/lib/coins";
import { cn } from "@/lib/utils";

/**
 * The date screens — design/prototype/date-stake-confirm, date-checkin,
 * date-cancel and date-outcomes, as one view over the date's state.
 *
 * Copy stays warm: "showing up for each other". Never "forfeit", "penalty"
 * or "fine" — and never "transfer" for coins moving between members.
 * "I don't feel safe" is always one tap away and always free.
 */

export type DateInfo = {
  id: string;
  status: "pending" | "confirmed" | "completed" | "cancelled" | "no_show" | "provisional" | "disputed";
  scheduled_for: string;
  stake: number;
  venue: string | null;
  address: string | null;
  other_name: string | null;
  you_staked: boolean;
  they_staked: boolean;
  you_checked_in: boolean;
  they_checked_in: boolean;
  you_absent: boolean;
  they_absent: boolean;
  contest_deadline: string | null;
  free_cancel_until: string;
  checkin_opens: string;
  checkin_closes: string;
  safety: boolean;
  cancelled_by_you: boolean;
  settled_at: string | null;
  no_show_member_is_you: boolean;
  stakeable: number;
  bonus: number;
};

const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "short" }).format(new Date(iso));
const fmtWhen = (iso: string) =>
  `${fmtDay(iso)} · ${new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso)).replace(":00", "")}`;
const fmtCutoff = (iso: string) =>
  `${new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso)).replace(":00", "")} on ${new Intl.DateTimeFormat("en-GB", { weekday: "long" }).format(new Date(iso))}`;

const primary = "grid min-h-12 w-full place-items-center rounded-lg bg-green-500 px-5 py-3.5 text-button text-white no-underline hover:bg-green-600 disabled:opacity-60";
const secondary = "grid min-h-12 w-full place-items-center rounded-lg border border-ink-900/20 bg-transparent px-5 py-3.5 text-button text-ink-900 no-underline hover:border-green-500 hover:bg-green-50";

function Submit({ children, className = primary }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? "One moment…" : children}
    </button>
  );
}

function Stake({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="16" height="16" viewBox="12 12 24 24" fill="none" aria-hidden="true">
        <circle cx="24" cy="24" r="9.5" stroke="#CC8F00" strokeWidth="3" />
      </svg>
      {n} coins each
    </span>
  );
}

function VenueCard({ d, label }: { d: DateInfo; label?: string }) {
  return (
    <div className="grid gap-3 rounded-xl border border-ink-900/[.12] bg-white p-4">
      {label ? <p className="text-chip font-semibold uppercase tracking-[0.12em] text-green-500">{label}</p> : null}
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 className="font-serif text-[22px] font-bold leading-[1.2] text-ink-900">{d.venue ?? "Your spot"}</h2>
          {d.address ? <p className="text-nav text-grey-600">{d.address}</p> : null}
        </div>
        <span className="rounded-pill border border-green-500/30 bg-green-50 px-2.5 py-1 text-chip font-semibold text-green-550">Public</span>
      </div>
      <div className="grid gap-2 border-t border-ink-900/10 pt-3 text-ui">
        <div className="flex justify-between gap-3">
          <span className="text-grey-600">When</span>
          <span>{fmtWhen(d.scheduled_for)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-grey-600">Stake</span>
          <Stake n={d.stake} />
        </div>
      </div>
    </div>
  );
}

function Showing({ d }: { d: DateInfo }) {
  return (
    <div className="grid gap-1.5 rounded-xl border border-gold-600/30 bg-gold-50 px-4 py-3.5">
      <p className="text-ui font-semibold text-ink-900">Showing up for each other</p>
      <p className="text-nav leading-[1.55] text-ink-800">
        You both put in {d.stake} coins. Show up and they come back to you. If one of you can&rsquo;t make it, their coins
        go to the other.
      </p>
      <p className="text-nav text-ink-800">Cancel free until {fmtCutoff(d.free_cancel_until)}.</p>
      <p className="text-nav font-semibold text-ink-900">Toastly never keeps any of it.</p>
    </div>
  );
}

function SafetyLinks({ onSafety, onCant }: { onSafety: () => void; onCant: () => void }) {
  const row = "flex min-h-14 w-full items-center justify-between gap-3 px-[15px] py-3 text-left text-ui font-medium text-ink-900 hover:bg-paper";
  return (
    <div className="grid overflow-hidden rounded-xl border border-ink-900/[.12] bg-white">
      <button type="button" onClick={onSafety} className={row}>
        <span>I don&rsquo;t feel safe</span>
        <span aria-hidden="true" className="text-grey-400">›</span>
      </button>
      <button type="button" onClick={onCant} className={cn(row, "border-t border-ink-900/10")}>
        <span>Can&rsquo;t make it</span>
        <span aria-hidden="true" className="text-grey-400">›</span>
      </button>
    </div>
  );
}

export function DateView({ date: d, open }: { date: DateInfo; open: boolean }) {
  const [view, setView] = React.useState<"main" | "cancel" | "safety">("main");
  const [stakeState, stake] = useFormState(stakeDate, null);
  const [cancelState, cancel] = useFormState(cancelDate, null);
  const [answerState, answer] = useFormState(answerNoShow, null);
  const [check, setCheck] = React.useState<"ready" | "ask" | "checking" | "result">("ready");
  const [checkResult, setCheckResult] = React.useState<string | null>(null);
  const name = d.other_name ?? "your date";
  const now = Date.now();
  const inWindow = now >= new Date(d.checkin_opens).getTime() && now <= new Date(d.checkin_closes).getTime();
  const beforeCutoff = now < new Date(d.free_cancel_until).getTime();
  const sub = `With ${name} · ${fmtDay(d.scheduled_for)}`;

  // --- cancelling ---------------------------------------------------------
  if (view === "safety" || cancelState?.ok === "safety") {
    return (
      <>
        <AppBand title="Cancel the date" sub={sub} safety />
        <AppColumn>
          {cancelState?.ok === "safety" ? (
            <div role="status" className="grid gap-2.5 px-0.5">
              <h2 className="font-serif text-[24px] font-bold leading-[1.2] text-ink-900">Date cancelled</h2>
              <p className="text-ui leading-[1.6] text-ink-800">
                Your {d.stake} coins are back in your balance. {name} sees that the date is off. We don&rsquo;t tell them why.
              </p>
            </div>
          ) : (
            <form action={cancel} className="grid gap-5">
              <input type="hidden" name="date_id" value={d.id} />
              <input type="hidden" name="safety" value="on" />
              <div className="grid gap-2.5 px-0.5">
                <h2 className="font-serif text-[24px] font-bold leading-[1.2] text-ink-900">
                  You don&rsquo;t owe anyone a meeting.
                </h2>
                <p className="text-ui leading-[1.6] text-ink-800">Your coins come back to you.</p>
              </div>
              {cancelState?.error ? <Notice tone="error">{cancelState.error}</Notice> : null}
              <Submit>Cancel the date</Submit>
            </form>
          )}
          <div className="grid overflow-hidden rounded-xl border border-ink-900/[.12] bg-white">
            <Link href="/safety-kit" className="grid gap-0.5 px-[15px] py-3 no-underline hover:bg-paper">
              <span className="text-ui font-medium text-ink-900">Talk to the safety team</span>
              <span className="text-[13px] text-grey-600">A person, not a form</span>
            </Link>
            <Link href="/safety-kit" className="grid gap-0.5 border-t border-ink-900/10 px-[15px] py-3 no-underline hover:bg-paper">
              <span className="text-ui font-medium text-ink-900">Report {name}</span>
              <span className="text-[13px] text-grey-600">Tell us what happened, in your own words</span>
            </Link>
          </div>
          {cancelState?.ok ? (
            <Link href="/coins" className={secondary}>
              See coin balance
            </Link>
          ) : (
            <button type="button" onClick={() => setView("main")} className={secondary}>
              Keep the date
            </button>
          )}
        </AppColumn>
      </>
    );
  }

  if (view === "cancel" || cancelState?.ok === "free" || cancelState?.ok === "late") {
    const done = cancelState?.ok === "free" || cancelState?.ok === "late";
    return (
      <>
        <AppBand title="Cancel the date" sub={sub} safety />
        <AppColumn>
          {done ? (
            <div role="status" className="grid gap-2.5 px-0.5">
              <h2 className="font-serif text-[24px] font-bold leading-[1.2] text-ink-900">Date cancelled</h2>
              <p className="text-ui leading-[1.6] text-ink-800">
                {cancelState?.ok === "free"
                  ? `Both stakes came back. Your ${d.stake} coins are in your balance.`
                  : `Your ${d.stake} coins went to ${name}, and their ${d.stake} coins came back to them.`}
              </p>
              <p className="text-nav text-grey-600">{name} can see the date is off.</p>
            </div>
          ) : (
            <form action={cancel} className="grid gap-5">
              <input type="hidden" name="date_id" value={d.id} />
              <div className="grid gap-2.5 px-0.5">
                <h2 className="font-serif text-[24px] font-bold leading-[1.2] text-ink-900">Cancel the date?</h2>
                {beforeCutoff || !d.you_staked || !d.they_staked ? (
                  <>
                    <p className="text-ui font-semibold text-ink-900">Free — both stakes come back.</p>
                    <p className="text-ui leading-[1.6] text-ink-800">
                      It&rsquo;s before {fmtCutoff(d.free_cancel_until)}. Your {d.stake} coins come back to you and{" "}
                      {name}&rsquo;s come back to them. {name} will see the date is off.
                    </p>
                  </>
                ) : (
                  <p className="text-ui leading-[1.6] text-ink-800">
                    The free-cancel time was {fmtCutoff(d.free_cancel_until)}. If you cancel now, your {d.stake} coins go to{" "}
                    {name}, and their {d.stake} coins come back to them. It&rsquo;s the arrangement you both agreed to, and it
                    works the same way for everyone.
                  </p>
                )}
              </div>
              <div className="rounded-lg border border-ink-900/[.12] bg-white px-[13px] py-3 text-nav leading-[1.55] text-ink-800">
                If something about this date doesn&rsquo;t feel right,{" "}
                <button type="button" onClick={() => setView("safety")} className="font-semibold text-green-500 underline">
                  use I don&rsquo;t feel safe
                </button>{" "}
                instead. That&rsquo;s always free.
              </div>
              {cancelState?.error ? <Notice tone="error">{cancelState.error}</Notice> : null}
              <Submit className={secondary}>Cancel the date</Submit>
            </form>
          )}
          {done ? (
            <>
              <Link href="/coins" className={secondary}>
                See coin balance
              </Link>
              <Link href="/feed" className="grid min-h-12 place-items-center text-button text-green-500 no-underline">
                Back to today&rsquo;s six
              </Link>
            </>
          ) : (
            <button type="button" onClick={() => setView("main")} className={primary}>
              Keep the date
            </button>
          )}
        </AppColumn>
      </>
    );
  }

  // --- after the date -----------------------------------------------------
  if (d.status === "provisional" && d.you_absent) {
    return (
      <>
        <AppBand title="What next" sub={sub} safety />
        <AppColumn>
          <div className="grid gap-2.5 px-0.5">
            <h2 className="font-serif text-[24px] font-bold leading-[1.2] text-ink-900">We didn&rsquo;t see you check in.</h2>
            <p className="text-ui leading-[1.6] text-ink-800">If something got in the way, tell us what happened.</p>
            {d.contest_deadline ? (
              <p className="text-nav text-grey-600">
                You have 24 hours to respond — until {fmtCutoff(d.contest_deadline)}. If we don&rsquo;t hear from you by then,
                your {d.stake} coins go to {name}.
              </p>
            ) : null}
          </div>
          {answerState?.error ? <Notice tone="error">{answerState.error}</Notice> : null}
          <form action={answer} className="grid gap-3 rounded-xl border border-ink-900/[.12] bg-white p-4">
            <input type="hidden" name="date_id" value={d.id} />
            <p className="text-chip font-semibold uppercase tracking-[0.12em] text-grey-600">What happened?</p>
            <button name="answer" value="came_up" className={secondary}>
              Something came up
            </button>
            <button name="answer" value="unsafe" className={secondary}>
              I didn&rsquo;t feel safe
            </button>
            <label htmlFor="note" className="mt-1 text-nav font-semibold text-ink-900">
              I was there — anything you&rsquo;d like us to know
            </label>
            <textarea
              id="note"
              name="note"
              rows={3}
              maxLength={1000}
              placeholder="A line or two is plenty."
              className="w-full rounded-lg border border-ink-900/[.24] px-3 py-2.5 text-ui"
            />
            <button name="answer" value="was_there" className={primary}>
              Send
            </button>
            <p className="text-[13px] text-grey-600">A person on our team will look at it. Nothing moves until it&rsquo;s settled.</p>
          </form>
          <Link href="/safety-kit" className="grid gap-0.5 rounded-xl border border-ink-900/[.12] bg-white px-[15px] py-3 no-underline">
            <span className="text-ui font-medium text-ink-900">Report something that felt wrong</span>
            <span className="text-[13px] text-grey-600">The safety team reads every one</span>
          </Link>
        </AppColumn>
      </>
    );
  }

  const outcome = (() => {
    if (answerState?.ok === "came_up") return { title: "Thanks for letting us know something came up.", body: `Your ${d.stake} coins go to ${name}, as you both agreed.` };
    if (answerState?.ok === "unsafe") return { title: `Your ${d.stake} coins came back to you in full.`, body: "You don't owe anyone a meeting. If you'd like to talk to the safety team, we'll offer that next." };
    if (d.status === "disputed" || answerState?.ok === "was_there") return { title: "Being reviewed", body: "A person on our team will look at it. Nothing moves until it's settled. We'll let you know here when it's settled." };
    if (d.status === "provisional" && d.they_absent) return { title: `You were there. Waiting to hear from ${name}.`, body: `They have 24 hours to respond. Nothing moves until then.` };
    if (d.status === "completed") return { title: "You both showed up.", body: "Your coins are back in your balance." };
    if (d.status === "no_show" && !d.no_show_member_is_you) return { title: `They didn't make it — their ${d.stake} coins are now in your balance.`, body: `Your ${d.stake} coins came back too.` };
    if (d.status === "no_show") return { title: `Your ${d.stake} coins went to ${name}.`, body: `We couldn't confirm you were at ${d.venue ?? "the venue"}, so the stake went to ${name}, as you both agreed before the date.` };
    if (d.status === "cancelled" && d.safety) return { title: `Your ${d.stake} coins came back to you in full.`, body: "You don't owe anyone a meeting." };
    if (d.status === "cancelled") return { title: "The date is off.", body: "Both stakes came back." };
    return null;
  })();

  if (outcome && (d.settled_at || d.status === "disputed" || d.status === "provisional" || answerState?.ok)) {
    return (
      <>
        <AppBand title="Your date" sub={sub} safety />
        <AppColumn>
          <div role="status" className="grid gap-2.5 rounded-xl border border-ink-900/[.12] bg-white p-4">
            <h2 className="font-serif text-[22px] font-bold leading-[1.25] text-ink-900">{outcome.title}</h2>
            <p className="text-ui leading-[1.6] text-ink-800">{outcome.body}</p>
          </div>
          <Link href="/coins" className={secondary}>
            See coin balance
          </Link>
          <Link href="/safety-kit" className="grid gap-0.5 rounded-xl border border-ink-900/[.12] bg-white px-[15px] py-3 no-underline">
            <span className="text-ui font-medium text-ink-900">Report something that felt wrong</span>
            <span className="text-[13px] text-grey-600">The safety team reads every one</span>
          </Link>
        </AppColumn>
      </>
    );
  }

  // --- before the date: confirm and stake ---------------------------------
  if (d.status === "pending" && !d.you_staked && stakeState?.ok !== "staked") {
    const short = d.stakeable < d.stake;
    return (
      <>
        <AppBand title="Confirm your date" sub={`You and ${name} agreed a spot and a time`} safety />
        <AppColumn>
          {!open ? <Notice tone="info">{COINS_HELD}</Notice> : null}
          <VenueCard d={d} />
          <Showing d={d} />
          {short ? (
            <div className="grid gap-3">
              <div className="grid gap-1 rounded-lg border border-ink-900/[.12] bg-white px-[13px] py-3">
                <p className="text-nav text-ink-900">
                  You have {d.stakeable} coins that can be staked. This date needs {d.stake}.
                </p>
                {d.bonus > 0 ? (
                  <p className="text-nav text-grey-600">
                    Your {d.bonus} bonus coins can be spent on Toastly, but they can&rsquo;t be staked.
                  </p>
                ) : null}
              </div>
              <Link href="/coins/get" className={primary}>
                Get coins
              </Link>
              <Link href="/gist" className={secondary}>
                Not now
              </Link>
            </div>
          ) : (
            <form action={stake} className="grid gap-3">
              <input type="hidden" name="date_id" value={d.id} />
              <p className="text-nav text-grey-600">
                Staked from Your coins. You have {d.stakeable}, and {d.stakeable - d.stake} after you confirm.
              </p>
              {stakeState?.error ? <Notice tone="error">{stakeState.error}</Notice> : null}
              <Submit>Confirm</Submit>
              <Link href="/gist" className={secondary}>
                Not now
              </Link>
            </form>
          )}
        </AppColumn>
      </>
    );
  }

  // --- the day: check in ----------------------------------------------------
  if (d.status === "confirmed" && inWindow) {
    const locate = () => {
      setCheck("checking");
      if (!("geolocation" in navigator)) {
        setCheckResult("no_location");
        return setCheck("result");
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          // Sent once for the comparison; the server keeps only the result.
          const r = await checkIn(d.id, pos.coords.latitude, pos.coords.longitude);
          setCheckResult(r?.ok ?? "error");
          setCheck("result");
        },
        () => {
          setCheckResult("no_location");
          setCheck("result");
        },
        { enableHighAccuracy: true, timeout: 15000 },
      );
    };
    const both = checkResult === "both_here" || (d.you_checked_in && d.they_checked_in);
    const youIn = checkResult === "checked_in" || d.you_checked_in;
    return (
      <>
        <AppBand title="Your date today" sub={sub} safety />
        <AppColumn>
          <div className="grid gap-4 rounded-xl border border-ink-900/[.12] bg-white p-4">
            <div className="grid gap-1">
              <p className="text-chip font-semibold uppercase tracking-[0.12em] text-green-500">
                Today · {new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(d.scheduled_for))}
              </p>
              <h2 className="font-serif text-[22px] font-bold leading-[1.2] text-ink-900">{d.venue ?? "Your spot"}</h2>
              <p className="flex flex-wrap items-center gap-1.5 text-nav text-grey-600">
                {d.address ? <span>{d.address} ·</span> : null}
                <Stake n={d.stake} />
              </p>
            </div>
            {both ? (
              <div role="status" className="grid gap-1 rounded-lg border border-green-500/30 bg-green-50 px-[13px] py-3">
                <p className="text-ui font-semibold text-ink-900">You&rsquo;re both here — enjoy it.</p>
                <p className="text-nav text-ink-800">Your {d.stake} coins are back in your balance.</p>
              </div>
            ) : youIn ? (
              <div role="status" className="grid gap-0.5">
                <p className="text-ui font-semibold text-ink-900">You&rsquo;re checked in</p>
                <p className="text-nav text-grey-600">Waiting for {name}. We&rsquo;ll let you know when they check in.</p>
              </div>
            ) : check === "ready" ? (
              <div className="grid gap-2">
                <button type="button" onClick={() => setCheck("ask")} className={primary}>
                  I&rsquo;m here
                </button>
                <p className="text-nav text-grey-600">Tap when you arrive.</p>
              </div>
            ) : check === "ask" ? (
              <div className="grid gap-3">
                <p className="text-nav leading-[1.55] text-ink-800">
                  We&rsquo;ll check you&rsquo;re near the venue. We keep the result, not your location.
                </p>
                <button type="button" onClick={locate} className={primary}>
                  Check now
                </button>
                <button type="button" onClick={() => setCheck("ready")} className={secondary}>
                  Not yet
                </button>
              </div>
            ) : check === "checking" ? (
              <p role="status" className="text-nav text-grey-600">
                Seeing if you&rsquo;re near {d.venue ?? "the venue"}.
              </p>
            ) : (
              <div className="grid gap-2">
                <Notice tone="info">
                  {checkResult === "too_far"
                    ? `You don't seem to be at ${d.venue ?? "the venue"} yet. Try again when you arrive.`
                    : checkResult === "no_location"
                      ? "We couldn't get your location. Check that Toastly can use it, then try again."
                      : "We couldn't check you in just now. Try again."}
                </Notice>
                <button type="button" onClick={() => setCheck("ask")} className={secondary}>
                  Try again
                </button>
              </div>
            )}
          </div>
          <SafetyLinks onSafety={() => setView("safety")} onCant={() => setView("cancel")} />
        </AppColumn>
      </>
    );
  }

  // --- staked, waiting ------------------------------------------------------
  const bothIn = d.status === "confirmed" || (stakeState?.ok === "staked" && d.they_staked);
  return (
    <>
      <AppBand title="Confirm your date" sub={sub} safety />
      <AppColumn>
        <VenueCard d={d} />
        <div role="status" className="grid gap-1 rounded-lg border border-green-500/30 bg-green-50 px-[13px] py-3">
          <p className="text-ui font-semibold text-ink-900">{bothIn ? "You're both in. See you " + fmtDay(d.scheduled_for) + "." : "You're confirmed"}</p>
          <p className="text-nav leading-[1.55] text-ink-800">
            {bothIn
              ? `You each have ${d.stake} coins staked. Check in at ${d.venue ?? "the venue"} when you arrive, and they come back to you.`
              : `Your ${d.stake} coins are staked. Waiting for ${name} to confirm. If they don't, your coins come back to you.`}
          </p>
        </div>
        <SafetyLinks onSafety={() => setView("safety")} onCant={() => setView("cancel")} />
      </AppColumn>
    </>
  );
}

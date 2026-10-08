"use client";

import { STARTER_MONTHLY_GISTS, gistCount, type upgradeOffer } from "@/lib/plan-numbers";
import * as React from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { buyExtraGist, inviteToGistForm } from "@/app/(app)/gist/actions";
import { useRouter } from "next/navigation";
import { replyToAnswer } from "@/app/(app)/feed/actions";
import { Notice } from "@/components/ui/notice";
import { AMBER, AnswerQuote, Band, CARD, ClockIcon, NOTE, OUTLINE, PersonHead } from "./invite-parts";

/**
 * Reply to a prompt answer — gist-invite-starter, gist-invite-paid and
 * gist-invite-limit (prototypes 1–3).
 *
 * Starter: one action, no message box; the Gist count is a quiet line, never
 * a badge. Paid: two equal options, nothing preselected; picking one opens
 * only what that reply needs. At the limit: a plain note, and the upgrade
 * (naming the plan and its price, opening the in-app plan screen) and Not
 * now the same size, so declining is as easy as upgrading (decided 8 October
 * 2026).
 *
 * Deviations, flagged:
 *   - Age and profession are not shown: date of birth is private, and
 *     profession follows its owner's visibility setting.
 *   - A Gist counts only when one the member STARTED connects; accepting
 *     an invitation is free and never counts (decided 8 October 2026).
 */

type Mode = "starter" | "limit" | "paid";

function Submit({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={disabled || pending} className={AMBER}>
      {pending ? "Sending…" : children}
    </button>
  );
}

function ExtraGistButton({ coins }: { coins: number }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={OUTLINE}>
      {pending ? "Adding…" : `One more Gist · ${coins} coins`}
    </button>
  );
}

const OPTION =
  "flex min-h-[72px] w-full items-center gap-3 rounded-[14px] border px-[13px] py-3.5 text-left font-sans transition-colors duration-200";

function Choice({
  on,
  onPick,
  icon,
  title,
  body,
}: {
  on: boolean;
  onPick: () => void;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onPick}
      className={`${OPTION} ${on ? "border-green-500 bg-green-50" : "border-ink-900/[.14] bg-white"}`}
    >
      <span aria-hidden="true" className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-pill bg-green-50">
        {icon}
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-ui font-semibold text-ink-900">{title}</span>
        <span className="text-[13px] leading-[1.45] text-grey-600">{body}</span>
      </span>
      <span
        className={`grid h-5 w-5 flex-shrink-0 place-items-center rounded-pill border ${
          on ? "border-green-500 bg-green-500" : "border-ink-900/[.22] bg-transparent"
        }`}
      >
        {on ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
    </button>
  );
}

export function ReplyScreen({
  mode,
  answerId,
  recipientId,
  name,
  city,
  prompt,
  answer,
  gistsLeft,
  resetOn,
  offer,
  extraGist = null,
}: {
  mode: Mode;
  answerId: string;
  recipientId: string;
  name: string;
  city: string | null;
  prompt: string;
  answer: string;
  /** Starter only. */
  gistsLeft: number | null;
  resetOn: string;
  /** The plan a Starter member would move to, and its price. */
  offer: ReturnType<typeof upgradeOffer>;
  /** At the limit: one more Gist for coins, while a price is set (0038). */
  extraGist?: { coins: number; have: number } | null;
}) {
  const first = name.split(" ")[0];
  const [pick, setPick] = React.useState<"msg" | "gist" | null>(null);
  const [text, setText] = React.useState("");
  const [inviteState, invite] = useFormState(inviteToGistForm, null);
  const [msgState, message] = useFormState(replyToAnswer, null);
  const [extraState, buyExtra] = useFormState(buyExtraGist, null);
  const router = useRouter();
  // Bought: the page reloads into the invite screen with the new Gist.
  React.useEffect(() => {
    if (extraState?.ok) router.refresh();
  }, [extraState?.ok, router]);

  const inviteForm = (label: string, icon?: boolean) => (
    <form action={invite} className="grid gap-3">
      <input type="hidden" name="prompt_answer_id" value={answerId} />
      {inviteState?.error ? <Notice tone="error">{inviteState.error}</Notice> : null}
      <Submit>
        {icon ? <ClockIcon /> : null}
        {label}
      </Submit>
    </form>
  );

  return (
    <div className="mx-auto grid w-full max-w-[680px]">
      <Band title={`Reply to ${first}`} sub="Today's six" back="/feed" />
      <div className="grid content-start gap-5 px-3.5 pb-6 pt-5">
        <div className={CARD}>
          <PersonHead name={name} city={city} />
          <AnswerQuote label="You're replying to" prompt={prompt} answer={answer} />
        </div>

        {mode === "starter" ? (
          <div className="grid gap-3">
            {inviteForm("Invite to a Gist", true)}
            <p className={NOTE}>
              An 18-minute voice chat, with questions to get you talking. You have{" "}
              {gistCount(gistsLeft ?? STARTER_MONTHLY_GISTS)} left this month — it only counts if the call
              happens.
            </p>
          </div>
        ) : null}

        {mode === "limit" ? (
          <>
            <div className="grid gap-2 rounded-xl border border-champagne/90 bg-gold-50 px-3.5 py-4">
              <p className="m-0 font-serif text-[19px] font-bold leading-[1.3] text-ink-900 [text-wrap:balance]">
                You&rsquo;ve used your {gistCount(STARTER_MONTHLY_GISTS)} this month.
              </p>
              <p className="m-0 text-ui leading-[1.6] text-gold-800">
                They reset on {resetOn}. {offer.plan} ({offer.price}) gives you unlimited Gists and messages.
              </p>
            </div>
            <div className="grid gap-2.5">
              <Link href="/profile/plan" className={AMBER}>
                See {offer.plan} · {offer.price}
              </Link>
              {/* Addition, flagged (decided 8 October 2026): one more Gist for
                  coins. Not in gist-invite-limit.slim.html — this screen's own
                  outline button until the prototype arrives. */}
              {extraGist ? (
                extraGist.have >= extraGist.coins ? (
                  <form action={buyExtra} className="grid">
                    <input type="hidden" name="back" value={`/feed/reply/${answerId}`} />
                    <ExtraGistButton coins={extraGist.coins} />
                  </form>
                ) : (
                  <Link href="/coins/get" className={OUTLINE}>
                    One more Gist · {extraGist.coins} coins — get coins
                  </Link>
                )
              ) : null}
              <Link href="/feed" className={OUTLINE}>
                Not now
              </Link>
            </div>
            {extraState?.error ? <Notice tone="error">{extraState.error}</Notice> : null}
            {extraState?.ok ? <Notice tone="success">{extraState.ok}</Notice> : null}
            {extraGist ? (
              <p className={NOTE}>
                You have {extraGist.have} coin{extraGist.have === 1 ? "" : "s"}. An extra Gist is for this month, and only
                counts if the call happens.
              </p>
            ) : null}
            <p className="m-0 px-0.5 text-center text-[13px] leading-[1.6] text-grey-600">
              Invites others send you still arrive, and accepting one is always free.
            </p>
          </>
        ) : null}

        {mode === "paid" ? (
          <>
            <div role="radiogroup" aria-label="How do you want to reply?" className="grid gap-2.5">
              <p className="m-0 px-0.5 font-sans text-chip font-semibold uppercase tracking-[0.12em] text-grey-600">
                Reply with
              </p>
              <Choice
                on={pick === "msg"}
                onPick={() => setPick(pick === "msg" ? null : "msg")}
                title="Send a message"
                body="Write back to this answer."
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M4 12a8 8 0 1 1 3.5 6.6L4 20l1.2-3.8A7.9 7.9 0 0 1 4 12Z" stroke="#00695C" strokeWidth="1.6" strokeLinejoin="round" />
                  </svg>
                }
              />
              <Choice
                on={pick === "gist"}
                onPick={() => setPick(pick === "gist" ? null : "gist")}
                title="Invite to a Gist"
                body="An 18-minute voice chat, with questions to get you talking."
                icon={<ClockIcon color="#00695C" />}
              />
            </div>

            {pick === "msg" ? (
              <form action={message} className="grid gap-2.5">
                <input type="hidden" name="recipient_id" value={recipientId} />
                <input type="hidden" name="prompt_answer_id" value={answerId} />
                <label className="grid gap-2">
                  <span className="px-0.5 text-nav font-semibold text-ink-900">Your message</span>
                  <textarea
                    name="body"
                    rows={4}
                    maxLength={1000}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Say something about what they wrote…"
                    className="min-h-[112px] w-full resize-y rounded-lg border border-ink-900/20 bg-white p-3.5 font-sans text-ui leading-[1.6] text-ink-900 focus:border-green-500 focus:outline-none focus:ring-[3px] focus:ring-green-500/[.16]"
                  />
                </label>
                {msgState?.error ? <Notice tone="error">{msgState.error}</Notice> : null}
                {msgState?.ok ? <Notice tone="success">{msgState.ok}</Notice> : null}
                <Submit disabled={!text.trim()}>Send message</Submit>
              </form>
            ) : null}

            {pick === "gist" ? (
              <div className="grid gap-2.5">
                <p className={NOTE}>
                  {first} sees this answer with your invite. If they say yes, you&rsquo;ll pick a time together.
                </p>
                {inviteForm("Send Gist invite")}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

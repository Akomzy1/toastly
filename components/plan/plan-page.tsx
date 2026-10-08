"use client";

import { PAYMENTS_CLOSED } from "@/lib/launch";
import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { checkout, stopRenewal, type PlanState } from "@/app/(app)/profile/plan/actions";
import { payWithCoins } from "@/app/(app)/coins/actions";
import { Notice } from "@/components/ui/notice";
import type { Tier } from "@/lib/pricing-content";

/**
 * Your plan — PRD §7, decided 4 October 2026.
 *
 * NOT IN A PROTOTYPE — flagged. Built from the in-app cards and buttons until
 * the plan and checkout screens go through the design pipeline. Payment
 * itself happens on Paystack's or Stripe's hosted page; no card form here.
 *
 * Naira (hybrid): card renews monthly and is stopped here; bank or USSD buys
 * a 30-day pass; coins pay in full, or part-pay with the card covering the
 * rest. Dollars: a monthly Stripe plan (card or Apple Pay); coins never pay
 * a dollar plan.
 */

export type Grant = { tier: string; source: string; ends_at: string };
export type Sub = { id: string; provider: string; tier: string; status: string; current_period_end: string | null };

const NAMES: Record<string, string> = {
  premium: "Premium",
  premium_plus: "Premium Plus",
  diaspora: "Diaspora",
  diaspora_plus: "Diaspora Plus",
};

const day = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) : "");

const CARD = "grid gap-3 rounded-xl border border-ink-900/[.12] bg-white px-[15px] py-4";
const CAPS = "m-0 font-sans text-chip font-semibold uppercase tracking-[0.12em] text-grey-600";
const SMALL = "m-0 text-nav leading-[1.55] text-grey-600";
const PRIMARY =
  "min-h-12 w-full rounded-lg bg-gold-500 px-5 py-3.5 text-button text-green-800 transition-colors duration-200 hover:bg-gold-300 disabled:bg-grey-200 disabled:text-grey-600";
const OUTLINE =
  "min-h-12 w-full rounded-lg border border-ink-900/[.18] bg-white px-5 py-3.5 text-button text-ink-900 transition-colors duration-200 hover:border-ink-900/40 disabled:text-grey-400";

function Submit({ label, busy, className }: { label: string; busy: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? busy : label}
    </button>
  );
}

function Pay({ sku, mode, label, className = PRIMARY, disabled }: { sku: string; mode: string; label: string; className?: string; disabled?: boolean }) {
  const [state, action] = useFormState<PlanState, FormData>(checkout, null);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="sku" value={sku} />
      <input type="hidden" name="mode" value={mode} />
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      {disabled ? (
        <button type="button" disabled className={className}>
          {label}
        </button>
      ) : (
        <Submit label={label} busy="Opening checkout…" className={className} />
      )}
    </form>
  );
}

function CoinsInFull({ tier, coins }: { tier: string; coins: number }) {
  const [state, action] = useFormState(payWithCoins, null);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="tier" value={tier} />
      {state?.ok ? <Notice tone="success">{state.ok}</Notice> : null}
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      <Submit label={`Use ${coins} coins`} busy="Paying…" className={OUTLINE} />
    </form>
  );
}

function StopRenewal({ sub }: { sub: Sub }) {
  const [state, action] = useFormState<PlanState, FormData>(stopRenewal, null);
  const [asking, setAsking] = React.useState(false);
  if (state?.ok) return <Notice tone="success">{state.ok}</Notice>;
  return asking ? (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="subscription_id" value={sub.id} />
      <p className={SMALL}>
        It won&rsquo;t renew{sub.current_period_end ? ` after ${day(sub.current_period_end)}` : ""}. You keep{" "}
        {NAMES[sub.tier]} until then.
      </p>
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      <Submit label="Yes, stop renewing" busy="Stopping…" className={OUTLINE} />
      <button type="button" onClick={() => setAsking(false)} className="min-h-11 text-nav font-medium text-grey-600">
        Keep it
      </button>
    </form>
  ) : (
    <button type="button" onClick={() => setAsking(true)} className={OUTLINE}>
      Stop renewing
    </button>
  );
}

function grantLine(g: Grant, subs: Sub[]) {
  const name = NAMES[g.tier] ?? g.tier;
  if (g.source === "womens_launch_offer") return `${name} — free for your first 30 days, until ${day(g.ends_at)}`;
  if (g.source === "coins") return `${name} — paid with coins, until ${day(g.ends_at)}`;
  if (g.source === "subscription") {
    const renewing = subs.find((s) => s.tier === g.tier && s.status === "active");
    return renewing ? `${name} — renews monthly on your card` : `${name} — until ${day(g.ends_at)}`;
  }
  return `${name} — until ${day(g.ends_at)}`;
}

const PAID: Record<string, { tone: "success" | "info"; text: string }> = {
  "1": { tone: "success", text: "Payment received. Your plan is on." },
  coins: { tone: "info", text: "Your payment arrived after the coins you'd set aside were released, so it's been added to your balance as coins instead." },
  pending: { tone: "info", text: "Payment received — it can take a minute to show here. Refresh shortly." },
  cancelled: { tone: "info", text: "No payment was taken." },
};

export function PlanPage(p: {
  tierLabel: string;
  track: "ngn" | "usd";
  /** Set when the member's country has no open diaspora city yet. */
  community?: { country: string } | null;
  grants: Grant[];
  subs: Sub[];
  coins: number;
  premiumCoins: number;
  premiumPlusCoins: number;
  coinNaira: number;
  paystackOn: boolean;
  stripeOn: boolean;
  /** Before launch (lib/launch.ts): nothing can be bought by this member yet. */
  closed?: boolean;
  paid: string | null;
  /** The track's tiers, built from the feature flags on the server. */
  tiers: Tier[];
}) {
  const renewing = p.subs.filter((s) => s.status === "active" || s.status === "past_due" || s.status === "non_renewing");
  const blocksNewRenewal = p.subs.some((s) => s.status === "active" || s.status === "past_due");
  // Built on the server from the flags (lib/features.ts): ngTiersFor / dpTiersFor.
  const tiers = p.track === "ngn" ? p.tiers.filter((t) => t.name !== "Starter") : p.tiers;
  const notice = p.paid ? PAID[p.paid] : null;

  return (
    <div className="mx-auto grid w-full max-w-[680px] content-start gap-4 px-3.5 pb-6 pt-4">
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      <div className={CARD}>
        <p className={CAPS}>Right now</p>
        <p className="m-0 font-serif text-[26px] font-bold leading-tight text-ink-900">{p.tierLabel}</p>
        {p.grants.length ? (
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {p.grants.map((g, i) => (
              <li key={i} className="text-ui leading-[1.5] text-ink-800">
                {grantLine(g, p.subs)}
              </li>
            ))}
          </ul>
        ) : (
          <p className={SMALL}>Starter is free, always. Verification and safety tools are free on every plan.</p>
        )}
        {renewing.map((s) =>
          s.status === "non_renewing" ? (
            <p key={s.id} className={SMALL}>
              {NAMES[s.tier]} won&rsquo;t renew{s.current_period_end ? ` — yours until ${day(s.current_period_end)}` : ""}.
            </p>
          ) : (
            <div key={s.id} className="grid gap-2">
              {s.status === "past_due" ? (
                <Notice tone="info">The last renewal didn&rsquo;t go through. Your card will be tried again.</Notice>
              ) : s.current_period_end ? (
                <p className={SMALL}>
                  {NAMES[s.tier]} renews on {day(s.current_period_end)}.
                </p>
              ) : null}
              <StopRenewal sub={s} />
            </div>
          ),
        )}
      </div>

      {tiers.map((t) => {
        const sku = t.name === "Premium" ? "premium" : t.name === "Premium Plus" ? "premium_plus" : t.name === "Diaspora" ? "diaspora" : "diaspora_plus";
        const coinPrice = sku === "premium" ? p.premiumCoins : p.premiumPlusCoins;
        const shortNaira = (coinPrice - p.coins) * p.coinNaira;
        return (
          <div key={sku} className={CARD}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="m-0 font-serif text-[22px] font-bold text-ink-900">{t.name}</p>
              <p className="m-0 text-ui text-ink-900">
                {t.price}
                <span className="text-grey-600">{t.per}</span>
              </p>
            </div>
            <p className={SMALL}>
              {/* Decided 6 October 2026: no promise of diaspora-community
                  matching where no city is open — say what the plan gives.
                  Not in a prototype (this page isn't). */}
              {p.community && sku === "diaspora"
                ? `Back-home matching with members in Nigeria, unlimited Gists, priced in dollars. Matching with Nigerians in ${p.community.country} isn't open yet — it opens city by city.`
                : t.for}
            </p>
            {p.track === "ngn" ? (
              <>
                {!p.paystackOn ? (
                  <Notice tone="locked">{p.closed ? PAYMENTS_CLOSED : <>Naira payments aren&rsquo;t connected in this environment yet.</>}</Notice>
                ) : null}
                {blocksNewRenewal ? (
                  <p className={SMALL}>Stop your current renewal to switch to a card plan for this one.</p>
                ) : (
                  <Pay sku={sku} mode="recurring" label="Pay by card · renews monthly" disabled={!p.paystackOn} />
                )}
                <Pay sku={sku} mode="pass" label="Pay by bank or USSD · 30 days" className={OUTLINE} disabled={!p.paystackOn} />
                {p.closed ? null : p.coins >= coinPrice ? (
                  <CoinsInFull tier={sku} coins={coinPrice} />
                ) : p.coins > 0 ? (
                  <Pay
                    sku={sku}
                    mode="remainder"
                    label={`Use your ${p.coins} coins + pay ₦${shortNaira.toLocaleString("en-NG")}`}
                    className={OUTLINE}
                    disabled={!p.paystackOn}
                  />
                ) : null}
              </>
            ) : (
              <>
                {!p.stripeOn ? (
                  <Notice tone="locked">{p.closed ? PAYMENTS_CLOSED : <>Dollar payments aren&rsquo;t connected in this environment yet.</>}</Notice>
                ) : null}
                {blocksNewRenewal ? (
                  <p className={SMALL}>Stop your current renewal to switch to this one.</p>
                ) : (
                  <Pay sku={sku} mode="recurring" label="Subscribe · card or Apple Pay" disabled={!p.stripeOn} />
                )}
              </>
            )}
          </div>
        );
      })}

      <p className={SMALL}>
        {p.track === "ngn"
          ? "Card plans renew monthly until you stop them here — no phone call. Bank and USSD buy 30 days at a time, and we'll email you before they end. One coin counts as ₦100."
          : "Plans renew monthly until you stop them here. Coins can't pay for dollar plans."}{" "}
        Your plans follow the country on your profile.
      </p>
    </div>
  );
}

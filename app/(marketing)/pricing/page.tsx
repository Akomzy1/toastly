import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, FeatureCard } from "@/components/ui/card";
import {
  Accordion,
  AccordionCard,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PricingCompare } from "@/components/pricing-compare";
import { Reveal } from "@/components/reveal";
import { coinPacks, dpTiers, ngTiers, whyPay, type Tier } from "@/lib/pricing-content";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Two separate tracks: Naira for members in Nigeria, USD for the diaspora. Starter is free forever. Coins for date commitments are bought separately and come back to you when you show up.",
  alternates: { canonical: "/pricing" },
};

function TierCard({ tier }: { tier: Tier }) {
  const dark = tier.tone === "dark";
  const glass = tier.tone === "glass";

  return (
    <article
      className={
        dark
          ? "grid content-start gap-4 rounded-xl border border-green-500 bg-green-800 p-7 text-white"
          : glass
            ? "grid content-start gap-4 rounded-xl border border-green-500/40 bg-green-50 p-7"
            : "grid content-start gap-4 rounded-xl border border-ink-900/[.12] bg-white p-7"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className={dark ? "text-h5 text-white" : "text-h5 text-ink-900"}>
          {tier.name}
        </h3>
        {tier.flag ? <Badge variant="tier">{tier.flag}</Badge> : null}
      </div>

      <p className="flex items-baseline gap-1">
        <span
          className={dark ? "font-serif text-h3 text-white" : "font-serif text-h3 text-ink-900"}
        >
          {tier.price}
        </span>
        <span
          className={
            dark
              ? "font-sans text-ui font-normal text-white/60"
              : "font-sans text-ui font-normal text-grey-600"
          }
        >
          {tier.per}
        </span>
      </p>

      <p className={dark ? "text-ui text-white/[.72]" : "text-ui text-grey-600"}>
        {tier.for}
      </p>

      <ul className="grid list-none gap-2.5 p-0">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-ui">
            <span aria-hidden="true" className={dark ? "text-gold-500" : "text-green-500"}>
              &#10003;
            </span>
            <span className={dark ? "text-white/90" : "text-ink-900"}>{f}</span>
          </li>
        ))}
      </ul>

      <Button
        variant={dark ? "onDarkPrimary" : "primary"}
        asChild
        className="mt-1 w-full"
      >
        <Link href="/signup">{tier.cta}</Link>
      </Button>
    </article>
  );
}

export default function PricingPage() {
  return (
    <>
      {/* 1 — Header */}
      <section className="bg-green-800 text-white">
        <div className="mx-auto max-w-container px-5 py-section-y-lg md:px-10">
          <div className="grid max-w-[760px] gap-5">
            <p className="text-caption font-semibold uppercase text-champagne">
              Pricing
            </p>
            <h1 className="text-display text-white">
              Simple, honest pricing — no games, no hidden fees.
            </h1>
            <p className="text-body-lg text-white/[.78]">
              Two separate tracks: Naira for members in Nigeria, USD for the
              diaspora. Coins for date commitments are bought separately and are
              never a subscription — they come back to you when you show up.
            </p>
          </div>
        </div>
      </section>

      {/* 2 — Nigeria track. Kept visually separate from the USD track; the
             two currencies are never blended into one table. */}
      <section className="bg-paper">
        <div className="mx-auto max-w-container px-5 py-section-y-lg md:px-10">
          <div className="grid max-w-[760px] gap-3.5">
            <Badge variant="trackNgn" className="justify-self-start">
              ₦ Nigeria track
            </Badge>
            <h2 className="text-h2 text-ink-900">For members at home</h2>
            <p className="text-body-lg text-grey-600">
              Billed in Naira by card, bank transfer or USSD. Cancel from the
              app, no phone call required.
            </p>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {ngTiers.map((t, i) => (
              <Reveal key={t.name} index={i}>
                <TierCard tier={t} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 3 — Diaspora track */}
      <section className="bg-white">
        <div className="mx-auto max-w-container px-5 py-section-y-lg md:px-10">
          <div className="grid max-w-[760px] gap-3.5">
            <Badge variant="trackUsd" className="justify-self-start">
              $ Diaspora track
            </Badge>
            <h2 className="text-h2 text-ink-900">For Nigerians abroad</h2>
            <p className="text-body-lg text-grey-600">
              Billed in USD by card or Apple Pay. Includes both matching pools —
              back home and within your diaspora community — and time-zone aware
              Gist scheduling.
            </p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {dpTiers.map((t, i) => (
              <Reveal key={t.name} index={i}>
                <TierCard tier={t} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 4 — Women's launch offer. 30 days of full Premium Plus, granted as a
             real entitlement at signup — not a coupon, not base Premium. */}
      <section id="women" className="bg-green-800 text-white">
        <div className="mx-auto grid max-w-container gap-10 px-5 py-section-y-lg md:px-10 lg:grid-cols-2 lg:gap-[72px]">
          <div className="grid content-start gap-5">
            <p className="text-caption font-semibold uppercase text-champagne">
              For women, from day one
            </p>
            <h2 className="text-h2 text-white">
              30 days of Premium Plus. On us.
            </h2>
            <p className="text-body-lg text-white/[.78]">
              Full access to live-video Gist and incognito mode, active on your
              account from the day you verify — no card, no code, nothing to
              cancel.
            </p>
            <p className="text-ui text-white/[.72]">
              It&rsquo;s part of how we think about safety and comfort for women
              getting started here, the same way verification and Coins are —
              not a coupon, just how the first 30 days work.
            </p>
          </div>

          <AccordionCard className="self-start border-green-500/40 bg-green-700">
            <Accordion type="single" collapsible>
              <AccordionItem value="women" className="border-b-0">
                <AccordionTrigger className="text-white hover:bg-green-800">
                  How does the women&rsquo;s free offer work?
                </AccordionTrigger>
                <AccordionContent className="text-white/[.72]">
                  When you verify as a woman, your account starts with 30 days
                  of Premium Plus already active — live-video Gist and incognito
                  mode included, no payment method on file. It ends
                  automatically after 30 days; from there you can move to any
                  paid tier or drop back to Starter, free forever.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </AccordionCard>
        </div>
      </section>

      {/* 5 — Coins.
             The prototype's next sentence reads: "On a genuine no-show, the
             coins that were staked go to a charity the other person chooses.
             Toastly does not keep a single kobo of it." OMITTED — the charity
             mechanic is rejected (PRD §5.5). A forfeited stake becomes a
             non-withdrawable stake credit for whoever showed up, and until
             that ships (Prompt 7) this page says nothing about where the
             coins go. The framing stays warm, never punitive. */}
      <section className="bg-paper">
        <div className="mx-auto max-w-container px-5 py-section-y-lg md:px-10">
          <div className="grid max-w-[760px] gap-5">
            <p className="text-caption font-semibold uppercase text-green-500">
              Coins
            </p>
            <h2 className="text-h2 text-ink-900">Showing up for each other.</h2>
            <p className="text-body-lg text-grey-600">
              Coins are not a subscription and they are not a fee. When a date
              is confirmed, you each stake a few. You both turn up, you both get
              them straight back. Somebody&rsquo;s plans change and they say so
              — everything comes back, no questions.
            </p>
            <p className="text-ui text-grey-600">
              This is a mutual promise about each other&rsquo;s time, not a
              penalty system.
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {coinPacks.map((c, i) => (
              <Reveal key={c.name} index={i}>
                <FeatureCard>
                  <h3 className="text-h5 text-ink-900">{c.name}</h3>
                  <p className="text-ui text-grey-600">{c.note}</p>
                  <p className="font-serif text-h4 text-green-500">{c.price}</p>
                </FeatureCard>
              </Reveal>
            ))}
          </div>

          <p className="mt-8 text-nav text-grey-600">
            Unused coins never expire. Refundable to your original payment
            method on request.
          </p>
        </div>
      </section>

      {/* 6 — Comparison */}
      <section className="bg-white">
        <div className="mx-auto max-w-container px-5 py-section-y-lg md:px-10">
          <PricingCompare />
        </div>
      </section>

      {/* 7 — Why pay */}
      <section className="bg-paper">
        <div className="mx-auto max-w-container px-5 py-section-y-lg md:px-10">
          <div className="grid max-w-[760px] gap-5">
            <p className="text-caption font-semibold uppercase text-green-500">
              Why pay
            </p>
            <h2 className="text-h2 text-ink-900">
              Free gets you verified. Paid gets you further, faster.
            </h2>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {whyPay.map((w, i) => (
              <Reveal key={w.title} index={i}>
                <FeatureCard>
                  <h3 className="text-h5 text-ink-900">{w.title}</h3>
                  <p className="text-ui text-grey-600">{w.body}</p>
                </FeatureCard>
              </Reveal>
            ))}
          </div>
          {/* Safety and verification are never paywalled (CLAUDE.md). */}
          <Card className="mt-8 bg-green-50 p-[26px]">
            <p className="text-ui text-ink-900">
              Every member is verified on every tier, and nothing about safety —
              reporting, blocking, photo-reveal control or sharing your date
              plans — ever sits behind a payment.
            </p>
          </Card>
        </div>
      </section>

      {/* 8 — CTA */}
      <section className="bg-green-800 text-white">
        <div className="mx-auto grid max-w-container gap-5 px-5 py-section-y-lg md:px-10">
          <h2 className="max-w-[24ch] text-h2 text-white">
            Start your journey today — your person is already verified.
          </h2>
          <div className="flex flex-wrap gap-3">
            <Button variant="onDarkPrimary" asChild>
              <Link href="/signup">Start free</Link>
            </Button>
            <Button variant="onDarkSecondary" asChild>
              <Link href="/how-it-works">See how it works</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}

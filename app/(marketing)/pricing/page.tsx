import type { Metadata } from "next";
import Link from "next/link";
// badgeVariants rather than <Badge>: <Badge> runs its classes through cn(),
// whose tailwind-merge drops the custom `text-chip` size against the colour
// class, so every chip renders at 16px. The cva output is the design-system
// chip exactly.
import { badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionCard,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { VerifiedSeal } from "@/components/ui/verified-seal";
import { PricingCompare } from "@/components/pricing-compare";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "@/components/section-parts";
import { cn } from "@/lib/utils";
import {
  coinIntro,
  coinNoShow,
  coinPacks,
  coinTerms,
  dpTiers,
  ngTiers,
  whyPay,
  whyPayNote,
  type Tier,
} from "@/lib/pricing-content";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Two separate tracks: Naira for members in Nigeria, USD for the diaspora. Starter is free forever. Coins for date commitments are bought separately and come back to you when you show up.",
  alternates: { canonical: "/pricing" },
};

/**
 * The three card tones in pricing-offer.slim.html: light (white on white),
 * dark (deep green, teal border, amber action) and glass (translucent deep
 * green on the forest ground, champagne action).
 */
const TONE = {
  light: {
    card: "border-ink-900/[.14] bg-white text-ink-900",
    muted: "text-grey-600",
    rule: "border-ink-900/10",
    tick: "text-green-500",
    button: "outline",
  },
  dark: {
    card: "border-green-500 bg-green-800 text-white",
    muted: "text-white/[.66]",
    rule: "border-white/[.14]",
    tick: "text-gold-500",
    button: "onDarkPrimary",
  },
  glass: {
    card: "border-champagne/[.28] bg-green-800/[.45] text-white",
    muted: "text-white/[.66]",
    rule: "border-white/[.14]",
    tick: "text-champagne",
    button: "onDarkSecondary",
  },
} as const;

function TierCard({ tier }: { tier: Tier }) {
  const t = TONE[tier.tone];
  return (
    <article
      className={cn(
        "grid content-start gap-[18px] rounded-xl border p-[clamp(24px,3vw,32px)]",
        t.card,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-h5">{tier.name}</h3>
        {tier.flag ? (
          <span className={badgeVariants({ variant: "tier" })}>{tier.flag}</span>
        ) : null}
      </div>

      {/* Size and colour are joined by hand here, not with cn():
          tailwind-merge reads the custom `text-ui` as a colour and drops it. */}
      <p className="font-serif text-h3 font-bold leading-none tracking-[-0.015em]">
        {tier.price}
        <span className={`font-sans text-ui font-normal tracking-normal ${t.muted}`}>
          {tier.per}
        </span>
      </p>

      <p className={`text-ui ${t.muted}`}>{tier.for}</p>

      <ul className={cn("grid list-none gap-[11px] border-t p-0 pt-[18px]", t.rule)}>
        {tier.features.map((f) => (
          <li key={f} className="grid grid-cols-[auto_1fr] gap-[11px] text-ui">
            <span aria-hidden="true" className={cn("font-bold", t.tick)}>
              &#10003;
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <Button variant={t.button} asChild className="mt-1 w-full">
        <Link href="/signup">{tier.cta}</Link>
      </Button>
    </article>
  );
}

/**
 * Pricing — built against design/prototype/pricing-offer.slim.html, in its
 * section order: Header, Nigeria track, Diaspora track, Women's offer, Coins,
 * Compare, Why pay, CTA. The ₦ and $ tracks are separate sections and the
 * comparison shows one track at a time — never one blended table.
 */
export default function PricingPage() {
  return (
    <>
      {/* 1 — Header. A centred 860px column, as drawn. */}
      <section className="bg-green-800 text-white">
        <div className="mx-auto grid max-w-[860px] gap-[22px] px-section-x pb-[clamp(44px,6vw,80px)] pt-section-y-lg">
          <Eyebrow tone="champagne">Pricing</Eyebrow>
          <h1 className="text-display text-white">
            Simple, honest pricing — no games, no hidden fees.
          </h1>
          <p className="max-w-[58ch] text-body-lg text-white/[.76]">
            Two separate tracks: Naira for members in Nigeria, USD for the
            diaspora. Coins for date commitments are bought separately and are
            never a subscription — they come back to you when you show up.
          </p>
        </div>
      </section>

      {/* 2 — Nigeria track */}
      <section aria-labelledby="p-ng" className="bg-white">
        <div className="mx-auto grid max-w-container gap-[clamp(28px,4vw,40px)] px-section-x py-section-y">
          <Reveal className="grid max-w-[600px] gap-3.5">
            <span
              className={`${badgeVariants({ variant: "trackNgn" })} justify-self-start uppercase`}
            >
              ₦ Nigeria track
            </span>
            <h2 id="p-ng" className="text-h2">
              For members at home
            </h2>
            {/* "bank transfer" in the prototype: "transfer" is a banned word
                in product copy (PRD §5.5, CLAUDE.md). */}
            <p className="text-body text-grey-600">
              Billed in Naira by card, bank or USSD. Cancel from the app, no
              phone call required.
            </p>
          </Reveal>
          <Reveal className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,290px),1fr))] items-start gap-[18px]">
            {ngTiers.map((t) => (
              <TierCard key={t.name} tier={t} />
            ))}
          </Reveal>
        </div>
      </section>

      {/* 3 — Diaspora track, on the forest ground. */}
      <section aria-labelledby="p-dia" className="bg-green-700 text-white">
        <div className="mx-auto grid max-w-container gap-[clamp(28px,4vw,40px)] px-section-x py-section-y">
          <Reveal className="grid max-w-[620px] gap-3.5">
            {/* The track chip's shape and type, in amber as drawn here — the
                design system's teal USD chip would vanish on the forest
                ground. */}
            <span className="inline-flex items-center justify-self-start whitespace-nowrap rounded-sm bg-gold-500 px-3 py-1.5 font-sans text-chip font-semibold uppercase tracking-[0.04em] text-green-800">
              $ Diaspora track
            </span>
            <h2 id="p-dia" className="text-h2 text-white">
              For Nigerians abroad
            </h2>
            <p className="text-body text-white/[.74]">
              Billed in USD by card or Apple Pay. Includes both matching pools —
              back home and within your diaspora community — and time-zone aware
              Gist scheduling.
            </p>
          </Reveal>
          <Reveal className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-start gap-[18px]">
            {dpTiers.map((t) => (
              <TierCard key={t.name} tier={t} />
            ))}
          </Reveal>
        </div>
      </section>

      {/* 4 — Women's launch offer (pricing-offer). 30 days of full Premium
             Plus — or Diaspora Plus for women abroad (PRD §7) — granted as a
             real entitlement, not a coupon, not base Premium. */}
      <section
        id="women"
        aria-labelledby="p-women"
        className="border-y border-champagne/25 bg-green-800 text-white"
      >
        <div className="mx-auto grid max-w-container grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] items-start gap-[clamp(32px,4vw,56px)] px-section-x py-[clamp(52px,7vw,88px)]">
          <Reveal className="grid max-w-[560px] gap-[18px]">
            <span className="inline-flex items-center gap-[9px] justify-self-start rounded-pill border border-champagne/[.34] px-[15px] py-2 text-caption text-champagne">
              <VerifiedSeal size={15} className="text-gold-500" />
              For women, from day one
            </span>
            <h2 id="p-women" className="text-h3 text-white">
              30 days of Premium Plus. On us.
            </h2>
            <p className="text-body-lg text-white/[.78]">
              Women get 30 days of Premium Plus free — or Diaspora Plus if you
              live abroad. No card needed.
            </p>
            <p className="text-ui text-white/60">
              It&rsquo;s part of how we think about safety and comfort for women
              getting started here, the same way verification and Coins are —
              not a coupon, just how the first 30 days work.
            </p>
          </Reveal>

          <Reveal>
            {/* text-nav-lg sits on the card so the trigger inherits 17px:
                the trigger's own size class is lost to tailwind-merge when a
                colour is passed in. The answer sets its own size on a <p>. */}
            <AccordionCard className="border-champagne/30 bg-green-700/50 text-nav-lg">
              <Accordion type="single" collapsible>
                <AccordionItem value="women" className="border-b-0">
                  <AccordionTrigger className="px-6 py-[22px] text-white hover:bg-champagne/[.08] [&>span]:h-6 [&>span]:w-6 [&>span]:border-champagne/[.35] [&>span]:text-champagne">
                    How does the women&rsquo;s free offer work?
                  </AccordionTrigger>
                  <AccordionContent className="px-6 pb-6">
                    <p className="text-ui text-white/[.74]">
                      When you verify as a woman, your account starts with 30
                      days of Premium Plus already active — or Diaspora Plus if
                      you live abroad — with no payment method on file. It ends
                      automatically after 30 days; from there you can move to
                      any paid tier or drop back to Starter, free forever.
                    </p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </AccordionCard>
          </Reveal>
        </div>
      </section>

      {/* 5 — Coins. Copy and the reasons for its corrections are in
             lib/pricing-content. Warm framing, never punitive. */}
      <section aria-labelledby="p-coins" className="bg-paper">
        <div className="mx-auto grid max-w-container grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] items-center gap-[clamp(30px,4vw,52px)] px-section-x py-section-y">
          <Reveal className="grid max-w-[560px] gap-5">
            <Eyebrow>Coins</Eyebrow>
            <h2 id="p-coins" className="text-h3">
              Showing up for each other.
            </h2>
            <p className="text-body-lg text-grey-600">{coinIntro}</p>
            <p className="text-body text-grey-600">
              {coinNoShow.lead}
              <em>{coinNoShow.emphasis}</em>
              {coinNoShow.rest}
            </p>
          </Reveal>
          <Reveal className="grid gap-3.5">
            {coinPacks.map((c) => (
              <div
                key={c.name}
                className="flex flex-wrap items-center justify-between gap-3.5 rounded-xl border border-ink-900/[.12] bg-white px-6 py-[22px]"
              >
                <div>
                  <p className="font-serif text-h5">{c.name}</p>
                  <p className="mt-1 text-nav text-grey-600">{c.note}</p>
                </div>
                <p className="text-h5 font-semibold tabular-nums">{c.price}</p>
              </div>
            ))}
            <p className="text-nav text-grey-600">{coinTerms}</p>
          </Reveal>
        </div>
      </section>

      {/* 6 — Comparison, one track at a time */}
      <section
        aria-labelledby="p-compare"
        className="border-t border-ink-900/[.08] bg-white"
      >
        <div className="mx-auto max-w-container px-section-x py-section-y">
          <PricingCompare />
        </div>
      </section>

      {/* 7 — Why pay */}
      <section aria-labelledby="p-why" className="bg-paper">
        <div className="mx-auto grid max-w-container gap-[clamp(24px,3vw,40px)] px-section-x py-section-y">
          <Reveal className="grid max-w-measure gap-4">
            <Eyebrow>Why pay</Eyebrow>
            <h2 id="p-why" className="text-h3">
              Free gets you verified. Paid gets you further, faster.
            </h2>
          </Reveal>
          <Reveal className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-4">
            {whyPay.map((w) => (
              <article
                key={w.title}
                className="grid content-start gap-3 rounded-xl border border-ink-900/[.12] bg-white p-[26px]"
              >
                <h3 className="text-h5">{w.title}</h3>
                <p className="text-ui text-grey-600">{w.body}</p>
              </article>
            ))}
          </Reveal>
          {/* Safety and verification are never paywalled (CLAUDE.md). */}
          <Reveal>
            <p className="max-w-[70ch] text-body text-grey-600">{whyPayNote}</p>
          </Reveal>
        </div>
      </section>

      {/* 8 — CTA, centred */}
      <section className="bg-green-800 text-white">
        <Reveal className="mx-auto grid max-w-[960px] justify-items-center gap-[26px] px-section-x py-[clamp(56px,8vw,116px)] text-center">
          <h2 className="max-w-[26ch] text-h2 text-white">
            Start your journey today — your person is already verified.
          </h2>
          {/* Both go to sign-up, like every join action on the site; the
              prototype's targets (How It Works, Diaspora) were placeholders. */}
          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="onDarkPrimary" asChild>
              <Link href="/signup">Get started in Nigeria (₦)</Link>
            </Button>
            <Button variant="onDarkSecondary" asChild>
              <Link href="/signup">Get started abroad ($)</Link>
            </Button>
          </div>
          <Link
            href="/safety#verification"
            className="inline-flex min-h-11 items-center text-ui text-white/70 no-underline hover:text-white"
          >
            <span className="border-b border-white/30 pb-0.5">
              Read how verification works first
            </span>
          </Link>
        </Reveal>
      </section>
    </>
  );
}

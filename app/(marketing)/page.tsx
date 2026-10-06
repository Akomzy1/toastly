import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, FeatureCard } from "@/components/ui/card";
import { PhotoFrame } from "@/components/ui/photo-frame";
import { Avatar } from "@/components/ui/avatar";
import { VerifiedSeal } from "@/components/ui/verified-seal";
import { HeroVideo } from "@/components/hero-video";
import { Reveal } from "@/components/reveal";
import { ArrowLink, Eyebrow } from "@/components/section-parts";
import { PRIVACY_PUBLISHED } from "@/lib/privacy-content";
import {
  aiPledge,
  coinCards,
  coinNote,
  gistPrompts,
  heroStats,
  journey,
  posts,
  profileChips,
  promptCards,
  pwaStats,
  steps,
  testimonials,
  verifyStats,
  verifySteps,
} from "@/lib/home-content";

export const metadata: Metadata = {
  // `absolute` bypasses the root "%s · Toastly" template — without it the
  // home page reads "Toastly — ... · Toastly".
  title: {
    absolute: "Toastly — verified Nigerian dating, all the way to the aisle",
  },
  description:
    "Verified people, real intentions. Voice-first Gist sessions, six matches a day, no swiping — and a path that runs from your first Gist to AriyaPlanner when it's time to plan the wedding.",
  alternates: { canonical: "/" },
};

/** Two-column split that wraps to one column below ~2 × min width. */
const SPLIT_400 =
  "grid-cols-[repeat(auto-fit,minmax(min(100%,400px),1fr))]";

/**
 * Home — built against design/prototype/home-diaspora-offer.slim.html, in
 * its section order: Hero (with "Tonight on Toastly"), Verified Real, Gist,
 * Coin deposit, How it works, Matching, Optional fields, Who it's for, PWA,
 * CTA mid, Diaspora, Journey, AI pledge, Testimonials, Blog, Final CTA.
 */
export default function HomePage() {
  return (
    <>
      {/* 1 — Hero. The video is the prototype's; it stays. */}
      <section className="relative overflow-hidden bg-green-800 text-white">
        <div aria-hidden="true" className="absolute inset-0">
          <HeroVideo className="h-full w-full object-cover" />
        </div>
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(100deg,var(--tw-gradient-stops))] from-green-800 from-0% via-green-800/[.42] via-40% to-green-700/[.18] to-100%"
        />
        <div className="relative mx-auto grid max-w-container grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] items-center gap-[clamp(40px,5vw,64px)] px-section-x pb-[clamp(56px,7vw,104px)] pt-[clamp(64px,10vw,132px)]">
          <Reveal className="grid max-w-measure gap-[26px]">
            <span className="inline-flex items-center gap-[9px] justify-self-start rounded-pill border border-champagne/[.34] px-[15px] py-2 text-caption text-champagne">
              <VerifiedSeal size={15} className="text-gold-500" />
              Every profile verified before it goes live
            </span>
            <h1 className="text-display text-white">
              For Nigerians who are done wasting time.
            </h1>
            <p className="max-w-[52ch] text-body-lg text-white/[.78]">
              Verified people. Real intentions. A path that runs from your first
              Gist all the way to the aisle — and hands you over to AriyaPlanner
              when it&rsquo;s time to plan the wedding.
            </p>
            <div className="mt-1.5 flex flex-wrap gap-3">
              <Button variant="onDarkPrimary" asChild>
                <Link href="/pricing">Install Toastly free</Link>
              </Button>
              <Button variant="onDarkSecondary" asChild>
                <Link href="/how-it-works">See how it works</Link>
              </Button>
            </div>
            <p className="mt-1.5 text-nav text-white/[.55]">
              Installs from the browser in seconds. 4MB, works on low-end
              Android, no app store needed.
            </p>
          </Reveal>

          {/* 2 — Tonight on Toastly: a glass card inside the hero. */}
          <Reveal>
            <div className="grid gap-[18px] rounded-xl border border-champagne/[.24] bg-green-700/[.55] p-[26px] backdrop-blur-[6px]">
              <Eyebrow tone="champagne">Tonight on Toastly</Eyebrow>
              <dl className="grid gap-[18px]">
                {heroStats.map((s) => (
                  <div
                    key={s.label}
                    className="flex items-baseline justify-between gap-5 border-b border-white/10 pb-3.5"
                  >
                    <dt className="max-w-[22ch] text-ui text-white/[.72]">
                      {s.label}
                    </dt>
                    <dd className="font-serif text-h4 tabular-nums text-white">
                      {s.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-caption font-normal tracking-normal text-white/50">
                Numbers refresh weekly. No bots, no imported profiles, no ghost
                accounts.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 3 — Verified Real */}
      <section
        aria-labelledby="h-verified"
        className="bg-green-700 text-white"
      >
        <div
          className={`mx-auto grid max-w-container ${SPLIT_400} items-center gap-[clamp(36px,5vw,72px)] px-section-x py-section-y-lg`}
        >
          <Reveal className="grid max-w-[560px] gap-[22px]">
            <Eyebrow tone="champagne">The trust layer</Eyebrow>
            <h2 id="h-verified" className="text-h2 text-white">
              Catfish don&rsquo;t make it past the front door.
            </h2>
            <p className="text-body-lg text-white/[.76]">
              Nobody sees your face until we&rsquo;ve seen theirs. Phone and
              selfie-liveness verification are mandatory for every single
              account — and if you want to go further, NIN or BVN adds a second
              ring to your seal.
            </p>
            <ol className="mt-1.5 grid list-none gap-0.5 p-0">
              {verifySteps.map((v) => (
                <li
                  key={v.n}
                  className="grid grid-cols-[auto_1fr] gap-4 border-t border-white/[.12] py-[18px]"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-pill border border-champagne/40 font-serif text-ui font-bold text-champagne">
                    {v.n}
                  </span>
                  <div>
                    <p className="text-nav-lg font-semibold">{v.title}</p>
                    <p className="mt-1 text-ui text-white/[.68]">{v.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <ArrowLink href="/safety#verification" onDark>
              How verification works
            </ArrowLink>
          </Reveal>

          <Reveal className="grid gap-4">
            <PhotoFrame ratio="4/5">
              <Image
                src="/img/home/hero-verification.webp"
                // The prototype's alt opened "Placeholder:" — scaffolding
                // text, not alt copy.
                alt="A young Nigerian woman on a Lagos street, phone in hand, mid-verification"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover opacity-[.88]"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-b from-green-800/0 from-45% to-green-800/[.85]"
              />
              <div className="absolute bottom-5 left-5 right-5 flex items-center gap-3 rounded-lg border border-champagne/[.28] bg-green-800/[.82] px-4 py-3.5 backdrop-blur-[8px]">
                <VerifiedSeal size={30} className="text-gold-500" />
                <div>
                  <p className="text-nav font-semibold text-white">
                    Verified Real · Adaeze, 26
                  </p>
                  <p className="mt-0.5 text-caption font-normal tracking-normal text-white/[.62]">
                    Phone + liveness · NIN confirmed
                  </p>
                </div>
              </div>
            </PhotoFrame>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
              {verifyStats.map((s) => (
                <div
                  key={s.label}
                  className="rounded-lg border border-champagne/[.22] p-4"
                >
                  <p className="font-serif text-h5">{s.value}</p>
                  <p className="mt-1 text-caption font-normal tracking-normal text-white/[.62]">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* 4 — Gist. Copy first, then the session card, at every width. */}
      <section aria-labelledby="h-gist" className="bg-white">
        <div
          className={`mx-auto grid max-w-container ${SPLIT_400} items-center gap-[clamp(36px,5vw,72px)] px-section-x py-section-y-lg`}
        >
          <Reveal className="grid max-w-[560px] gap-[22px]">
            <Eyebrow>Gist</Eyebrow>
            <h2 id="h-gist" className="text-h2">
              Hear them before you meet them.
            </h2>
            <p className="text-body-lg text-grey-600">
              A Gist is a structured voice session with a start, an end and
              something to talk about. Three of them, and you know whether this
              is going anywhere — no three weeks of texting, no blank video call
              where you both stare and say &ldquo;so&rdquo;.
            </p>
            <ul className="grid list-none gap-3 p-0">
              {[
                "Voice first, so tone does the work photos can’t.",
                "Prompts written for Nigerian dating, not translated from California.",
                "Live video unlocks on Premium Plus, when you both want it.",
              ].map((t) => (
                <li key={t} className="flex gap-3 text-body text-ink-900">
                  <span aria-hidden="true" className="font-bold text-green-500">
                    —
                  </span>
                  {t}
                </li>
              ))}
            </ul>
            <Button variant="outline" asChild className="justify-self-start">
              <Link href="/features#feature-03">Explore Gist sessions</Link>
            </Button>
          </Reveal>

          <Reveal>
            <div className="grid gap-5 rounded-xl border border-ink-900/[.12] bg-paper p-[clamp(22px,3vw,30px)]">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="flex-shrink-0">
                    <circle cx="12" cy="12" r="2.1" className="fill-green-500" />
                    <path d="M7.4 8.4a6.4 6.4 0 0 0 0 7.2M4.3 5.6a10.6 10.6 0 0 0 0 12.8" className="stroke-green-500" strokeWidth="1.3" strokeLinecap="round" />
                    <path d="M16.6 8.4a6.4 6.4 0 0 1 0 7.2M19.7 5.6a10.6 10.6 0 0 1 0 12.8" className="stroke-green-300" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                  <div>
                    <p className="text-ui font-semibold">Gist session 2 of 3</p>
                    <p className="mt-0.5 text-caption font-normal tracking-normal text-grey-400">
                      Voice · 18 minutes · Tuesday, 8:30pm
                    </p>
                  </div>
                </div>
                <span className="rounded-sm bg-green-50 px-3 py-1.5 text-chip font-semibold text-green-550">
                  Guided
                </span>
              </div>
              <ol className="grid list-none gap-2.5 p-0">
                {gistPrompts.map((p) => (
                  <li
                    key={p.n}
                    className="grid grid-cols-[auto_1fr] items-start gap-3 rounded-lg border border-ink-900/10 bg-white px-4 py-[15px]"
                  >
                    <span className="font-serif text-nav font-bold text-green-500">
                      {p.n}
                    </span>
                    <p className="text-ui text-ink-900">{p.text}</p>
                  </li>
                ))}
              </ol>
              <p className="text-caption font-normal tracking-normal text-grey-600">
                Prompts are drawn from what you both wrote. Nobody has to open
                with &ldquo;hi how are you&rdquo;.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 5 — Coin deposit */}
      <section
        aria-labelledby="h-coins"
        className="border-t border-ink-900/[.08] bg-paper"
      >
        <div className="mx-auto grid max-w-container gap-[clamp(32px,4vw,56px)] px-section-x py-section-y-lg">
          <Reveal className="grid max-w-[720px] gap-5">
            <Eyebrow>Showing up for each other</Eyebrow>
            <h2 id="h-coins" className="text-h2">
              A small promise, staked by both of you.
            </h2>
            <p className="text-body-lg text-grey-600">
              When a date is confirmed, you each put down a few coins. You both
              show up, you both get them back. Plans change and you say so in
              time — nothing happens. It isn&rsquo;t a fine. It&rsquo;s the
              Nigerian version of &ldquo;I&rsquo;ll be there&rdquo;, written
              down.
            </p>
          </Reveal>
          <Reveal className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-4">
            {coinCards.map((c) => (
              <FeatureCard key={c.title}>
                <p className="font-serif text-h4 text-green-500">{c.stat}</p>
                <h3 className="font-sans text-nav-lg font-semibold">{c.title}</h3>
                <p className="text-ui text-grey-600">{c.body}</p>
              </FeatureCard>
            ))}
          </Reveal>
          {/* The prototype's callout sends a no-show's coins to "a charity
              the other person picks". Rejected (PRD §5.5): the stake goes to
              the member who showed up, Toastly keeps none, and a safety
              cancellation always returns the stake. See lib/home-content. */}
          <Reveal>
            <p className="max-w-[760px] rounded-r-lg border-l-2 border-gold-500 bg-white px-6 py-5 text-ui text-grey-600">
              {coinNote.lead}
              <em>{coinNote.emphasis}</em>
              {coinNote.rest}
            </p>
          </Reveal>
        </div>
      </section>

      {/* 6 — How it works */}
      <section
        aria-labelledby="h-how"
        className="border-t border-ink-900/[.08] bg-white"
      >
        <div className="mx-auto grid max-w-container gap-[clamp(32px,4vw,56px)] px-section-x py-section-y-lg">
          <Reveal className="flex flex-wrap items-end justify-between gap-6">
            <div className="grid max-w-[560px] gap-4">
              <Eyebrow>Three steps in</Eyebrow>
              <h2 id="h-how" className="text-h2">
                Verified, matched, gisting — inside a week.
              </h2>
            </div>
            <ArrowLink href="/how-it-works">The full six steps</ArrowLink>
          </Reveal>
          <Reveal>
            <ol className="grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-5 p-0">
              {steps.map((s) => (
                <li key={s.n} className="grid content-start gap-[18px]">
                  <PhotoFrame ratio="4/3">
                    <Image
                      src={s.img}
                      alt={s.alt}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover opacity-[.92]"
                    />
                    <span className="absolute left-3.5 top-3.5 grid h-[38px] w-[38px] place-items-center rounded-pill bg-gold-500 font-serif text-nav-lg font-bold text-green-800">
                      {s.n}
                    </span>
                  </PhotoFrame>
                  <div className="grid gap-2">
                    <h3 className="text-h5">{s.title}</h3>
                    <p className="text-ui text-grey-600">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </section>

      {/* 7 — Matching */}
      <section
        aria-labelledby="h-match"
        className="border-t border-ink-900/[.08] bg-paper"
      >
        <div
          className={`mx-auto grid max-w-container ${SPLIT_400} items-center gap-[clamp(36px,5vw,72px)] px-section-x py-section-y-lg`}
        >
          <Reveal className="grid max-w-[560px] gap-[22px]">
            <Eyebrow>Matching</Eyebrow>
            <h2 id="h-match" className="text-h2">
              Nothing to swipe. Six people a day.
            </h2>
            <p className="text-body-lg text-grey-600">
              Your feed arrives once a day and it&rsquo;s short on purpose. Each
              person comes with their answers to the same prompts you answered,
              so you&rsquo;re reading intentions, not scoring faces. When the
              six are gone, they&rsquo;re gone — go and live your life.
            </p>
            <p className="text-ui text-grey-600">
              You reply to a specific answer to start something. There&rsquo;s
              no infinite deck, no streaks, no &ldquo;you&rsquo;ve been
              super-liked&rdquo;.
            </p>
          </Reveal>
          <Reveal className="grid gap-3">
            {promptCards.map((p) => (
              <Card key={p.name} interactive className="grid gap-3 p-[22px]">
                <div className="flex items-center gap-3">
                  <Avatar src={p.img} alt={p.alt} size={46} />
                  <div className="flex-1">
                    <p className="flex items-center gap-[7px] text-ui font-semibold">
                      {p.name}
                      <VerifiedSeal size={15} className="text-green-500" />
                    </p>
                    <p className="mt-0.5 text-caption font-normal tracking-normal text-grey-400">
                      {p.meta}
                    </p>
                  </div>
                </div>
                <div className="rounded-lg bg-paper px-4 py-3.5">
                  <p className="text-chip font-semibold uppercase tracking-[0.06em] text-green-500">
                    {p.prompt}
                  </p>
                  <p className="mt-1.5 font-serif text-nav-lg leading-normal">
                    {p.answer}
                  </p>
                </div>
              </Card>
            ))}
          </Reveal>
        </div>
      </section>

      {/* 8 — Optional fields. Dashed chips: display-only, never filters. */}
      <section
        aria-labelledby="h-culture"
        className="border-t border-ink-900/[.08] bg-white"
      >
        <div className="mx-auto grid max-w-container grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-start gap-[clamp(32px,4vw,48px)] px-section-x py-section-y-lg">
          <Reveal className="grid max-w-[560px] gap-5">
            <Eyebrow>Yours to share</Eyebrow>
            <h2 id="h-culture" className="text-h2">
              Tribe, language, faith — if you want them there.
            </h2>
            <p className="text-body-lg text-grey-600">
              These matter to a lot of Nigerian families, so they&rsquo;re on
              your profile if you choose to put them there. Toastly is not a
              religious platform and none of these fields are used to filter
              anybody&rsquo;s feed. They&rsquo;re something to talk about, never
              a gate.
            </p>
          </Reveal>
          <Reveal>
            <div className="grid gap-[18px] rounded-xl border border-ink-900/[.12] bg-paper p-[clamp(24px,3vw,32px)]">
              <p className="text-caption font-semibold uppercase tracking-[0.1em] text-grey-600">
                On Tobi&rsquo;s profile
              </p>
              <div className="flex flex-wrap gap-[9px]">
                {/* The Badge "optional" chip, drawn larger and on white here
                    as the prototype does. Written out rather than passed to
                    <Badge className>: cn() would drop text-nav against the
                    colour class and the chips would render at 16px. Dashed
                    on purpose — display-only, never a filter. */}
                {profileChips.map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center rounded-sm border border-dashed border-ink-900/[.26] bg-white px-3.5 py-2 text-nav font-medium text-ink-900"
                  >
                    {c}
                  </span>
                ))}
              </div>
              <p className="text-nav text-grey-600">
                Every one of these can be hidden with a single toggle, at any
                time, without affecting who you see.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 9 — Who it's for: one split panel, light half and dark half. */}
      <section
        aria-labelledby="h-who"
        className="border-t border-ink-900/[.08] bg-paper"
      >
        <div className="mx-auto max-w-container px-section-x py-[clamp(56px,8vw,104px)]">
          <Reveal className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] overflow-hidden rounded-xl">
            <div className="grid content-start gap-[18px] bg-white p-[clamp(30px,4vw,52px)]">
              <Eyebrow>Who Toastly is for</Eyebrow>
              <h2 id="h-who" className="max-w-[16ch] text-h2">
                Real life comes with history. Bring yours.
              </h2>
              <p className="max-w-[44ch] text-body-lg text-grey-600">
                Single, divorced, widowed, raising kids — none of that is a
                footnote you have to explain away here. What matters is where
                you&rsquo;re going and who you want beside you when you get
                there.
              </p>
            </div>
            <div className="grid content-start gap-[18px] bg-green-800 p-[clamp(30px,4vw,52px)] text-white">
              <Eyebrow tone="gold">And who it isn&rsquo;t</Eyebrow>
              <h3 className="max-w-[18ch] text-h3 text-white">
                And if you&rsquo;re married, this isn&rsquo;t the place.
              </h3>
              <p className="max-w-[44ch] text-body-lg text-white/[.78]">
                Toastly is for people who are free to build something. Nothing
                about this app works if one of you is already spoken for — so
                married people are not welcome here, full stop.
              </p>
              {/* Enforced by report-and-remove. Never implies Toastly verifies
                  marital status — it cannot be, and conflating it with
                  Verified Real would undermine a claim that is genuinely
                  verifiable. */}
              <p className="mt-1.5 max-w-[46ch] border-t border-champagne/[.26] pt-[18px] text-ui text-white/[.66]">
                It&rsquo;s a rule we enforce, not a box we can tick. Report
                anyone who isn&rsquo;t honest about it and we&rsquo;ll act on
                it.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 10 — PWA */}
      <section aria-labelledby="h-pwa" className="bg-green-700 text-white">
        <div className="mx-auto grid max-w-container gap-[clamp(32px,4vw,56px)] px-section-x py-[clamp(56px,8vw,104px)]">
          <Reveal className="grid max-w-[680px] gap-[18px]">
            <Eyebrow tone="champagne">Built for Nigerian phones</Eyebrow>
            <h2 id="h-pwa" className="text-h2 text-white">
              4MB. No app store. No 2GB of data gone.
            </h2>
            <p className="text-body-lg text-white/[.76]">
              Toastly installs straight from your browser and sits on your home
              screen like any other app. It runs on a Tecno from 2019, it opens
              on 3G, and Gist audio is compressed to about a quarter of what a
              voice note usually costs you.
            </p>
          </Reveal>
          <Reveal>
            <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-4">
              {pwaStats.map((s) => (
                <div
                  key={s.label}
                  className="grid content-start gap-2 border-t border-champagne/30 pt-[18px]"
                >
                  <dt className="font-serif text-h3 text-champagne">{s.value}</dt>
                  <dd className="text-ui text-white/70">{s.label}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </section>

      {/* 11 — CTA mid: a contained dark card on paper. */}
      <section className="border-t border-ink-900/[.08] bg-paper">
        <div className="mx-auto max-w-container px-section-x py-[clamp(48px,6vw,88px)]">
          <Reveal>
            <div className="relative overflow-hidden rounded-xl bg-green-800 text-white">
              <div aria-hidden="true" className="absolute inset-0">
                <Image
                  src="/img/home/cta-mid-bg.webp"
                  alt=""
                  fill
                  sizes="(max-width: 1280px) 100vw, 1280px"
                  className="object-cover opacity-30"
                />
              </div>
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-[linear-gradient(95deg,var(--tw-gradient-stops))] from-green-800 from-25% to-green-800/60"
              />
              <div className="relative grid max-w-measure gap-6 p-[clamp(36px,5vw,68px)]">
                <h2 className="text-h3 text-white">Ready to find your person?</h2>
                <p className="text-body-lg text-white/[.78]">
                  42,000 verified Nigerians are already on here, gisting
                  tonight. Verification takes about four minutes.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button variant="onDarkPrimary" asChild>
                    <Link href="/pricing">Install Toastly free</Link>
                  </Button>
                  <Button variant="onDarkSecondary" asChild>
                    <Link href="/stories">Read their stories</Link>
                  </Button>
                </div>
                <p className="text-nav text-white/[.66]">
                  Women get 30 days of Premium Plus free — or Diaspora Plus if
                  you live abroad. No card needed.{" "}
                  {/* py-[13.5px]: 44px hit area on an inline link, no visual change. */}
                  <Link
                    href="/pricing#women"
                    className="py-[13.5px] text-champagne no-underline hover:text-champagne"
                  >
                    <span className="border-b border-champagne/40">
                      See how it works
                    </span>
                  </Link>
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 12 — Diaspora: photo first, then copy. */}
      <section
        aria-labelledby="h-dia"
        className="border-t border-ink-900/[.08] bg-white"
      >
        <div className="mx-auto grid max-w-container grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] items-center gap-[clamp(36px,5vw,64px)] px-section-x py-[clamp(56px,8vw,104px)]">
          <Reveal>
            <PhotoFrame ratio="16/11">
              <Image
                src="/img/home/diaspora-call.webp"
                alt="A Nigerian woman in London laughing during an evening video call"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover opacity-[.92]"
              />
            </PhotoFrame>
          </Reveal>
          <Reveal className="grid max-w-[520px] gap-5">
            <Eyebrow>The diaspora bridge</Eyebrow>
            <h2 id="h-dia" className="text-h3">
              In London, matching in Lagos.
            </h2>
            {/* PRD §5.6: back home on any plan; the diaspora community on a
                Diaspora plan. */}
            <p className="text-body-lg text-grey-600">
              Abroad? Match back home on any plan — and with Nigerians in your
              own city on a Diaspora plan. Gist scheduling does the time-zone
              maths for you, and the diaspora track is priced in USD.
            </p>
            <Button variant="outline" asChild className="justify-self-start">
              <Link href="/diaspora">Diaspora matching</Link>
            </Button>
          </Reveal>
        </div>
      </section>

      {/* 13 — Journey. Its own treatment: the dashed path with four
             markers, then the four stations. */}
      <section
        aria-labelledby="h-journey"
        className="relative overflow-hidden bg-green-800 text-white"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(120%_70%_at_50%_0%,var(--tw-gradient-stops))] from-green-500/50 from-0% to-green-800/0 to-70%"
        />
        <div className="relative mx-auto max-w-container px-section-x py-[clamp(64px,9vw,124px)]">
          <Reveal className="mb-[clamp(40px,5vw,64px)] grid max-w-[720px] gap-5">
            <Eyebrow tone="gold">The journey</Eyebrow>
            <h2 id="h-journey" className="text-h2 text-white">
              From Match to Marriage.
            </h2>
            <p className="text-body-lg text-white/[.78]">
              Every other app stops at the chat. Toastly is built as a path with
              four stations, and the last one is a wedding — planned in
              AriyaPlanner, introduction ceremony through white wedding.
            </p>
          </Reveal>
          <Reveal>
            <svg
              viewBox="0 0 1200 160"
              aria-hidden="true"
              className="-mb-[18px] block h-auto w-full"
            >
              <path
                d="M60 130C310 130 260 40 600 40s290 90 540 90"
                className="stroke-champagne/[.45]"
                strokeWidth="1.6"
                strokeDasharray="5 9"
                fill="none"
              />
              <circle cx="60" cy="130" r="7" className="fill-gold-500" />
              <circle cx="410" cy="53" r="7" className="fill-gold-500" />
              <circle cx="790" cy="53" r="7" className="fill-gold-500" />
              <path
                d="M1140 116l4.5 10 11 1.1-8 7.9 2 10.8-9.5-5.2-9.5 5.2 2-10.8-8-7.9 11-1.1z"
                className="fill-gold-500"
              />
            </svg>
          </Reveal>
          <Reveal>
            <ol className="grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-[18px] p-0">
              {journey.map((j) => (
                <li
                  key={j.n}
                  className="grid content-start gap-3 rounded-xl border border-champagne/[.24] bg-green-700/[.55] px-6 py-[26px] transition-all duration-250 ease-reveal hover:-translate-y-[3px] hover:border-gold-500/60 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  <p className="text-chip font-semibold uppercase tracking-[0.12em] text-champagne">
                    Station {j.n}
                  </p>
                  <h3 className="text-h5 text-white">{j.title}</h3>
                  <p className="text-ui text-white/[.72]">{j.body}</p>
                </li>
              ))}
            </ol>
          </Reveal>
          <Reveal className="mt-[clamp(32px,4vw,48px)]">
            <div className="flex flex-wrap items-center gap-3.5">
              <Button variant="onDarkPrimary" asChild>
                <Link href="/how-it-works">Walk the full journey</Link>
              </Button>
              {/* Free on EVERY tier including Starter — never gated. */}
              <p className="text-ui text-white/60">
                Couple Mode and the AriyaPlanner handoff are included on every
                plan, including Starter.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 14 — AI pledge (new in home-diaspora-offer). Agents in the
             infrastructure, never in the intimacy (PRD §5.9). The copy is in
             lib/home-content with the reason for its one change. */}
      <section aria-labelledby="h-ai" className="bg-white">
        <Reveal className="mx-auto flex max-w-container flex-wrap items-end justify-between gap-x-12 gap-y-6 px-section-x py-[clamp(44px,6vw,80px)]">
          <div className="grid max-w-[720px] gap-3.5">
            <Eyebrow>{aiPledge.eyebrow}</Eyebrow>
            <h2 id="h-ai" className="max-w-[20ch] text-h3 text-green-550">
              {aiPledge.title}
            </h2>
            <p className="max-w-[56ch] text-body-lg text-grey-600">
              {aiPledge.body}
            </p>
          </div>
          {/* The prototype links to a Features "f-ai" section that no
              prototype draws. The privacy policy's "How we use AI" section is
              the page that says it; the link follows that page's publish gate. */}
          {PRIVACY_PUBLISHED ? (
            <ArrowLink href="/privacy#how-we-use-ai">
              How Toastly uses AI
            </ArrowLink>
          ) : null}
        </Reveal>
      </section>

      {/* 15 — Testimonials */}
      <section aria-labelledby="h-test" className="bg-paper">
        <div className="mx-auto grid max-w-container gap-[clamp(32px,4vw,52px)] px-section-x py-section-y-lg">
          <Reveal className="grid max-w-[620px] gap-4">
            <Eyebrow>Stories</Eyebrow>
            <h2 id="h-test" className="text-h2">
              Three couples who stopped scrolling.
            </h2>
          </Reveal>
          <Reveal className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-5">
            {testimonials.map((t) => (
              <Card key={t.name} className="p-7">
                <figure className="grid content-start gap-5">
                  <blockquote className="font-serif text-body-lg leading-normal">
                    &ldquo;{t.quote}&rdquo;
                  </blockquote>
                  <figcaption className="flex items-center gap-3.5 border-t border-ink-900/10 pt-[18px]">
                    <Avatar src={t.img} alt={t.alt} size={52} />
                    <div>
                      <p className="flex items-center gap-[7px] text-ui font-semibold">
                        {t.name}
                        <VerifiedSeal size={15} className="text-green-500" />
                      </p>
                      <p className="mt-0.5 text-caption font-normal tracking-[0.04em] text-grey-400">
                        {t.meta}
                      </p>
                    </div>
                  </figcaption>
                </figure>
              </Card>
            ))}
          </Reveal>
        </div>
      </section>

      {/* 16 — Blog */}
      <section
        aria-labelledby="h-blog"
        className="border-t border-ink-900/[.08] bg-white"
      >
        <div className="mx-auto grid max-w-container gap-[clamp(28px,4vw,44px)] px-section-x py-[clamp(56px,8vw,104px)]">
          <Reveal className="flex flex-wrap items-end justify-between gap-5">
            <h2 id="h-blog" className="text-h3">
              Reading for the intentional
            </h2>
            {/* The prototype points "All writing" at Stories; there is no
                writing index yet. */}
            <ArrowLink href="/stories" arrow={false}>
              All writing
            </ArrowLink>
          </Reveal>
          <Reveal className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-5">
            {posts.map((p) => (
              <Card key={p.title} className="grid content-start overflow-hidden">
                <article className="grid content-start">
                  <PhotoFrame ratio="16/10" rounded={false}>
                    <Image
                      src={p.img}
                      alt={p.alt}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover opacity-[.92]"
                    />
                  </PhotoFrame>
                  <div className="grid gap-2.5 p-6">
                    <p className="text-chip font-semibold uppercase tracking-[0.08em] text-green-500">
                      {p.cat} · {p.read}
                    </p>
                    <h3 className="text-h5">{p.title}</h3>
                    <p className="text-ui text-grey-600">{p.dek}</p>
                  </div>
                </article>
              </Card>
            ))}
          </Reveal>
        </div>
      </section>

      {/* 17 — Final CTA */}
      <section className="relative overflow-hidden bg-green-800 text-white">
        <div aria-hidden="true" className="absolute inset-0">
          <Image
            src="/img/home/cta-final-bg.webp"
            alt=""
            fill
            sizes="100vw"
            className="object-cover opacity-[.26]"
          />
        </div>
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-green-800/90 to-green-800/75"
        />
        <Reveal className="relative mx-auto grid max-w-[900px] justify-items-center gap-[26px] px-section-x py-[clamp(64px,9vw,132px)] text-center">
          <VerifiedSeal size={56} className="text-gold-500" />
          <h2 className="max-w-[24ch] text-h2 text-white">
            Your person is already verified.
          </h2>
          <p className="max-w-[52ch] text-body-lg text-white/[.78]">
            Start the journey tonight. And when it&rsquo;s time, AriyaPlanner is
            waiting on the other side of it.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="onDarkPrimary" asChild>
              <Link href="/pricing">Install Toastly free</Link>
            </Button>
            {/* The prototype sends this to How It Works, whose last step is
                the AriyaPlanner handoff. There is no AriyaPlanner page. */}
            <Button variant="onDarkSecondary" asChild>
              <Link href="/how-it-works">Meet AriyaPlanner</Link>
            </Button>
          </div>
        </Reveal>
      </section>
    </>
  );
}

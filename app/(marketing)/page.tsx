import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, FeatureCard, QuoteCard } from "@/components/ui/card";
import { PhotoFrame } from "@/components/ui/photo-frame";
import { Avatar } from "@/components/ui/avatar";
import { VerifiedSeal } from "@/components/ui/verified-seal";
import { HeroVideo } from "@/components/hero-video";
import { Reveal } from "@/components/reveal";
import {
  coinCards,
  gistPrompts,
  heroStats,
  journey,
  posts,
  profileChips,
  promptCards,
  pwaStats,
  steps,
  testimonials,
  verifySteps,
} from "@/lib/home-content";

export const metadata: Metadata = {
  title: "Toastly — verified Nigerian dating, all the way to the aisle",
  description:
    "Verified people, real intentions. Voice-first Gist sessions, six matches a day, no swiping — and a path that runs from your first Gist to AriyaPlanner when it's time to plan the wedding.",
  alternates: { canonical: "/" },
};

/** Small caps eyebrow above a section heading. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-caption font-semibold uppercase text-green-500">
      {children}
    </p>
  );
}

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
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(100deg,#001F1B 0%,rgba(0,31,27,.42) 40%,rgba(0,42,36,.18) 100%)",
          }}
        />
        <div className="relative mx-auto max-w-container px-5 py-section-y-lg md:px-10">
          <div className="grid max-w-measure gap-[26px]">
            <span className="flex items-center gap-2 text-caption font-medium uppercase text-champagne">
              <VerifiedSeal size={16} className="text-gold-500" />
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
            <p className="text-nav text-white/60">
              Installs from the browser in seconds. 4MB, works on low-end
              Android, no app store needed.
            </p>
          </div>
        </div>
      </section>

      {/* 2 — Tonight on Toastly */}
      <section className="border-b border-ink-900/[.08] bg-paper">
        <div className="mx-auto max-w-container px-5 py-section-y md:px-10">
          <Eyebrow>Tonight on Toastly</Eyebrow>
          <dl className="mt-6 grid gap-6 sm:grid-cols-3">
            {heroStats.map((s, i) => (
              <Reveal key={s.label} index={i}>
                <dt className="font-serif text-h3 text-ink-900">{s.value}</dt>
                <dd className="mt-1 text-ui text-grey-600">{s.label}</dd>
              </Reveal>
            ))}
          </dl>
          <p className="mt-8 text-nav text-grey-600">
            Numbers refresh weekly. No bots, no imported profiles, no ghost
            accounts.
          </p>
        </div>
      </section>

      {/* 3 — Verified Real */}
      <section className="bg-white">
        <div className="mx-auto grid max-w-container gap-12 px-5 py-section-y-lg md:px-10 lg:grid-cols-2 lg:gap-[72px]">
          <div className="grid content-start gap-5">
            <Eyebrow>The trust layer</Eyebrow>
            <h2 className="text-h2 text-ink-900">
              Catfish don&rsquo;t make it past the front door.
            </h2>
            <p className="text-body-lg text-grey-600">
              Nobody sees your face until we&rsquo;ve seen theirs. Phone and
              selfie-liveness verification are mandatory for every single
              account — and if you want to go further, NIN or BVN adds a second
              ring to your seal.
            </p>
            <Button
              variant="link"
              size="link"
              asChild
              className="justify-self-start"
            >
              <Link href="/safety#verification">How verification works</Link>
            </Button>
          </div>
          <ol className="grid list-none gap-4 p-0">
            {verifySteps.map((v, i) => (
              <Reveal key={v.n} index={i}>
                <li>
                  <FeatureCard>
                    <span className="font-serif text-h5 text-green-500">
                      {v.n}
                    </span>
                    <h3 className="text-h5 text-ink-900">{v.title}</h3>
                    <p className="text-ui text-grey-600">{v.body}</p>
                  </FeatureCard>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* 4 — Gist */}
      <section className="bg-green-800 text-white">
        <div className="mx-auto grid max-w-container gap-12 px-5 py-section-y-lg md:px-10 lg:grid-cols-2 lg:gap-[72px]">
          <div className="grid content-start gap-5">
            <p className="text-caption font-semibold uppercase text-champagne">
              Gist
            </p>
            <h2 className="text-h2 text-white">
              Hear them before you meet them.
            </h2>
            <p className="text-body-lg text-white/[.78]">
              A Gist is a structured voice session with a start, an end and
              something to talk about. Three of them, and you know whether this
              is going anywhere — no three weeks of texting, no blank video call
              where you both stare and say &ldquo;so&rdquo;.
            </p>
            <ul className="grid list-none gap-3 p-0 text-ui text-white/[.78]">
              <li>Voice first, so tone does the work photos can&rsquo;t.</li>
              <li>
                Prompts written for Nigerian dating, not translated from
                California.
              </li>
              <li>Live video unlocks on Premium Plus, when you both want it.</li>
            </ul>
            <Button
              variant="onDarkSecondary"
              asChild
              className="justify-self-start"
            >
              <Link href="/features#gist">Explore Gist sessions</Link>
            </Button>
          </div>

          <Card className="border-green-500/40 bg-green-700 p-[26px] text-white">
            <p className="text-caption font-semibold uppercase text-champagne">
              Gist session 2 of 3
            </p>
            <p className="mt-2 text-ui text-white/[.72]">
              Voice · 18 minutes · Tuesday, 8:30pm
            </p>
            <ol className="mt-6 grid list-none gap-4 p-0">
              {gistPrompts.map((p) => (
                <li key={p.n} className="flex gap-3.5">
                  <span className="font-serif text-ui text-gold-500">
                    {p.n}
                  </span>
                  <span className="text-ui text-white/90">{p.text}</span>
                </li>
              ))}
            </ol>
            <p className="mt-6 text-nav text-white/60">
              Prompts are drawn from what you both wrote. Nobody has to open
              with &ldquo;hi how are you&rdquo;.
            </p>
          </Card>
        </div>
      </section>

      {/* 5 — Coin deposit.
          The prototype adds: "their coins go to a charity the other person
          picks. Toastly keeps nothing." OMITTED. The charity mechanic was
          never ratified and is rejected (PRD §5.5); a forfeited stake becomes
          a non-withdrawable stake credit for whoever showed up. Until that
          ships (Prompt 7) this page says nothing about the destination —
          shipping the words without the pipeline is a public promise about
          where users' money goes. */}
      <section className="bg-paper">
        <div className="mx-auto max-w-container px-5 py-section-y-lg md:px-10">
          <div className="grid max-w-[720px] gap-5">
            <Eyebrow>Showing up for each other</Eyebrow>
            <h2 className="text-h2 text-ink-900">
              A small promise, staked by both of you.
            </h2>
            <p className="text-body-lg text-grey-600">
              When a date is confirmed, you each put down a few coins. You both
              show up, you both get them back. Plans change and you say so in
              time — nothing happens. It isn&rsquo;t a fine. It&rsquo;s the
              Nigerian version of &ldquo;I&rsquo;ll be there&rdquo;, written
              down.
            </p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {coinCards.map((c, i) => (
              <Reveal key={c.title} index={i}>
                <FeatureCard>
                  <span className="font-serif text-h4 text-green-500">
                    {c.stat}
                  </span>
                  <h3 className="text-h5 text-ink-900">{c.title}</h3>
                  <p className="text-ui text-grey-600">{c.body}</p>
                </FeatureCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 6 — How it works */}
      <section className="bg-white">
        <div className="mx-auto max-w-container px-5 py-section-y-lg md:px-10">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="grid max-w-[620px] gap-5">
              <Eyebrow>Three steps in</Eyebrow>
              <h2 className="text-h2 text-ink-900">
                Verified, matched, gisting — inside a week.
              </h2>
            </div>
            <Button variant="outline" asChild>
              <Link href="/how-it-works">The full six steps</Link>
            </Button>
          </div>
          <ol className="mt-10 grid list-none gap-6 p-0 md:grid-cols-3">
            {steps.map((s, i) => (
              <Reveal key={s.n} index={i}>
                <li className="grid gap-4">
                  <PhotoFrame ratio="4/3" zoom>
                    <Image
                      src={s.img}
                      alt={s.alt}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover opacity-90"
                    />
                  </PhotoFrame>
                  <span className="text-caption font-semibold uppercase text-green-500">
                    Step {s.n}
                  </span>
                  <h3 className="text-h5 text-ink-900">{s.title}</h3>
                  <p className="text-ui text-grey-600">{s.body}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* 7 — Matching */}
      <section className="bg-paper">
        <div className="mx-auto max-w-container px-5 py-section-y-lg md:px-10">
          <div className="grid max-w-[720px] gap-5">
            <Eyebrow>Matching</Eyebrow>
            <h2 className="text-h2 text-ink-900">
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
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {promptCards.map((p, i) => (
              <Reveal key={p.name} index={i}>
                <FeatureCard>
                  <div className="flex items-center gap-3">
                    <Avatar src={p.img} alt={p.alt} size={46} />
                    <div>
                      <p className="text-ui font-semibold text-ink-900">
                        {p.name}
                      </p>
                      <p className="text-nav text-grey-600">{p.meta}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-caption font-semibold uppercase text-green-500">
                    {p.prompt}
                  </p>
                  <p className="text-ui text-ink-900">{p.answer}</p>
                </FeatureCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 8 — Optional fields. Dashed chips: display-only, never filters. */}
      <section className="bg-white">
        <div className="mx-auto grid max-w-container gap-12 px-5 py-section-y-lg md:px-10 lg:grid-cols-2 lg:gap-[72px]">
          <div className="grid content-start gap-5">
            <Eyebrow>Yours to share</Eyebrow>
            <h2 className="text-h2 text-ink-900">
              Tribe, language, faith — if you want them there.
            </h2>
            <p className="text-body-lg text-grey-600">
              These matter to a lot of Nigerian families, so they&rsquo;re on
              your profile if you choose to put them there. Toastly is not a
              religious platform and none of these fields are used to filter
              anybody&rsquo;s feed. They&rsquo;re something to talk about, never
              a gate.
            </p>
          </div>
          <Card className="p-[26px]">
            <p className="text-caption font-semibold uppercase text-grey-600">
              On Tobi&rsquo;s profile
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {profileChips.map((c) => (
                <Badge key={c} variant="optional">
                  {c}
                </Badge>
              ))}
            </div>
            <p className="mt-6 text-nav text-grey-600">
              Every one of these can be hidden with a single toggle, at any
              time, without affecting who you see.
            </p>
          </Card>
        </div>
      </section>

      {/* 9 — Who it's for */}
      <section className="bg-paper">
        <div className="mx-auto grid max-w-container gap-10 px-5 py-section-y-lg md:px-10 lg:grid-cols-2 lg:gap-[72px]">
          <div className="grid content-start gap-5">
            <Eyebrow>Who Toastly is for</Eyebrow>
            <h2 className="text-h2 text-ink-900">
              Real life comes with history. Bring yours.
            </h2>
            <p className="text-body-lg text-grey-600">
              Single, divorced, widowed, raising kids — none of that is a
              footnote you have to explain away here. What matters is where
              you&rsquo;re going and who you want beside you when you get there.
            </p>
          </div>
          <div className="grid content-start gap-5">
            <p className="text-caption font-semibold uppercase text-grey-600">
              And who it isn&rsquo;t
            </p>
            <h3 className="text-h4 text-ink-900">
              And if you&rsquo;re married, this isn&rsquo;t the place.
            </h3>
            <p className="text-body-lg text-grey-600">
              Toastly is for people who are free to build something. Nothing
              about this app works if one of you is already spoken for — so
              married people are not welcome here, full stop.
            </p>
            {/* Enforced by report-and-remove. Never implies Toastly verifies
                marital status — it cannot be, and conflating it with Verified
                Real would undermine a claim that is genuinely verifiable. */}
            <p className="text-ui text-grey-600">
              It&rsquo;s a rule we enforce, not a box we can tick. Report anyone
              who isn&rsquo;t honest about it and we&rsquo;ll act on it.
            </p>
          </div>
        </div>
      </section>

      {/* 10 — PWA */}
      <section className="bg-white">
        <div className="mx-auto max-w-container px-5 py-section-y-lg md:px-10">
          <div className="grid max-w-[720px] gap-5">
            <Eyebrow>Built for Nigerian phones</Eyebrow>
            <h2 className="text-h2 text-ink-900">
              4MB. No app store. No 2GB of data gone.
            </h2>
            <p className="text-body-lg text-grey-600">
              Toastly installs straight from your browser and sits on your home
              screen like any other app. It runs on a Tecno from 2019, it opens
              on 3G, and Gist audio is compressed to about a quarter of what a
              voice note usually costs you.
            </p>
          </div>
          <dl className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {pwaStats.map((s, i) => (
              <Reveal key={s.label} index={i}>
                <dt className="font-serif text-h4 text-green-500">{s.value}</dt>
                <dd className="mt-1 text-ui text-grey-600">{s.label}</dd>
              </Reveal>
            ))}
          </dl>
        </div>
      </section>

      {/* 11 — CTA mid */}
      <section className="relative overflow-hidden bg-green-800 text-white">
        <div aria-hidden="true" className="absolute inset-0">
          <Image
            src="/img/home/cta-mid-bg.webp"
            alt=""
            fill
            sizes="100vw"
            className="object-cover opacity-[.26]"
          />
        </div>
        <div className="relative mx-auto grid max-w-container gap-5 px-5 py-section-y-lg md:px-10">
          <h2 className="max-w-[18ch] text-h2 text-white">
            Ready to find your person?
          </h2>
          <p className="max-w-[52ch] text-body-lg text-white/[.78]">
            42,000 verified Nigerians are already on here, gisting tonight.
            Verification takes about four minutes.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="onDarkPrimary" asChild>
              <Link href="/pricing">Install Toastly free</Link>
            </Button>
            <Button variant="onDarkSecondary" asChild>
              <Link href="/stories">Read their stories</Link>
            </Button>
          </div>
          <p className="text-nav text-champagne">
            Women get 30 days of Premium Plus free at signup — full Gist video
            and incognito mode, no card needed.{" "}
            <Link href="/how-it-works" className="underline underline-offset-4">
              See how it works
            </Link>
          </p>
        </div>
      </section>

      {/* 12 — Diaspora */}
      <section className="bg-paper">
        <div className="mx-auto grid max-w-container items-center gap-10 px-5 py-section-y-lg md:px-10 lg:grid-cols-2 lg:gap-[72px]">
          <div className="grid content-start gap-5">
            <Eyebrow>The diaspora bridge</Eyebrow>
            <h2 className="text-h2 text-ink-900">
              In London, matching in Lagos.
            </h2>
            <p className="text-body-lg text-grey-600">
              Pick your pool: back home, your diaspora community, or both at
              once. Gist scheduling does the time-zone maths for you, and the
              diaspora track is priced in USD.
            </p>
            <Button variant="outline" asChild className="justify-self-start">
              <Link href="/diaspora">Diaspora matching</Link>
            </Button>
          </div>
          <PhotoFrame ratio="16/11" zoom>
            <Image
              src="/img/home/diaspora-call.webp"
              // Prototype carried no alt for this image; written here.
              alt="A woman on an evening video call at home, city lights behind her"
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover opacity-90"
            />
          </PhotoFrame>
        </div>
      </section>

      {/* 13 — Journey. Its own treatment: a numbered path, not a card grid. */}
      <section className="bg-green-800 text-white">
        <div className="mx-auto max-w-container px-5 py-section-y-lg md:px-10">
          <div className="grid max-w-[720px] gap-5">
            <p className="text-caption font-semibold uppercase text-champagne">
              The journey
            </p>
            <h2 className="text-h2 text-white">From Match to Marriage.</h2>
            <p className="text-body-lg text-white/[.78]">
              Every other app stops at the chat. Toastly is built as a path with
              four stations, and the last one is a wedding — planned in
              AriyaPlanner, introduction ceremony through white wedding.
            </p>
          </div>

          <ol className="mt-12 grid list-none gap-8 p-0 md:grid-cols-4 md:gap-0">
            {journey.map((j, i) => (
              <Reveal key={j.n} index={i}>
                <li className="relative grid gap-3 border-t border-champagne/[.28] pt-6 md:pr-6">
                  <span
                    aria-hidden="true"
                    className="absolute -top-[5px] left-0 h-2.5 w-2.5 rounded-pill bg-gold-500"
                  />
                  <span className="text-caption font-semibold uppercase text-champagne">
                    Station {j.n}
                  </span>
                  <h3 className="text-h5 text-white">{j.title}</h3>
                  <p className="text-ui text-white/[.72]">{j.body}</p>
                </li>
              </Reveal>
            ))}
          </ol>

          <div className="mt-12 flex flex-wrap items-center gap-5">
            <Button variant="onDarkSecondary" asChild>
              <Link href="/how-it-works">Walk the full journey</Link>
            </Button>
            {/* Free on EVERY tier including Starter — never gated. */}
            <p className="text-ui text-champagne">
              Couple Mode and the AriyaPlanner handoff are included on every
              plan, including Starter.
            </p>
          </div>
        </div>
      </section>

      {/* 14 — Testimonials */}
      <section className="bg-white">
        <div className="mx-auto max-w-container px-5 py-section-y-lg md:px-10">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="grid gap-5">
              <Eyebrow>Stories</Eyebrow>
              <h2 className="text-h2 text-ink-900">
                Three couples who stopped scrolling.
              </h2>
            </div>
            <Button variant="outline" asChild>
              <Link href="/stories">Read their stories</Link>
            </Button>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {testimonials.map((t, i) => (
              <Reveal key={t.name} index={i}>
                <QuoteCard>
                  <blockquote className="text-body-lg text-ink-900">
                    &ldquo;{t.quote}&rdquo;
                  </blockquote>
                  <figcaption className="flex items-center gap-3">
                    <Avatar src={t.img} alt={t.alt} size={44} />
                    <div>
                      <p className="text-ui font-semibold text-ink-900">
                        {t.name}
                      </p>
                      <p className="text-caption uppercase text-grey-600">
                        {t.meta}
                      </p>
                    </div>
                  </figcaption>
                </QuoteCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 15 — Blog */}
      <section className="bg-paper">
        <div className="mx-auto max-w-container px-5 py-section-y-lg md:px-10">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 className="text-h2 text-ink-900">
              Reading for the intentional
            </h2>
            <Button variant="link" size="link" asChild>
              <Link href="/writing">All writing</Link>
            </Button>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {posts.map((p, i) => (
              <Reveal key={p.title} index={i}>
                <article className="grid gap-4">
                  <PhotoFrame ratio="16/10" zoom>
                    <Image
                      src={p.img}
                      alt={p.alt}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover opacity-90"
                    />
                  </PhotoFrame>
                  <p className="text-caption uppercase text-grey-600">
                    {p.cat} · {p.read}
                  </p>
                  <h3 className="text-h5 text-ink-900">{p.title}</h3>
                  <p className="text-ui text-grey-600">{p.dek}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 16 — Final CTA */}
      <section className="relative overflow-hidden bg-green-800 text-white">
        <div aria-hidden="true" className="absolute inset-0">
          <Image
            src="/img/home/cta-final-bg.webp"
            alt=""
            fill
            sizes="100vw"
            className="object-cover opacity-30"
          />
        </div>
        <div className="relative mx-auto grid max-w-container gap-5 px-5 py-section-y-lg md:px-10">
          <h2 className="max-w-[20ch] text-h2 text-white">
            Your person is already verified.
          </h2>
          <p className="max-w-[52ch] text-body-lg text-white/[.78]">
            Start the journey tonight. And when it&rsquo;s time, AriyaPlanner is
            waiting on the other side of it.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="onDarkPrimary" asChild>
              <Link href="/pricing">Install Toastly free</Link>
            </Button>
            <Button variant="onDarkSecondary" asChild>
              <Link href="/ariyaplanner">Meet AriyaPlanner</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}

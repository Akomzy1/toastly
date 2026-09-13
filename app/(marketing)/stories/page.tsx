import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, FeatureCard, QuoteCard } from "@/components/ui/card";
import { PhotoFrame } from "@/components/ui/photo-frame";
import {
  Accordion,
  AccordionCard,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { JsonLd } from "@/components/json-ld";
import { Reveal } from "@/components/reveal";
import { faqPageSchema } from "@/lib/schema";
import {
  faqs,
  featured,
  gallery,
  reviews,
  spotlights,
  stats,
} from "@/lib/stories-content";

export const metadata: Metadata = {
  title: "Stories",
  description:
    "Verified journeys from a first Gist to the aisle — couples in Lagos, Abuja, Port Harcourt, Manchester and Croydon, shared by the members who lived them.",
  alternates: { canonical: "/stories" },
};

/** Star rating, as text for screen readers rather than decorative glyphs. */
function Stars({ n }: { n: number }) {
  return (
    <p className="text-ui text-gold-500">
      <span aria-hidden="true">
        {"★".repeat(n)}
        {"☆".repeat(5 - n)}
      </span>
      <span className="sr-only">{n} out of 5</span>
    </p>
  );
}

export default function StoriesPage() {
  return (
    <>
      {/* Only the questions this page actually renders. */}
      <JsonLd data={faqPageSchema(faqs)} />
      {/* 1 — Hero */}
      <section className="bg-green-800 text-white">
        <div className="mx-auto max-w-container px-5 py-section-y-lg md:px-10">
          <div className="grid max-w-[760px] gap-5">
            <p className="text-caption font-semibold uppercase text-champagne">
              Stories
            </p>
            <h1 className="text-display text-white">
              Real Nigerians. Real love. Real weddings.
            </h1>
            <p className="text-body-lg text-white/[.78]">
              Verified journeys, from a first Gist to the aisle. Every story
              here is from a member who chose to share it, with the city and the
              milestone they were at when they wrote it.
            </p>
            <Button variant="onDarkPrimary" asChild className="justify-self-start">
              <Link href="/stories/share">Share your story</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* 2 — Featured couples. Rounded-rect photography at 5:4 — not circles. */}
      <section className="bg-white">
        <div className="mx-auto max-w-container px-5 py-section-y-lg md:px-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-h2 text-ink-900">Four couples, four cities</h2>
            <p className="text-caption uppercase text-grey-600">
              Verified members · shared with permission
            </p>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {featured.map((f, i) => (
              <Reveal key={f.name} index={i}>
                <Card className="grid content-start overflow-hidden">
                  <PhotoFrame ratio="5/4" rounded={false} zoom>
                    <Image
                      src={f.img}
                      alt={f.alt}
                      fill
                      sizes="(max-width: 640px) 100vw, 50vw"
                      className="object-cover opacity-[.92]"
                    />
                  </PhotoFrame>
                  <div className="grid gap-3 p-[26px]">
                    <p className="text-caption uppercase text-grey-600">
                      {f.meta}
                    </p>
                    <blockquote className="text-body-lg text-ink-900">
                      &ldquo;{f.quote}&rdquo;
                    </blockquote>
                    <p className="text-ui font-semibold text-ink-900">{f.name}</p>
                  </div>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 3 — Spotlights */}
      <section className="bg-paper">
        <div className="mx-auto max-w-container px-5 py-section-y-lg md:px-10">
          <div className="grid max-w-[760px] gap-5">
            <p className="text-caption font-semibold uppercase text-green-500">
              Spotlights
            </p>
            <h2 className="text-h2 text-ink-900">One feature, one story each.</h2>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {spotlights.map((s, i) => (
              <Reveal key={s.title} index={i}>
                <FeatureCard>
                  <Badge variant="optional" className="justify-self-start">
                    {s.tag}
                  </Badge>
                  <h3 className="text-h5 text-ink-900">{s.title}</h3>
                  <p className="text-ui text-grey-600">{s.body}</p>
                  <p className="text-caption uppercase text-grey-400">{s.who}</p>
                </FeatureCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 4 — About the community */}
      <section className="bg-green-800 text-white">
        <div className="mx-auto max-w-container px-5 py-section-y-lg md:px-10">
          <div className="grid max-w-[820px] gap-5">
            <p className="text-caption font-semibold uppercase text-champagne">
              The community
            </p>
            <h2 className="text-h2 text-white">
              A generation deciding to be deliberate.
            </h2>
            <p className="text-body-lg text-white/[.78]">
              These are not unusual people. They are Nigerian twenty-somethings
              in Lagos, Abuja, Port Harcourt, Ibadan, Houston and Croydon who got
              tired of the same three conversations and wanted something that
              went somewhere. What they have in common is that they said so out
              loud, on their profiles, on day one.
            </p>
            <p className="text-body-lg text-champagne">
              Toastly did not invent that intention. It just stopped hiding it
              behind a swipe.
            </p>
          </div>
        </div>
      </section>

      {/* 5 — Reviews */}
      <section className="bg-white">
        <div className="mx-auto max-w-container px-5 py-section-y-lg md:px-10">
          <h2 className="text-h2 text-ink-900">Written by verified members</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {reviews.map((r, i) => (
              <Reveal key={r.who} index={i}>
                <QuoteCard>
                  <Stars n={r.stars} />
                  <p className="text-ui text-ink-900">{r.text}</p>
                  <p className="text-caption uppercase text-grey-600">{r.who}</p>
                </QuoteCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 6 — Gallery. 1:1 tiles are 16px rounded rects, never circles. */}
      <section className="bg-paper">
        <div className="mx-auto max-w-container px-5 py-section-y-lg md:px-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-h2 text-ink-900">
              Engagements, introductions, weddings
            </h2>
            <p className="text-caption uppercase text-grey-600">
              Shared by members, with permission
            </p>
          </div>
          <ul className="mt-10 grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {gallery.map((g, i) => (
              <Reveal key={g.caption} index={i}>
                <li className="grid gap-3">
                  <PhotoFrame ratio="1/1" zoom>
                    <Image
                      src={g.img}
                      alt={g.alt}
                      fill
                      sizes="(max-width: 640px) 100vw, 33vw"
                      className="object-cover opacity-[.92]"
                    />
                  </PhotoFrame>
                  <p className="text-caption uppercase text-grey-600">
                    {g.caption}
                  </p>
                </li>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* 7 — Stats */}
      <section className="bg-white">
        <div className="mx-auto max-w-container px-5 py-section-y-lg md:px-10">
          <h2 className="text-h2 text-ink-900">The community in numbers</h2>
          <dl className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {stats.map((s, i) => (
              <Reveal key={s.label} index={i}>
                <dt className="font-serif text-h3 text-ink-900">{s.value}</dt>
                <dd className="mt-1 grid gap-0.5">
                  <span className="text-ui text-grey-600">{s.label}</span>
                  <span className="text-caption uppercase text-grey-400">
                    {s.split}
                  </span>
                </dd>
              </Reveal>
            ))}
          </dl>
        </div>
      </section>

      {/* 8 — FAQ */}
      <section className="bg-paper">
        <div className="mx-auto grid max-w-container gap-10 px-5 py-section-y-lg md:px-10 lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-[72px]">
          <h2 className="max-w-[16ch] text-h2 text-ink-900">
            Sharing your story
          </h2>
          <AccordionCard>
            <Accordion type="single" collapsible>
              {faqs.map(([q, a], i) => (
                <AccordionItem key={q} value={`stories-faq-${i}`}>
                  <AccordionTrigger>{q}</AccordionTrigger>
                  <AccordionContent>{a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </AccordionCard>
        </div>
      </section>

      {/* 9 — CTA */}
      <section className="bg-green-800 text-white">
        <div className="mx-auto grid max-w-container gap-5 px-5 py-section-y-lg md:px-10">
          <h2 className="max-w-[22ch] text-h2 text-white">
            Start the one you&rsquo;ll tell later.
          </h2>
          <div className="flex flex-wrap gap-3">
            <Button variant="onDarkPrimary" asChild>
              <Link href="/signup">Get verified</Link>
            </Button>
            <Button variant="onDarkSecondary" asChild>
              <Link href="/how-it-works">How it works</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}

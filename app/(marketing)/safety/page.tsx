import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { FeatureCard, QuoteCard } from "@/components/ui/card";
import {
  Accordion,
  AccordionCard,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Reveal } from "@/components/reveal";
import { blocks, faqs, quotes, stats } from "@/lib/safety-content";

export const metadata: Metadata = {
  title: "Safety & Trust",
  description:
    "Phone and selfie-liveness verification on every account before it is visible, human review in Lagos within 24 hours, permanent blocks, and privacy controls you hold. Safety is never paywalled.",
  alternates: { canonical: "/safety" },
};

export default function SafetyPage() {
  return (
    <>
      {/* 1 — Header */}
      <section className="bg-green-800 text-white">
        <div className="mx-auto max-w-container px-5 py-section-y-lg md:px-10">
          <div className="grid max-w-[760px] gap-5">
            <p className="text-caption font-semibold uppercase text-champagne">
              Safety &amp; trust
            </p>
            <h1 className="text-display text-white">
              Verified people, real intentions.
            </h1>
            <p className="text-body-lg text-white/[.78]">
              If you have been catfished, strung along by a romance scam, or
              left waiting at a restaurant, you already know why this page
              exists. Trust is not a feature we added — it is the thing the app
              is built out of.
            </p>
          </div>
        </div>
      </section>

      {/* 2 — Stats */}
      <section className="border-b border-ink-900/[.08] bg-paper">
        <div className="mx-auto max-w-container px-5 py-section-y md:px-10">
          <dl className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((s, i) => (
              <Reveal key={s.label} index={i}>
                <dt className="font-serif text-h3 text-ink-900">{s.value}</dt>
                <dd className="mt-1 text-ui text-grey-600">{s.label}</dd>
              </Reveal>
            ))}
          </dl>
        </div>
      </section>

      {/* 3 — Safety blocks. Each its own section with a three-point row. */}
      {blocks.map((b, i) => {
        const dark = b.tone === "dark";
        return (
          <section
            key={b.title}
            id={i === 0 ? "verification" : undefined}
            className={
              dark
                ? "bg-green-800 text-white"
                : b.tone === "paper"
                  ? "bg-paper"
                  : "bg-white"
            }
          >
            <div className="mx-auto max-w-container px-5 py-section-y-lg md:px-10">
              <div className="grid max-w-[820px] gap-5">
                <p
                  className={
                    dark
                      ? "text-caption font-semibold uppercase text-champagne"
                      : "text-caption font-semibold uppercase text-green-500"
                  }
                >
                  {b.kicker}
                </p>
                <h2 className={dark ? "text-h2 text-white" : "text-h2 text-ink-900"}>
                  {b.title}
                </h2>
                <p
                  className={
                    dark
                      ? "text-body-lg text-white/[.78]"
                      : "text-body-lg text-grey-600"
                  }
                >
                  {b.lede}
                </p>
              </div>

              <div className="mt-10 grid gap-5 md:grid-cols-3">
                {b.points.map((p, j) => (
                  <Reveal key={p.title} index={j}>
                    {dark ? (
                      <div className="grid content-start gap-3 rounded-xl border border-champagne/[.28] p-[26px]">
                        <h3 className="text-h5 text-white">{p.title}</h3>
                        <p className="text-ui text-white/[.72]">{p.body}</p>
                      </div>
                    ) : (
                      <FeatureCard>
                        <h3 className="text-h5 text-ink-900">{p.title}</h3>
                        <p className="text-ui text-grey-600">{p.body}</p>
                      </FeatureCard>
                    )}
                  </Reveal>
                ))}
              </div>
            </div>
          </section>
        );
      })}

      {/* 4 — Reassurance */}
      <section className="bg-white">
        <div className="mx-auto max-w-container px-5 py-section-y-lg md:px-10">
          <h2 className="max-w-[20ch] text-h2 text-ink-900">
            &ldquo;I stopped double-checking people.&rdquo;
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {quotes.map((q, i) => (
              <Reveal key={q.name} index={i}>
                <QuoteCard>
                  <blockquote className="text-body-lg text-ink-900">
                    &ldquo;{q.quote}&rdquo;
                  </blockquote>
                  <figcaption className="flex items-center gap-3">
                    <Avatar src={q.img} alt={q.alt} size={44} />
                    <div>
                      <p className="text-ui font-semibold text-ink-900">
                        {q.name}
                      </p>
                      <p className="text-caption uppercase text-grey-600">
                        {q.meta}
                      </p>
                    </div>
                  </figcaption>
                </QuoteCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 5 — FAQ */}
      <section className="bg-paper">
        <div className="mx-auto grid max-w-container gap-10 px-5 py-section-y-lg md:px-10 lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-[72px]">
          <div className="grid content-start gap-5">
            <p className="text-caption font-semibold uppercase text-green-500">
              Safety questions
            </p>
            <h2 className="text-h2 text-ink-900">Straight answers.</h2>
          </div>
          <AccordionCard>
            <Accordion type="single" collapsible>
              {faqs.map(([q, a], i) => (
                <AccordionItem key={q} value={`safety-faq-${i}`}>
                  <AccordionTrigger>{q}</AccordionTrigger>
                  <AccordionContent>{a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </AccordionCard>
        </div>
      </section>

      {/* 6 — CTA */}
      <section className="bg-green-800 text-white">
        <div className="mx-auto grid max-w-container gap-5 px-5 py-section-y-lg md:px-10">
          <h2 className="max-w-[22ch] text-h2 text-white">
            Safety here is not negotiable.
          </h2>
          <p className="max-w-[52ch] text-body-lg text-white/[.78]">
            Get verified and meet people who did the same thing you did.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="onDarkPrimary" asChild>
              <Link href="/signup">Get verified</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FeatureCard } from "@/components/ui/card";
import { PhotoFrame } from "@/components/ui/photo-frame";
import {
  Accordion,
  AccordionCard,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Reveal } from "@/components/reveal";
import { benefits, faqs, steps } from "@/lib/how-it-works-content";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "Six steps from verified match to the aisle: verify in about four minutes, six matches a day, voice-first Gist sessions, a staked date commitment, Couple Mode, then the AriyaPlanner handoff.",
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorksPage() {
  return (
    <>
      {/* 1 — Header */}
      <section className="bg-green-800 text-white">
        <div className="mx-auto max-w-container px-5 py-section-y-lg md:px-10">
          <div className="grid max-w-[760px] gap-5">
            <p className="text-caption font-semibold uppercase text-champagne">
              How it works
            </p>
            <h1 className="text-display text-white">
              From verified match to the aisle — here&rsquo;s how.
            </h1>
            <p className="text-body-lg text-white/[.78]">
              Six steps. The first takes four minutes; the last one ends with a
              wedding you actually planned. Nothing in between is left to chance
              or to your nerve.
            </p>
          </div>
        </div>
      </section>

      {/* 2 — The six steps. Alternating grounds, image and text side by side,
             reversing each step. Not a repeating icon-card grid. */}
      {steps.map((s, i) => {
        const dark = s.tone === "dark";
        const reversed = i % 2 === 1;
        return (
          <section
            key={s.n}
            className={
              dark
                ? "bg-green-800 text-white"
                : s.tone === "paper"
                  ? "bg-paper"
                  : "bg-white"
            }
          >
            <div className="mx-auto grid max-w-container items-center gap-10 px-5 py-section-y-lg md:px-10 lg:grid-cols-2 lg:gap-[72px]">
              <div
                className={`grid content-start gap-5 ${reversed ? "lg:order-2" : ""}`}
              >
                <p
                  className={
                    dark
                      ? "text-caption font-semibold uppercase text-champagne"
                      : "text-caption font-semibold uppercase text-green-500"
                  }
                >
                  Step {s.n} · {s.kicker}
                </p>
                <h2 className={dark ? "text-h2 text-white" : "text-h2 text-ink-900"}>
                  {s.title}
                </h2>
                <p
                  className={
                    dark
                      ? "text-body-lg text-white/[.78]"
                      : "text-body-lg text-grey-600"
                  }
                >
                  {s.lede}
                </p>
                <ul className="grid list-none gap-3 p-0">
                  {s.points.map((p) => (
                    <li
                      key={p}
                      className={
                        dark
                          ? "flex gap-3 text-ui text-white/[.78]"
                          : "flex gap-3 text-ui text-grey-600"
                      }
                    >
                      <span aria-hidden="true" className="text-gold-500">
                        &mdash;
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
                <p
                  className={
                    dark
                      ? "text-caption font-semibold uppercase text-champagne"
                      : "text-caption font-semibold uppercase text-grey-600"
                  }
                >
                  {s.meta}
                </p>
              </div>

              <PhotoFrame
                ratio="4/3"
                zoom
                className={reversed ? "lg:order-1" : ""}
              >
                <Image
                  src={s.img}
                  alt={s.alt}
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover opacity-90"
                />
              </PhotoFrame>
            </div>
          </section>
        );
      })}

      {/* 3 — Benefits */}
      <section className="bg-paper">
        <div className="mx-auto max-w-container px-5 py-section-y-lg md:px-10">
          <div className="grid max-w-[760px] gap-5">
            <p className="text-caption font-semibold uppercase text-green-500">
              What you avoid
            </p>
            <h2 className="text-h2 text-ink-900">
              Five things that never happen here.
            </h2>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {benefits.map((b, i) => (
              <Reveal key={b.title} index={i}>
                <FeatureCard>
                  <h3 className="text-h5 text-ink-900">{b.title}</h3>
                  <p className="text-ui text-grey-600">{b.body}</p>
                </FeatureCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 4 — FAQ */}
      <section className="bg-white">
        <div className="mx-auto grid max-w-container gap-10 px-5 py-section-y-lg md:px-10 lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-[72px]">
          <div className="grid content-start gap-5">
            <p className="text-caption font-semibold uppercase text-green-500">
              Questions
            </p>
            <h2 className="text-h2 text-ink-900">Asked before you asked.</h2>
            <p className="text-ui text-grey-600">
              Anything else, our team in Lagos answers within a day — a person,
              not a bot.
            </p>
          </div>

          <AccordionCard>
            <Accordion type="single" collapsible>
              {faqs.map(([q, a], i) => (
                <AccordionItem key={q} value={`faq-${i}`}>
                  <AccordionTrigger>{q}</AccordionTrigger>
                  <AccordionContent>{a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </AccordionCard>
        </div>
      </section>

      {/* 5 — CTA */}
      <section className="bg-green-800 text-white">
        <div className="mx-auto grid max-w-container gap-5 px-5 py-section-y-lg md:px-10">
          <h2 className="max-w-[20ch] text-h2 text-white">
            Step one takes four minutes.
          </h2>
          <p className="max-w-[52ch] text-body-lg text-white/[.78]">
            Get verified tonight and your first six matches are there when you
            wake up.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="onDarkPrimary" asChild>
              <Link href="/signup">Get verified</Link>
            </Button>
            <Button variant="onDarkSecondary" asChild>
              <Link href="/safety">Safety &amp; trust</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}

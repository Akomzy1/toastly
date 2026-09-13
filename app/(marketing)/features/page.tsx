import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FeatureCard } from "@/components/ui/card";
import { PhotoFrame } from "@/components/ui/photo-frame";
import { Reveal } from "@/components/reveal";
import { deepDives, minor, toc, trust } from "@/lib/features-content";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Verified Real on every profile, prompt-based matching with no swiping, voice-first Gist sessions, coin-deposit date commitments, optional culture and profession fields, Couple Mode and the AriyaPlanner handoff.",
  alternates: { canonical: "/features" },
};

export default function FeaturesPage() {
  return (
    <>
      {/* 1 — Header, with the contents list */}
      <section className="bg-green-800 text-white">
        <div className="mx-auto max-w-container px-5 py-section-y-lg md:px-10">
          <div className="grid max-w-[760px] gap-5">
            <p className="text-caption font-semibold uppercase text-champagne">
              Features
            </p>
            <h1 className="text-display text-white">
              Every feature designed to move you from match to marriage.
            </h1>
            <p className="text-body-lg text-white/[.78]">
              Nothing here exists to keep you scrolling. Each one exists to get
              you to a real conversation, a real date, and — if it&rsquo;s right
              — a real wedding.
            </p>
          </div>

          <ol className="mt-12 grid list-none gap-x-8 gap-y-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
            {toc.map((t) => (
              <li key={t.n} className="flex gap-3 border-t border-champagne/[.28] pt-3">
                <span className="text-caption font-semibold text-gold-500">
                  {t.n}
                </span>
                <span className="text-ui text-white/[.78]">{t.label}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 2 — 01, the trust layer */}
      <section id="trust" className="bg-white">
        <div className="mx-auto max-w-container px-5 py-section-y-lg md:px-10">
          <div className="grid max-w-[760px] gap-5">
            <p className="text-caption font-semibold uppercase text-green-500">
              01 — The trust layer
            </p>
            <h2 className="text-h2 text-ink-900">
              Verified Real, on every single profile.
            </h2>
            <p className="text-body-lg text-grey-600">
              Verification is not a badge you can buy or a step you can skip. It
              is the front door.
            </p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {trust.map((c, i) => (
              <Reveal key={c.title} index={i}>
                <FeatureCard>
                  <Badge
                    variant={c.tag === "Mandatory" ? "verified" : "optional"}
                    className="justify-self-start"
                  >
                    {c.tag}
                  </Badge>
                  <h3 className="text-h5 text-ink-900">{c.title}</h3>
                  <p className="text-ui text-grey-600">{c.body}</p>
                </FeatureCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 3 — Deep dives, 02 through 08. Alternating image left/right at 4:3,
             each its own full section. Explicitly not an icon-card grid —
             SKILL.md names that as the pattern this design was built against. */}
      {deepDives.map((d, i) => {
        const dark = d.tone === "dark";
        const reversed = i % 2 === 1;
        return (
          <section
            key={d.n}
            id={`feature-${d.n}`}
            className={
              dark
                ? "bg-green-800 text-white"
                : d.tone === "paper"
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
                  {d.n} — {d.kicker}
                </p>
                <h2 className={dark ? "text-h2 text-white" : "text-h2 text-ink-900"}>
                  {d.title}
                </h2>
                <p
                  className={
                    dark
                      ? "text-body-lg text-white/[.78]"
                      : "text-body-lg text-grey-600"
                  }
                >
                  {d.lede}
                </p>
                <ul className="grid list-none gap-3 p-0">
                  {d.points.map((p) => (
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
              </div>

              <PhotoFrame
                ratio="4/3"
                zoom
                className={reversed ? "lg:order-1" : ""}
              >
                <Image
                  src={d.img}
                  alt={d.alt}
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover opacity-90"
                />
              </PhotoFrame>
            </div>
          </section>
        );
      })}

      {/* 4 — Secondary features */}
      <section className="bg-white">
        <div className="mx-auto max-w-container px-5 py-section-y-lg md:px-10">
          <div className="grid max-w-[760px] gap-5">
            <p className="text-caption font-semibold uppercase text-green-500">
              Also included
            </p>
            <h2 className="text-h2 text-ink-900">The quieter details</h2>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {minor.map((m, i) => (
              <Reveal key={m.title} index={i}>
                <FeatureCard>
                  <h3 className="text-h5 text-ink-900">{m.title}</h3>
                  <p className="text-ui text-grey-600">{m.body}</p>
                </FeatureCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 5 — CTA */}
      <section className="bg-green-800 text-white">
        <div className="mx-auto grid max-w-container gap-5 px-5 py-section-y-lg md:px-10">
          <h2 className="max-w-[20ch] text-h2 text-white">
            See it working, not described.
          </h2>
          <p className="max-w-[52ch] text-body-lg text-white/[.78]">
            Get verified in about four minutes and your first six matches arrive
            tomorrow morning.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="onDarkPrimary" asChild>
              <Link href="/signup">Start verification</Link>
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

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, FeatureCard, QuoteCard } from "@/components/ui/card";
import { PhotoFrame } from "@/components/ui/photo-frame";
import { Reveal } from "@/components/reveal";
import { blocks, pools, steps, testimonials } from "@/lib/diaspora-content";

export const metadata: Metadata = {
  title: "Diaspora",
  description:
    "Two ways to match from abroad: back home in Nigeria, or within your own diaspora community. Run one or both. Priced in USD, with Gist sessions scheduled around your time zone.",
  alternates: { canonical: "/diaspora" },
};

export default function DiasporaPage() {
  return (
    <>
      {/* 1 — Hero */}
      <section className="relative overflow-hidden bg-green-800 text-white">
        <div aria-hidden="true" className="absolute inset-0">
          <Image
            src="/img/diaspora/hero-bg.webp"
            alt=""
            fill
            sizes="100vw"
            priority
            className="object-cover opacity-[.28]"
          />
        </div>
        <div className="relative mx-auto max-w-container px-5 py-section-y-lg md:px-10">
          <div className="grid max-w-[720px] gap-5">
            <p className="text-caption font-semibold uppercase text-champagne">
              The diaspora bridge
            </p>
            <h1 className="text-display text-white">Love knows no borders.</h1>
            <p className="text-body-lg text-white/[.78]">
              Two ways to match from abroad: back home in Nigeria, or within
              your own diaspora community. Pick one, or run both at once. Priced
              in USD, scheduled around your time zone.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button variant="onDarkPrimary" asChild>
                <Link href="/signup">Join as a diaspora member</Link>
              </Button>
              <Button variant="onDarkSecondary" asChild>
                <Link href="/how-it-works">How it works</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* 2 — The two pools. Both stay named and equally weighted; neither is
             collapsed into the other (SKILL.md). */}
      <section className="bg-white">
        <div className="mx-auto max-w-container px-5 py-section-y-lg md:px-10">
          <div className="grid max-w-[760px] gap-5">
            <p className="text-caption font-semibold uppercase text-green-500">
              Two use cases, said plainly
            </p>
            <h2 className="text-h2 text-ink-900">
              Back home, or right where you are.
            </h2>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            {pools.map((p, i) => (
              <Reveal key={p.title} index={i}>
                <Card className="grid content-start gap-5 overflow-hidden">
                  <PhotoFrame ratio="16/10" rounded={false} zoom>
                    <Image
                      src={p.img}
                      alt={p.alt}
                      fill
                      sizes="(max-width: 1024px) 100vw, 50vw"
                      className="object-cover opacity-90"
                    />
                  </PhotoFrame>
                  <div className="grid gap-3.5 px-[26px] pb-[26px]">
                    <Badge variant="optional" className="justify-self-start">
                      {p.tag}
                    </Badge>
                    <h3 className="text-h4 text-ink-900">{p.title}</h3>
                    <p className="text-ui text-grey-600">{p.body}</p>
                    <ul className="grid list-none gap-2.5 p-0">
                      {p.points.map((pt) => (
                        <li key={pt} className="flex gap-3 text-ui text-grey-600">
                          <span aria-hidden="true" className="text-gold-500">
                            &mdash;
                          </span>
                          {pt}
                        </li>
                      ))}
                    </ul>
                  </div>
                </Card>
              </Reveal>
            ))}
          </div>

          <Card className="mt-8 bg-green-50 p-[26px]">
            <h3 className="text-h5 text-ink-900">
              Choose your pool — or both.
            </h3>
            <p className="mt-2 text-ui text-grey-600">
              Nobody is locked into one path. Run back-home and
              diaspora-to-diaspora at the same time, and change it whenever you
              like in settings.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {["Back home", "My community", "Both"].map((c) => (
                <Badge key={c} variant="optional">
                  {c}
                </Badge>
              ))}
            </div>
          </Card>
        </div>
      </section>

      {/* 3 — Three steps */}
      <section className="bg-paper">
        <div className="mx-auto max-w-container px-5 py-section-y-lg md:px-10">
          <h2 className="text-h2 text-ink-900">Three steps from abroad</h2>
          <ol className="mt-10 grid list-none gap-5 p-0 md:grid-cols-3">
            {steps.map((s, i) => (
              <Reveal key={s.n} index={i}>
                <li>
                  <FeatureCard>
                    <span className="font-serif text-h5 text-green-500">
                      {s.n}
                    </span>
                    <h3 className="text-h5 text-ink-900">{s.title}</h3>
                    <p className="text-ui text-grey-600">{s.body}</p>
                  </FeatureCard>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* 4 — Feature blocks, alternating sides */}
      {blocks.map((b, i) => {
        const dark = b.tone === "dark";
        const reversed = i % 2 === 1;
        return (
          <section
            key={b.title}
            className={
              dark
                ? "bg-green-800 text-white"
                : b.tone === "paper"
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
                {b.cta && b.href ? (
                  <Button
                    variant={dark ? "onDarkSecondary" : "outline"}
                    asChild
                    className="justify-self-start"
                  >
                    <Link href={b.href}>{b.cta}</Link>
                  </Button>
                ) : null}
              </div>

              <PhotoFrame ratio="4/3" zoom className={reversed ? "lg:order-1" : ""}>
                <Image
                  src={b.img}
                  alt={b.alt}
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover opacity-90"
                />
              </PhotoFrame>
            </div>
          </section>
        );
      })}

      {/* 5 — Testimonials, each labelled with the pool it came from */}
      <section className="bg-paper">
        <div className="mx-auto max-w-container px-5 py-section-y-lg md:px-10">
          <h2 className="text-h2 text-ink-900">
            Three ways it has already worked
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {testimonials.map((t, i) => (
              <Reveal key={t.name} index={i}>
                <QuoteCard>
                  <Badge variant="trackUsd" className="justify-self-start">
                    {t.pool}
                  </Badge>
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

      {/* 6 — CTA */}
      <section className="bg-green-800 text-white">
        <div className="mx-auto grid max-w-container gap-5 px-5 py-section-y-lg md:px-10">
          <h2 className="max-w-[24ch] text-h2 text-white">
            Your person is waiting — whether back home or right here.
          </h2>
          <p className="max-w-[56ch] text-body-lg text-white/[.78]">
            Diaspora membership from $15 a month, both pools included.
            AriyaPlanner plans Nigerian weddings in the US, UK and Canada too.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="onDarkPrimary" asChild>
              <Link href="/pricing">See USD pricing</Link>
            </Button>
            <Button variant="onDarkSecondary" asChild>
              <Link href="/stories">Diaspora stories</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}

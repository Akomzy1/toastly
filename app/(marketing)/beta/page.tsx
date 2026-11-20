import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { BetaForm } from "./beta-form";
import { BETA_HONEYPOT_FIELD, BETA_LAGOS_AREAS, BETA_LOCATION_TYPES, BETA_SOURCES } from "@/lib/beta";

// Direct design and implementation authorised by the owner, 20 November 2026.
// Uses the existing Toastly tokens and the supplied beta film's opening still.
export const metadata: Metadata = {
  title: "Join the Toastly founding members beta",
  description: "Apply to join Toastly's first 200 founding members in Lagos. Verified people, real intentions, and a say in what comes next.",
  alternates: { canonical: "/beta" },
};

const NEXT_STEPS = [
  { number: "01", title: "Tell us a little about you.", body: "Start with the application. No profile photos or selfie check needed yet." },
  { number: "02", title: "Look out for your invitation.", body: "We review applications and invite people in batches. Applying doesn’t guarantee a place." },
  { number: "03", title: "Help shape what comes next.", body: "If invited, get verified, meet people and try a Gist. Tell us what works and what could be better." },
];

export default function BetaPage() {
  return (
    <>
      <section aria-labelledby="beta-heading" className="bg-green-800 text-white">
        <div className="mx-auto grid max-w-container gap-10 px-5 pb-12 pt-10 md:px-10 md:py-16 lg:grid-cols-[1fr_1.05fr] lg:items-start lg:gap-16">
          <div className="min-w-0 lg:sticky lg:top-[110px]">
            <p className="flex items-center gap-3 text-caption font-semibold uppercase tracking-eyebrow text-champagne">
              <span aria-hidden="true" className="h-px w-8 bg-gold-500" /> Lagos comes first
            </p>
            <h1 id="beta-heading" className="mt-6 max-w-[560px] text-h2 text-white">
              Join the Toastly <span className="text-champagne">founding members</span> beta.
            </h1>
            <p className="mt-6 max-w-[490px] text-body text-white/80">
              Toastly is a verified dating-to-marriage app for Nigerians. We&rsquo;re opening to 200 founding members in
              Lagos first. Everyone is verified with a selfie check before they appear. Applying doesn&rsquo;t guarantee a place.
            </p>
            <a href="#application" className="mt-5 inline-flex min-h-11 items-center gap-3 text-ui font-semibold text-champagne underline underline-offset-4 lg:hidden">
              Start your application <ArrowDown size={16} aria-hidden="true" />
            </a>
            <figure className="mt-8 overflow-hidden rounded-lg border border-champagne/20">
              <Image src="/img/beta/lagos-evening.webp" alt="" width={1080} height={740} sizes="(min-width: 1024px) 500px, (min-width: 768px) 680px, 100vw" priority className="aspect-[2/1] w-full object-cover" />
              <figcaption className="flex items-center justify-between gap-4 bg-green-700 px-4 py-3 text-caption tracking-normal text-champagne">
                <span>For the city. For something real.</span>
                <span aria-hidden="true">Lagos, NG</span>
              </figcaption>
            </figure>
            <div className="mt-7 border-l-2 border-gold-500 pl-5">
              <p className="text-caption font-semibold uppercase tracking-eyebrow text-champagne">A thank-you for being first</p>
              <p className="mt-2 font-serif text-h5 text-white">3 months of Premium, on us.</p>
              <p className="mt-2 max-w-[460px] text-ui text-white/75">
                Founding members get 3 months of Premium free from the day Toastly opens to everyone. It doesn&rsquo;t stack with other offers.
              </p>
            </div>
          </div>
          <div id="application" className="min-w-0 scroll-mt-24 rounded-xl bg-paper p-5 text-ink-900 sm:p-8 lg:p-9">
            <div className="mb-7 border-b border-green-800/15 pb-6">
              <p className="text-caption font-semibold uppercase tracking-eyebrow text-green-550">Your application</p>
              <h2 className="mt-3 text-h4">Let&rsquo;s start with you.</h2>
              <p className="mt-3 text-ui text-grey-600">A few details to help us bring the first group together. You must be 18 or older.</p>
            </div>
            <BetaForm areas={BETA_LAGOS_AREAS} locationTypes={BETA_LOCATION_TYPES} sources={BETA_SOURCES} honeypotField={BETA_HONEYPOT_FIELD} />
            <aside aria-labelledby="beta-follow" className="mt-7 border-t border-green-800/15 pt-6">
              <h3 id="beta-follow" className="text-ui font-semibold text-green-800">Follow along with Toastly.</h3>
              <p className="mt-2 text-ui text-grey-600">Follow us for updates and a little Lagos gist.</p>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
                {[
                  { name: "Instagram", handle: "@trytoastly", href: "https://www.instagram.com/trytoastly/" },
                  { name: "TikTok", handle: "@trytoastly", href: "https://www.tiktok.com/@trytoastly" },
                  { name: "X", handle: "@toastlyng", href: "https://x.com/toastlyng" },
                  { name: "Facebook", handle: "trytoastly", href: "https://www.facebook.com/trytoastly/" },
                ].map((social) => (
                  <a key={social.name} href={social.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-sm text-ui font-semibold text-green-550 underline underline-offset-4 hover:text-green-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-green-550">
                    {social.name} · {social.handle} <ArrowUpRight size={16} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span>
                  </a>
                ))}
              </div>
            </aside>
          </div>
        </div>
      </section>
      <section aria-labelledby="beta-next" className="bg-paper">
        <div className="mx-auto max-w-container px-5 py-section-y md:px-10">
          <p className="text-caption font-semibold uppercase tracking-eyebrow text-green-550">From application to your first Gist</p>
          <h2 id="beta-next" className="mt-3 text-h3">A small beginning. A real say.</h2>
          <ol className="mt-10 grid gap-8 md:grid-cols-3 md:gap-10">
            {NEXT_STEPS.map((step) => (
              <li key={step.number} className="border-t border-green-800/20 pt-5">
                <span aria-hidden="true" className="font-serif text-h4 text-green-500">{step.number}</span>
                <h3 className="mt-4 text-h5">{step.title}</h3>
                <p className="mt-3 text-body text-grey-600">{step.body}</p>
              </li>
            ))}
          </ol>
          <Link href="/how-it-works" className="mt-8 inline-flex min-h-11 items-center gap-2 text-ui font-semibold text-green-550 underline underline-offset-4">
            Get to know Toastly <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </>
  );
}

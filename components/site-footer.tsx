import Link from "next/link";
import { BrandLockup } from "@/components/brand-mark";
import { VerifiedSeal } from "@/components/ui/verified-seal";

/**
 * Site footer — transcribed from home.slim.html.
 *
 * The groupings ARE in the prototype (Product / Trust, then an AriyaPlanner
 * block), contrary to an earlier note in SKILL.md that called them invented.
 *
 * The AriyaPlanner block is not decoration: the dating surface is a
 * near-zero-CAC acquisition engine for the wedding business (PRD §1), and
 * this is the handoff's only presence in the footer. Do not drop it.
 *
 * Safety features are never paywalled (CLAUDE.md), so nothing here sits
 * behind a tier.
 */
const GROUPS = [
  {
    heading: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "How it works", href: "/how-it-works" },
      { label: "Pricing", href: "/pricing" },
      { label: "Diaspora", href: "/diaspora" },
    ],
  },
  {
    heading: "Trust",
    links: [
      { label: "Safety & Trust", href: "/safety" },
      { label: "Verification process", href: "/safety#verification" },
      { label: "Stories", href: "/stories" },
    ],
  },
];

const LEGAL = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Community guidelines", href: "/guidelines" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-champagne/[.16] bg-green-800 font-sans text-white">
      <div className="mx-auto grid max-w-container gap-10 px-5 pb-10 pt-14 md:px-10 md:pt-[88px] lg:grid-cols-[minmax(0,340px)_1fr_minmax(0,280px)] lg:gap-[72px]">
        <div className="grid max-w-[340px] content-start gap-5">
          <BrandLockup tone="dark" size={28} />
          <p className="text-ui text-white/[.72]">
            Verified people, real intentions — all the way to the aisle. Built
            in Lagos for Nigerians who are done wasting time.
          </p>
          <span className="flex items-center gap-2.5 justify-self-start rounded-pill border border-champagne/[.28] px-3.5 py-2.5 text-caption font-medium uppercase text-champagne">
            <VerifiedSeal size={15} />
            Verified Real
          </span>
        </div>

        <div className="grid gap-10 sm:grid-cols-2">
          {GROUPS.map((group) => (
            <div key={group.heading} className="grid content-start gap-3.5">
              <h2 className="font-sans text-caption font-semibold uppercase text-champagne">
                {group.heading}
              </h2>
              <ul className="grid list-none gap-2.5 p-0">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-ui text-white/[.72] no-underline transition-colors duration-200 hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* The funnel into the sibling product. */}
        <div className="grid content-start gap-3.5">
          <h2 className="font-serif text-h5 text-white">Planning a wedding?</h2>
          <p className="text-ui text-white/[.72]">
            AriyaPlanner takes couples from introduction ceremony to white
            wedding.
          </p>
          <Link
            href="/ariyaplanner"
            className="justify-self-start text-ui font-semibold text-gold-500 no-underline underline-offset-4 hover:underline"
          >
            Explore AriyaPlanner
          </Link>
        </div>
      </div>

      <div className="mx-auto flex max-w-container flex-wrap items-center justify-between gap-4 border-t border-white/[.08] px-5 py-6 md:px-10">
        <p className="text-nav text-white/60">
          &copy; {new Date().getFullYear()} Toastly Technologies Ltd. Lagos,
          Nigeria.
        </p>
        <ul className="flex list-none flex-wrap gap-5 p-0">
          {LEGAL.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="text-nav text-white/60 no-underline transition-colors duration-200 hover:text-white"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}

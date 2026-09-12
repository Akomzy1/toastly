import Link from "next/link";
import { BrandLockup } from "@/components/brand-mark";
import { VerifiedSeal } from "@/components/ui/verified-seal";

/**
 * Site footer — home.slim.html. Deep-green ground, champagne hairline on top.
 *
 * The "Verified Real" pill here is a trust mark, not a link or a paid badge.
 * Safety features are never paywalled (CLAUDE.md), so nothing in this footer
 * should ever sit behind a tier.
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
      { label: "Verification", href: "/verify" },
      { label: "Community standards", href: "/standards" },
      { label: "Report a concern", href: "/report" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "Stories", href: "/stories" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Contact", href: "/contact" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-champagne/[.16] bg-green-800 font-sans text-white">
      <div className="mx-auto grid max-w-container gap-10 px-5 pb-10 pt-14 md:grid-cols-[minmax(0,340px)_1fr] md:gap-[72px] md:px-10 md:pt-[88px]">
        <div className="grid max-w-[340px] content-start gap-5">
          <BrandLockup tone="dark" size={28} />
          <p className="text-ui text-white/[.72]">
            Built in Lagos. Verification, intent and a coin on the table — for
            Nigerians who are done wasting time.
          </p>
          <span className="flex items-center gap-2.5 justify-self-start rounded-pill border border-champagne/[.28] px-3.5 py-2.5 text-caption font-medium uppercase text-champagne">
            <VerifiedSeal size={15} />
            Verified Real
          </span>
        </div>

        <div className="grid gap-10 sm:grid-cols-3">
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
      </div>

      <div className="mx-auto flex max-w-container flex-wrap items-center justify-between gap-4 border-t border-white/[.08] px-5 py-6 md:px-10">
        <p className="text-nav text-white/60">
          &copy; {new Date().getFullYear()} Toastly. Lagos, Nigeria.
        </p>
        <p className="text-nav text-white/60">
          Verified people, real intentions — all the way to the aisle.
        </p>
      </div>
    </footer>
  );
}

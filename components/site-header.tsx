"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLockup } from "@/components/brand-mark";
import { VerifiedSeal } from "@/components/ui/verified-seal";
import { cn } from "@/lib/utils";

/** Primary nav, in the prototype's order. */
const NAV = [
  { label: "Features", href: "/features" },
  { label: "How it works", href: "/how-it-works" },
  { label: "Pricing", href: "/pricing" },
  { label: "Safety & Trust", href: "/safety" },
  { label: "Diaspora", href: "/diaspora" },
  { label: "Stories", href: "/stories" },
];

/**
 * Site header — home.slim.html. Sticky, deep green at 88% with a 14px blur,
 * champagne hairline beneath. 74px tall on desktop.
 *
 * The active link is marked by a 2px amber underline, not a colour change.
 * The mobile toggle is 44x44 because touch targets are not negotiable —
 * majority of traffic is low-end Android.
 */
export function SiteHeader() {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  // Close the panel on navigation, so a route change never leaves it hanging.
  React.useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-50 border-b border-champagne/[.16] bg-green-800/90 font-sans backdrop-blur-[14px]">
      <nav
        aria-label="Primary"
        className="mx-auto flex h-[74px] max-w-container items-center gap-4 px-5 sm:gap-8 md:px-10"
      >
        <Link href="/" className="flex min-h-11 flex-shrink-0 items-center no-underline">
          <BrandLockup tone="dark" size={26} />
        </Link>

        {/* Desktop nav */}
        <ul className="hidden flex-1 list-none items-center gap-4 p-0 lg:flex xl:gap-[30px]">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <li key={item.href} className="relative">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "block py-1.5 text-ui font-medium tracking-[0.01em] no-underline transition-colors duration-200",
                    active ? "text-white" : "text-white/[.74] hover:text-white",
                  )}
                >
                  {item.label}
                </Link>
                {active ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-0.5 rounded-sm bg-gold-500"
                  />
                ) : null}
              </li>
            );
          })}
        </ul>

        {/* Desktop actions */}
        <div className="ml-auto hidden flex-shrink-0 items-center gap-3.5 lg:flex">
          <Link
            href="/verify"
            className="flex min-h-11 items-center gap-[7px] text-nav font-medium text-champagne no-underline transition-opacity duration-200 hover:opacity-75"
          >
            <VerifiedSeal />
            Get verified
          </Link>
          <Link
            href="/pricing"
            className="inline-flex min-h-11 items-center rounded-lg bg-gold-500 px-4 py-2.5 text-nav font-semibold text-green-800 no-underline transition-colors duration-200 hover:bg-gold-300"
          >
            Join Toastly
          </Link>
        </div>

        {/* Mobile actions */}
        <div className="ml-auto flex flex-shrink-0 items-center gap-3 lg:hidden">
          <Link
            href="/pricing"
            className="inline-flex min-h-11 items-center rounded-lg bg-gold-500 px-4 py-2.5 text-nav font-semibold text-green-800 no-underline"
          >
            Get verified
          </Link>
          <button
            type="button"
            aria-label="Toggle menu"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
            className="flex h-11 w-11 flex-col justify-center gap-[5px] rounded-lg border border-champagne/30 px-[11px]"
          >
            <span aria-hidden="true" className="h-px w-full bg-champagne" />
            <span aria-hidden="true" className="h-px w-full bg-champagne" />
            <span aria-hidden="true" className="h-px w-full bg-champagne" />
          </button>
        </div>
      </nav>

      {open ? (
        <ul
          id="mobile-nav"
          className="grid list-none gap-0.5 border-t border-champagne/[.14] px-5 pb-6 pt-2 md:px-10 lg:hidden"
        >
          {NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="block border-b border-white/[.08] py-3.5 text-nav-lg font-medium text-white/[.86] no-underline"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </header>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLockup } from "@/components/brand-mark";
import { signOut } from "@/app/(auth)/actions";

/**
 * In-app navigation — nav-today, nav-gists, nav-safety-entry, nav-desktop
 * (design/prototype/nav-*.slim.html).
 *
 * Phones: a bottom tab bar, tapping only. The active tab gets an amber bar,
 * a white label and a heavier weight, so it reads without colour. Inbox
 * carries the amber badge as a bare count — never a name or preview. Gists
 * shows one small sand dot while an invite is waiting, cleared once Gists is
 * opened. Today and Profile carry nothing.
 * Desktop: the same four destinations in the dark header; Safety kit and
 * Sign out on the right; no bottom bar.
 */

export type NavCounts = { inbox: number; invite: boolean };

type TabKey = "today" | "gists" | "inbox" | "profile";

const TABS: { key: TabKey; label: string; href: string }[] = [
  { key: "today", label: "Today", href: "/feed" },
  { key: "gists", label: "Gists", href: "/gist" },
  { key: "inbox", label: "Inbox", href: "/inbox" },
  { key: "profile", label: "Profile", href: "/profile" },
];

export function tabFor(pathname: string): TabKey | null {
  if (pathname.startsWith("/feed")) return "today";
  if (pathname.startsWith("/gist")) return "gists";
  if (pathname.startsWith("/inbox")) return "inbox";
  if (/^\/(profile|coins|dates|couple|safety-kit|verify)/.test(pathname)) return "profile";
  return null;
}

/** Counts refresh on every navigation and once a minute. */
export function useNavCounts(initial?: NavCounts): NavCounts {
  const pathname = usePathname();
  const [counts, setCounts] = React.useState<NavCounts>(initial ?? { inbox: 0, invite: false });
  React.useEffect(() => {
    if (initial) return;
    let alive = true;
    const load = () =>
      fetch("/api/nav", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: NavCounts | null) => alive && j && setCounts(j))
        .catch(() => undefined);
    void load();
    const t = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [pathname, initial]);
  return counts;
}

function TabIcon({ k, color }: { k: TabKey; color: string }) {
  const common = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true } as const;
  if (k === "today")
    return (
      <svg {...common}>
        <rect x="4" y="5.5" width="16" height="14.5" rx="2.5" stroke={color} strokeWidth="1.5" />
        <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  if (k === "gists")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" stroke={color} strokeWidth="1.5" />
        <path d="M12 7.5V12l3 2" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (k === "inbox")
    return (
      <svg {...common}>
        <path d="M4 12a8 8 0 1 1 3.5 6.6L4 20l1.2-3.8A7.9 7.9 0 0 1 4 12Z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="12" cy="8.5" r="3.6" stroke={color} strokeWidth="1.5" />
      <path d="M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ariaFor(label: string, badge: number, marker: boolean) {
  return label + (badge > 0 ? `, ${badge} new` : "") + (marker ? ", an invite is waiting" : "");
}

export function AppTabBar({ counts: fixed, active: forced }: { counts?: NavCounts; active?: TabKey }) {
  const pathname = usePathname() ?? "";
  const counts = useNavCounts(fixed);
  const active = forced ?? tabFor(pathname);
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-4 border-t border-champagne/[.16] bg-green-800 pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {TABS.map((t) => {
        const on = t.key === active;
        const badge = t.key === "inbox" ? counts.inbox : 0;
        const marker = t.key === "gists" && counts.invite;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? "page" : undefined}
            aria-label={ariaFor(t.label, badge, marker)}
            className="relative grid min-h-[58px] content-center justify-items-center gap-1 px-0.5 pb-[7px] pt-2 no-underline"
          >
            <span
              aria-hidden="true"
              className={`absolute left-1/2 top-0 h-[3px] w-7 -translate-x-1/2 rounded-b-[3px] bg-gold-500 ${on ? "opacity-100" : "opacity-0"}`}
            />
            <span className="relative block h-6 w-6">
              <TabIcon k={t.key} color={on ? "#FFB300" : "#EBD9AE"} />
              {badge > 0 ? (
                <span className="absolute -top-1.5 left-[15px] grid h-5 min-w-5 place-items-center rounded-pill bg-gold-500 px-[5px] text-chip font-bold tabular-nums text-green-800 shadow-[0_0_0_2px_#001F1B]">
                  {badge}
                </span>
              ) : null}
              {marker ? (
                <span aria-hidden="true" className="absolute -right-[3px] top-0 h-2 w-2 rounded-pill bg-champagne shadow-[0_0_0_2px_#001F1B]" />
              ) : null}
            </span>
            <span className={`text-chip leading-[1.2] ${on ? "font-semibold text-white" : "font-medium text-white/[.66]"}`}>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.2 18.8 6v5.2c0 4.3-2.8 7.9-6.8 9.6-4-1.7-6.8-5.3-6.8-9.6V6Z" stroke="#EBD9AE" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/** The labelled shield pill — 44px, the same place on every screen, never behind a plan. */
export function SafetyPill({ wide = false }: { wide?: boolean }) {
  return (
    <Link
      href="/safety-kit"
      aria-label="Safety kit"
      className={`flex min-h-11 min-w-11 flex-shrink-0 items-center gap-1.5 rounded-pill border border-champagne/30 pl-2.5 font-semibold text-champagne no-underline transition-colors hover:border-champagne ${
        wide ? "pr-3.5 text-nav" : "pr-3 text-[13px]"
      }`}
    >
      <ShieldIcon />
      <span>{wide ? "Safety kit" : "Safety"}</span>
    </Link>
  );
}

export function AppHeader({ counts: fixed, active: forced }: { counts?: NavCounts; active?: TabKey }) {
  const pathname = usePathname() ?? "";
  const counts = useNavCounts(fixed);
  const active = forced ?? tabFor(pathname);
  return (
    <header className="sticky top-0 z-50 hidden min-h-16 flex-wrap items-center gap-x-7 gap-y-2 border-b border-champagne/[.16] bg-green-800 px-6 py-2 font-sans lg:flex">
      <Link href="/feed" className="flex min-h-11 flex-shrink-0 items-center no-underline">
        <BrandLockup tone="dark" size={22} />
      </Link>
      <nav aria-label="Main" className="flex min-w-0 flex-1 items-center gap-1">
        {TABS.map((t) => {
          const on = t.key === active;
          const badge = t.key === "inbox" ? counts.inbox : 0;
          const marker = t.key === "gists" && counts.invite;
          return (
            <Link
              key={t.key}
              href={t.href}
              aria-current={on ? "page" : undefined}
              aria-label={ariaFor(t.label, badge, marker)}
              className={`relative flex min-h-11 items-center gap-[7px] px-3 text-ui no-underline hover:text-white ${
                on ? "font-semibold text-white" : "font-medium text-white/[.66]"
              }`}
            >
              <span>{t.label}</span>
              {badge > 0 ? (
                <span className="grid h-5 min-w-5 place-items-center rounded-pill bg-gold-500 px-1.5 text-chip font-bold tabular-nums text-green-800">
                  {badge}
                </span>
              ) : null}
              {marker ? <span aria-hidden="true" className="h-[7px] w-[7px] rounded-pill bg-champagne" /> : null}
              <span aria-hidden="true" className={`absolute inset-x-3 bottom-1 h-0.5 rounded-sm bg-gold-500 ${on ? "opacity-100" : "opacity-0"}`} />
            </Link>
          );
        })}
      </nav>
      <span className="flex flex-shrink-0 items-center gap-2">
        <SafetyPill wide />
        <form action={signOut}>
          <button type="submit" className="min-h-11 px-3 text-nav font-medium text-white/[.66] hover:text-white">
            Sign out
          </button>
        </form>
      </span>
    </header>
  );
}

/** Marks Gists as opened, which clears the sand dot. */
export function GistsSeen() {
  React.useEffect(() => {
    document.cookie = `gists_seen=${Date.now()}; path=/; max-age=31536000; samesite=lax`;
  }, []);
  return null;
}

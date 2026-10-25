"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * PLACEHOLDER — pending the Claude Design prototype (beta.html). The prototype
 * is the source of truth; restyle to it when it arrives and delete this note.
 *
 * A plain text "Beta" label beside the logo / in the phone band, in existing
 * type and colour tokens only. It is for every member and says only that the
 * product is in beta — never a founding-member mark (CLAUDE.md). It links to
 * Send feedback, carrying the page the member was on.
 */
export function BetaLabel() {
  const pathname = usePathname() ?? "/";
  return (
    <Link
      href={`/profile/settings/feedback?from=${encodeURIComponent(pathname)}`}
      aria-label="Beta — send feedback"
      className="flex-shrink-0 text-chip font-semibold uppercase tracking-[0.04em] text-champagne no-underline hover:text-white"
    >
      Beta
    </Link>
  );
}

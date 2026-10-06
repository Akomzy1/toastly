import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Two small patterns every marketing prototype repeats
 * (home-diaspora-offer.slim.html, pricing-offer.slim.html):
 *
 *   Eyebrow   — 13px, 600, uppercase, 0.14em, above a section heading.
 *               Teal on light grounds; champagne or amber on deep green.
 *   ArrowLink — a text action with a hairline underline and a → glyph
 *               ("How verification works", "The full six steps"). The
 *               anchor is 44px tall so it clears the touch-target rule; the
 *               hairline sits on an inner span so it still hugs the text.
 */

const EYEBROW_TONE = {
  green: "text-green-500",
  champagne: "text-champagne",
  gold: "text-gold-500",
} as const;

export function Eyebrow({
  children,
  tone = "green",
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof EYEBROW_TONE;
  className?: string;
}) {
  // Joined by hand, not with cn(): tailwind-merge doesn't know the custom
  // font-size names, reads `text-caption` as a colour, and drops it in favour
  // of the tone's `text-green-500` — the eyebrow then renders at 16px.
  return (
    <p
      className={`text-caption font-semibold uppercase tracking-eyebrow ${EYEBROW_TONE[tone]}${className ? ` ${className}` : ""}`}
    >
      {children}
    </p>
  );
}

export function ArrowLink({
  href,
  children,
  onDark = false,
  arrow = true,
  className,
}: {
  href: string;
  children: React.ReactNode;
  /** Amber on the deep-green ground, teal on light grounds. */
  onDark?: boolean;
  arrow?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      // Joined by hand for the same reason as Eyebrow: cn() would drop
      // `text-ui` against the colour class.
      className={`group inline-flex min-h-11 items-center justify-self-start text-ui font-semibold no-underline ${
        onDark ? "text-gold-500 hover:text-gold-500" : "text-green-500 hover:text-green-500"
      }${className ? ` ${className}` : ""}`}
    >
      <span
        className={cn(
          "inline-flex items-center gap-[9px] border-b pb-[3px] transition-colors duration-200",
          onDark
            ? "border-gold-500/40 group-hover:border-gold-500"
            : "border-green-500/30 group-hover:border-green-500",
        )}
      >
        {children}
        {arrow ? (
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M3 8h9m-3.5-4L12.5 8 8.5 12"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </span>
    </Link>
  );
}

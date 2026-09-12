import { cn } from "@/lib/utils";

/**
 * "The Stake" — the brand mark, from brand-the-stake.slim.html. BINDING.
 *
 * Fixed 48-unit geometry: rings r9.5 stroke 3 at x19/x29 (10-unit offset, so
 * the overlap is a third of each ring), line 32x2.4 fully rounded sitting 4.5
 * below the rings. Never nest the rings tighter, pull them apart, fill them
 * solid, or add anything to the mark.
 *
 * Palette roles are assigned, not free: on dark, Sand is the LEFT ring and
 * Amber the right; on light, deep green with Amber deep on the right.
 *
 * `withGround` paints the deep-green square used by the app icon. Inline in
 * a page, leave it off so the mark sits on the section's own ground — but
 * never place the mark over photography without a solid ground behind it.
 */
export function BrandMark({
  tone = "dark",
  size = 28,
  withGround = false,
  className,
}: {
  /** "dark" = on a deep-green ground. "light" = on paper. "mono" = one colour. */
  tone?: "dark" | "light" | "mono";
  size?: number;
  withGround?: boolean;
  className?: string;
}) {
  const ring =
    tone === "mono"
      ? { left: "currentColor", right: "currentColor" }
      : tone === "light"
        ? { left: "#001F1B", right: "#CC8F00" }
        : { left: "#EBD9AE", right: "#FFB300" };
  const line = tone === "mono" ? "currentColor" : ring.left;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label="Toastly"
      className={cn("flex-shrink-0", className)}
    >
      {withGround ? <rect width="48" height="48" rx="10" fill="#001F1B" /> : null}
      <circle cx="19" cy="22" r="9.5" fill="none" stroke={ring.left} strokeWidth="3" />
      <circle cx="29" cy="22" r="9.5" fill="none" stroke={ring.right} strokeWidth="3" />
      <rect x="8" y="36" width="32" height="2.4" rx="1.2" fill={line} />
    </svg>
  );
}

/**
 * Mark + wordmark. Aleo Bold, never stacked above the mark, sitting one ring
 * radius (9.5u) to the right — that spacing is why the gap is not arbitrary.
 */
export function BrandLockup({
  tone = "dark",
  size = 26,
  className,
}: {
  tone?: "dark" | "light" | "mono";
  size?: number;
  className?: string;
}) {
  return (
    <span className={cn("flex flex-shrink-0 items-center gap-2.5", className)}>
      <BrandMark tone={tone} size={size} />
      <span
        className={cn(
          "font-serif font-bold tracking-[-0.01em]",
          tone === "light" ? "text-ink-900" : "text-white",
        )}
        style={{ fontSize: size * 0.88 }}
      >
        Toastly
      </span>
    </span>
  );
}

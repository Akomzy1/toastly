import { cn } from "@/lib/utils";

/**
 * The "Verified Real" check. Per design-system.slim.html §05 the seal draws
 * its check once on first view and never loops — so this is a static mark
 * here; any draw-on animation belongs at the usage site, gated on
 * prefers-reduced-motion.
 */
export function VerifiedSeal({
  className,
  size = 14,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("flex-shrink-0", className)}
    >
      <path
        d="M12 2.5 14.4 5l3.4-.4 1 3.3 3 1.6-1.4 3.1 1.4 3.1-3 1.6-1 3.3-3.4-.4L12 22.5 9.6 20l-3.4.4-1-3.3-3-1.6L4.6 12.5 3.2 9.4l3-1.6 1-3.3 3.4.4L12 2.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="m8.5 12.2 2.4 2.4 4.6-4.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { VerifiedSeal } from "./verified-seal";

/**
 * Badges and chips — design-system.slim.html §04.
 *
 * Two shapes carry meaning and must not be swapped:
 *   pill (999px)  trust marks and tier flags
 *   rect (6px)    track labels and optional attributes
 *
 * `optional` is dashed on purpose. Religion, tribe, language, profession and
 * relationship history are optional, display-only and never hard matching
 * filters (CLAUDE.md) — the dashed border is how that reads visually. Do not
 * restyle it into a solid chip.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 font-sans whitespace-nowrap",
  {
    variants: {
      variant: {
        verified:
          "gap-[7px] rounded-pill bg-green-50 border border-green-500/[.24] px-[13px] py-[7px] text-caption font-semibold tracking-normal text-green-550",
        nin: "gap-[7px] rounded-pill bg-gold-50 border border-gold-600/30 px-[13px] py-[7px] text-caption font-semibold tracking-normal text-gold-800",
        trackNgn:
          "rounded-sm bg-ink-900 px-3 py-1.5 text-chip font-semibold tracking-[0.04em] text-white",
        trackUsd:
          "rounded-sm bg-green-500 px-3 py-1.5 text-chip font-semibold tracking-[0.04em] text-white",
        optional:
          "rounded-sm border border-dashed border-ink-900/[.28] px-3 py-1.5 text-chip font-medium text-grey-600",
        tier: "rounded-pill bg-gold-500 px-3 py-1.5 text-chip font-bold tracking-[0.04em] text-green-800",
      },
    },
    defaultVariants: { variant: "verified" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {variant === "verified" ? <VerifiedSeal /> : null}
      {children}
    </span>
  );
}

export { badgeVariants };

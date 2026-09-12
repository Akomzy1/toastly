import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Cards — design-system.slim.html §04. Outlined, radius 16px.
 *
 * "Border lifts to green on hover, never a shadow at rest." The only shadow
 * in the system is the hover lift; do not add a resting shadow to any card.
 */

export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }
>(({ className, interactive = false, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl border border-ink-900/[.12] bg-white",
      interactive &&
        "transition-all duration-250 ease-reveal hover:-translate-y-[3px] hover:border-green-500/50 hover:shadow-lift motion-reduce:transition-none motion-reduce:hover:translate-y-0",
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";

/** Feature card: icon, title, two lines. Grid with 12px gap, 26px padding. */
export const FeatureCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <Card
    ref={ref}
    interactive
    className={cn("grid content-start gap-3 p-[26px]", className)}
    {...props}
  />
));
FeatureCard.displayName = "FeatureCard";

/**
 * Media card: image fills the top edge to edge at 16:10, text block below.
 * The image well keeps a deep-green ground so a slow-loading photo never
 * flashes white — the majority of traffic is low-end Android on metered data.
 */
export function MediaCard({
  media,
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { media: React.ReactNode }) {
  return (
    <Card
      className={cn("grid content-start overflow-hidden", className)}
      {...props}
    >
      <div className="aspect-[16/10] overflow-hidden bg-green-800">{media}</div>
      <div className="p-[26px]">{children}</div>
    </Card>
  );
}

/** Quote card: sits on paper, not white. Used for testimonials. */
export const QuoteCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <Card
    ref={ref}
    className={cn("grid content-start gap-3.5 bg-paper p-[26px]", className)}
    {...props}
  />
));
QuoteCard.displayName = "QuoteCard";

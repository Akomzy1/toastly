import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Pricing card — design-system.slim.html §04. Deep-green ground, teal
 * border, radius 16px.
 *
 * Two product rules this component must not be used to break (CLAUDE.md):
 *   - The Naira and Diaspora-USD tracks stay visually separate. `track` is
 *     the label; never blend both currencies into one table.
 *   - Couple Mode and the AriyaPlanner handoff are free on EVERY tier
 *     including Starter. Never render them as a paid-tier feature.
 */
export function PricingCard({
  tier,
  track,
  price,
  period = "/month",
  features,
  cta,
  mostChosen = false,
  className,
}: {
  tier: string;
  track: string;
  price: string;
  period?: string;
  features: string[];
  cta: string;
  mostChosen?: boolean;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "grid content-start gap-4 rounded-xl border border-green-500 bg-green-800 p-7 text-white",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <h3 className="text-h5 text-white">{tier}</h3>
          <p className="font-sans text-nav text-champagne">{track}</p>
        </div>
        {mostChosen ? <Badge variant="tier">Most chosen</Badge> : null}
      </div>

      <p className="flex items-baseline gap-1">
        <span className="font-serif text-h3 text-white">{price}</span>
        <span className="font-sans text-ui font-normal text-white/60">
          {period}
        </span>
      </p>

      <ul className="grid gap-2.5">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 font-sans text-ui">
            <span aria-hidden="true" className="text-gold-500">
              &#10003;
            </span>
            <span className="text-white/90">{f}</span>
          </li>
        ))}
      </ul>

      <Button variant="onDarkPrimary" className="mt-1 w-full">
        {cta}
      </Button>
    </article>
  );
}

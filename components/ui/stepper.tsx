import { cn } from "@/lib/utils";

/**
 * Verification progress.
 *
 * NOT IN THE PROTOTYPE — flagged. The design system has no stepper. This
 * reuses the brand's own idea instead of inventing a new one: the mark is two
 * rings and a line, and NIN/BVN is described throughout as "a second ring on
 * your seal", so progress is drawn as rings filling along a rule.
 *
 * The last step is always optional and is drawn dashed, never as an
 * incomplete requirement — verification is complete at step 2.
 */
export function Stepper({
  steps,
  current,
  className,
}: {
  steps: { label: string; optional?: boolean }[];
  /** Zero-based index of the active step. */
  current: number;
  className?: string;
}) {
  return (
    <ol
      className={cn("grid list-none gap-0 p-0 sm:grid-flow-col sm:auto-cols-fr", className)}
      aria-label="Verification progress"
    >
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.label} className="relative grid gap-2 pt-4 sm:pr-4">
            <span
              aria-hidden="true"
              className={cn(
                "absolute inset-x-0 top-0 h-px",
                done || active ? "bg-green-500" : "bg-ink-900/[.12]",
                s.optional && "bg-transparent [background-image:repeating-linear-gradient(90deg,rgba(5,3,9,.2)_0_4px,transparent_4px_8px)]",
              )}
            />
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  "h-2.5 w-2.5 rounded-pill border-2",
                  done
                    ? "border-green-500 bg-green-500"
                    : active
                      ? "border-gold-500 bg-gold-500"
                      : "border-ink-900/20 bg-transparent",
                )}
              />
              <span
                className={cn(
                  "text-caption font-semibold uppercase",
                  active ? "text-ink-900" : "text-grey-600",
                )}
              >
                {s.label}
              </span>
            </span>
            {s.optional ? (
              <span className="text-caption text-grey-400">Optional</span>
            ) : null}
            <span className="sr-only">
              {done ? "Completed" : active ? "Current step" : "Not started"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

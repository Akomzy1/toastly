import { cn } from "@/lib/utils";

/**
 * Photography frame — rounded rect, radius 16px, clipped.
 *
 * Transcribed from Home and Stories. Three things are deliberate:
 *   - the well is deep green, so a slow photo never flashes white on a
 *     low-end Android over metered data (PRD §5.8);
 *   - photos sit slightly back (opacity .88-.92) rather than at full
 *     strength, which is how the prototype grades them;
 *   - `zoom` is the only motion allowed on imagery: a slow scale on hover.
 *     Nothing bounces, nothing spins.
 *
 * Aspect ratios actually used: 4/3, 5/4, 1/1, 4/5, 16/10, 16/11.
 */
export function PhotoFrame({
  ratio = "4/3",
  zoom = false,
  rounded = true,
  className,
  children,
}: {
  ratio?: string;
  zoom?: boolean;
  rounded?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden bg-green-800",
        rounded && "rounded-xl",
        zoom &&
          "group [&_img]:transition-transform [&_img]:duration-500 [&_img]:ease-reveal hover:[&_img]:scale-105 motion-reduce:[&_img]:transition-none motion-reduce:hover:[&_img]:scale-100",
        className,
      )}
      style={{ aspectRatio: ratio }}
    >
      {children}
    </div>
  );
}

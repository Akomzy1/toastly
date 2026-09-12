"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Section reveal — design-system.slim.html §05: 24px rise, 0.7s,
 * cubic-bezier(.16,.84,.44,1), staggered 80ms. Fires once on first view.
 *
 * "Nothing bounces, nothing spins, no card ever flies off screen."
 *
 * Content starts VISIBLE and is only hidden once this component has mounted
 * and is about to animate it in. That ordering matters: an earlier version
 * rendered at opacity-0 on the server, so if JavaScript never ran — or the
 * IntersectionObserver never fired, as happens in a full-page screenshot
 * that does not scroll — whole sections stayed permanently invisible with no
 * error anywhere. A reveal animation must never be able to eat the content.
 *
 * Reduced motion skips the animation entirely and leaves everything visible.
 */
export function Reveal({
  children,
  index = 0,
  className,
}: {
  children: React.ReactNode;
  /** Position in a staggered group; each step adds 80ms. */
  index?: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  // `null` = not yet decided (server render and first paint): show content.
  const [shown, setShown] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }

    // Anything already on screen is revealed immediately; only off-screen
    // content is hidden, so nothing visible flashes out and back.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight) {
      setShown(true);
      return;
    }
    setShown(false);

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect(); // once on first view, never again
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  const hidden = shown === false;

  return (
    <div
      ref={ref}
      className={cn(
        "transition-[opacity,transform] duration-700 ease-reveal",
        hidden ? "translate-y-6 opacity-0" : "translate-y-0 opacity-100",
        "motion-reduce:!translate-y-0 motion-reduce:!opacity-100 motion-reduce:!transition-none",
        className,
      )}
      style={{ transitionDelay: shown ? `${index * 80}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}

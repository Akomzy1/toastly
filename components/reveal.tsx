"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Section reveal — design-system.slim.html §05: 24px rise, 0.7s,
 * cubic-bezier(.16,.84,.44,1), staggered 80ms. Fires once on first view.
 *
 * "Nothing bounces, nothing spins, no card ever flies off screen."
 *
 * Respects prefers-reduced-motion by rendering the final state immediately —
 * and renders content visible when JS has not run, so a slow connection
 * never leaves a blank section.
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
  const [shown, setShown] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }

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

  return (
    <div
      ref={ref}
      className={cn(
        "motion-reduce:!translate-y-0 motion-reduce:!opacity-100 motion-reduce:!transition-none",
        shown ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
        "transition-[opacity,transform] duration-700 ease-reveal",
        className,
      )}
      style={{ transitionDelay: shown ? `${index * 80}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}

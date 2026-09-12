"use client";

import * as React from "react";

/**
 * Home hero background video.
 *
 * The prototype's hero IS a video — autoplaying, muted, looping, behind a
 * gradient — and it stays. It is transcoded, not dropped: the 3.0 MB master
 * becomes a 637 KB MP4 / 481 KB WebM at 1280px, which keeps the moving hero
 * while respecting PRD §5.8 (low-end Android on metered data).
 *
 * The poster is the video's own first frame, so the hero is never blank and
 * never flashes white before playback starts.
 *
 * Two cases fall back to the still poster, and neither is a design decision
 * of mine — both are the visitor telling the browser what they want:
 *   - prefers-reduced-motion: the prototype's §05 already requires all
 *     motion to respect it;
 *   - Save-Data: an explicit opt-in to lighter pages.
 * To always play regardless, set HONOUR_SAVE_DATA to false.
 */
const HONOUR_SAVE_DATA = true;

export function HeroVideo({ className }: { className?: string }) {
  const ref = React.useRef<HTMLVideoElement>(null);
  const [stillOnly, setStillOnly] = React.useState(false);

  React.useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection;
    const saveData = HONOUR_SAVE_DATA && conn?.saveData === true;

    if (reduced || saveData) {
      setStillOnly(true);
      return;
    }

    // Some mobile browsers reject autoplay until the element is muted in JS.
    const v = ref.current;
    if (v) {
      v.muted = true;
      void v.play().catch(() => {
        /* Autoplay refused — the poster remains, which is a fine hero. */
      });
    }
  }, []);

  if (stillOnly) {
    return (
      <div
        aria-hidden="true"
        className={className}
        style={{
          backgroundImage: "url(/video/home-hero-poster.webp)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "saturate(1) brightness(1.25)",
        }}
      />
    );
  }

  return (
    <video
      ref={ref}
      aria-hidden="true"
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      poster="/video/home-hero-poster.webp"
      className={className}
      style={{ filter: "saturate(1) brightness(1.25)" }}
    >
      <source src="/video/home-hero.webm" type="video/webm" />
      <source src="/video/home-hero.mp4" type="video/mp4" />
    </video>
  );
}

"use client";

import * as React from "react";

/**
 * Unsolicited-image protection.
 *
 * NOT IN THE PROTOTYPE — flagged.
 *
 * Two deliberate choices:
 *
 *   1. It hides EVERY incoming image by default and lets the recipient
 *      choose. It never inspects or classifies the image — PRD §5.1 says chat
 *      is never scanned, and an image classifier is a scanner.
 *   2. It goes further than a blur: the image is not downloaded at all until
 *      the recipient taps. A CSS blur still fetches the full file — data a
 *      member on a metered plan pays for, and an image their phone has
 *      already received whether they wanted it or not.
 *
 * Signed storage URLs cannot go through next/image, hence the plain <img>.
 */
export function BlurredImage({
  src,
  alt,
  blurByDefault = true,
}: {
  src: string;
  alt: string;
  blurByDefault?: boolean;
}) {
  const [shown, setShown] = React.useState(!blurByDefault);

  if (!shown) {
    return (
      <button
        type="button"
        onClick={() => setShown(true)}
        className="grid aspect-[4/3] w-full place-items-center content-center gap-1 rounded-lg bg-green-800 p-4 text-center"
      >
        <span className="text-ui font-semibold text-champagne">Image hidden</span>
        <span className="text-nav text-white/[.72]">Tap to show it</span>
      </button>
    );
  }

  // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, not optimisable by next/image
  return <img src={src} alt={alt} className="w-full rounded-lg" />;
}

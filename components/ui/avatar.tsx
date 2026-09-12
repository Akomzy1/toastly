import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Person avatar — circular.
 *
 * The prototype never writes `border-radius:50%`; it writes `999px`. Both
 * render a circle, so checking for "50%" reports zero and wrongly suggests
 * these are rounded rectangles. They are circles, at 44-52px, in the design
 * system quote card, Home and Diaspora.
 *
 * Story and gallery photography is a DIFFERENT shape — see PhotoFrame. A 1:1
 * story tile is a 16px rounded rect, not a circle; do not circle-crop it.
 */
export function Avatar({
  src,
  alt,
  size = 46,
  className,
}: {
  src: string;
  alt: string;
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={cn("rounded-pill object-cover", className)}
      style={{ width: size, height: size }}
    />
  );
}

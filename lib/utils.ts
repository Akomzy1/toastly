import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge only knows Tailwind's default type scale. Without this it
// read the design system's own sizes (text-ui, text-button, text-chip…) as
// colours and dropped them whenever a colour class was also present — every
// <Button> rendered at 16px instead of the prototype's 15px. Keep this list
// in step with theme.fontSize in tailwind.config.ts.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["display", "h2", "h3", "h4", "h5", "eyebrow", "body-lg", "body", "caption", "button", "chip", "nav", "ui", "nav-lg"] },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

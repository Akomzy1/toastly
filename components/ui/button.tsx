import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button — every variant present in design-system.slim.html §04, and no
 * others. Padding 14x24, radius 12px, Inter 600 15px throughout; the
 * variants differ only in ground and border.
 *
 * The `onDark*` variants are for the deep-green ground, not a dark theme
 * (Toastly has none) — the prototype puts dark sections on light pages.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg font-sans text-button transition-all duration-200 ease-reveal focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-green-500/[.16] focus-visible:border-green-500 disabled:pointer-events-none motion-reduce:transition-none motion-reduce:hover:translate-y-0",
  {
    variants: {
      variant: {
        // Teal ground, white text. Lifts 1px on hover.
        primary:
          "bg-green-500 text-white border-0 hover:bg-green-600 hover:-translate-y-px",
        // Amber ground, deep-green text. The primary action.
        accent:
          "bg-gold-500 text-green-800 border-0 hover:bg-gold-300 hover:-translate-y-px",
        // Outlined on light grounds.
        outline:
          "bg-transparent text-ink-900 border border-ink-900/20 hover:border-green-500 hover:bg-green-50",
        // Inline text action. Tighter padding, underlined.
        link: "bg-transparent text-green-500 border-0 underline underline-offset-4 decoration-1 hover:text-green-600",
        onDarkPrimary:
          "bg-gold-500 text-green-800 border-0 hover:bg-gold-300",
        onDarkSecondary:
          "bg-transparent text-champagne border border-champagne/[.42] hover:bg-champagne/10",
      },
      size: {
        default: "px-6 py-3.5",
        // `link` carries its own padding in the prototype.
        link: "px-2 py-3.5",
      },
    },
    compoundVariants: [{ variant: "link", class: "px-2 py-3.5" }],
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        // Disabled is a real state in the prototype ("Unavailable"): grey
        // ground, grey text, no hover.
        className={cn(
          buttonVariants({ variant, size }),
          "disabled:bg-grey-200 disabled:text-grey-400 disabled:border-0",
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

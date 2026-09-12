import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Form inputs — design-system.slim.html §04. Radius 12px, 13x15 padding,
 * 15px Inter. Focus is a green border plus a 3px green ring at 16% — the
 * prototype's only focus treatment, so do not substitute a browser outline.
 */

const fieldBase =
  "w-full rounded-lg border border-ink-900/20 bg-white px-[15px] py-[13px] font-sans text-ui text-ink-900 placeholder:text-grey-400 transition-colors duration-200 focus:outline-none focus:border-green-500 focus:ring-[3px] focus:ring-green-500/[.16] disabled:bg-grey-100 disabled:text-grey-400";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldBase, className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(fieldBase, "resize-y leading-relaxed", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(fieldBase, "appearance-none", className)} {...props} />
));
Select.displayName = "Select";

export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn("grid gap-2 font-sans text-nav font-medium text-grey-600", className)}
    {...props}
  />
));
Label.displayName = "Label";

/**
 * Field message. `error` is for validation only.
 *
 * Never use this to explain a locked Starter inbox — a locked message is a
 * paid feature, not an error state, and must never be presented as a bug or
 * an unexplained blank (CLAUDE.md).
 */
export function FieldMessage({
  tone = "success",
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement> & {
  tone?: "success" | "error";
}) {
  return (
    <p
      role={tone === "error" ? "alert" : undefined}
      className={cn(
        "flex items-center gap-2 font-sans text-nav font-medium",
        tone === "success" ? "text-success" : "text-error",
        className,
      )}
      {...props}
    >
      {children}
    </p>
  );
}

"use client";

import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { cn } from "@/lib/utils";

/**
 * FAQ accordion — design-system.slim.html §04. White card, radius 16px,
 * rows divided by a hairline. The trigger's sign sits in a 22px outlined
 * circle and flips + to - ; it does not rotate a chevron.
 */

const Accordion = AccordionPrimitive.Root;

const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    className={cn("border-b border-ink-900/[.12] last:border-b-0", className)}
    {...props}
  />
));
AccordionItem.displayName = "AccordionItem";

const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        "group flex w-full items-center justify-between gap-4 bg-transparent px-[22px] py-5 text-left font-sans text-ui font-semibold text-ink-900 transition-colors duration-200 hover:bg-paper focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-green-500/[.16]",
        className,
      )}
      {...props}
    >
      {children}
      <span
        aria-hidden="true"
        className="grid h-[22px] w-[22px] flex-shrink-0 place-items-center rounded-pill border border-ink-900/20 text-ui text-green-500"
      >
        <span className="block group-data-[state=open]:hidden">+</span>
        <span className="hidden group-data-[state=open]:block">&minus;</span>
      </span>
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));
AccordionTrigger.displayName = "AccordionTrigger";

const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className="overflow-hidden data-[state=closed]:animate-none"
    {...props}
  >
    <div className={cn("px-[22px] pb-5 font-sans text-ui text-grey-600", className)}>
      {children}
    </div>
  </AccordionPrimitive.Content>
));
AccordionContent.displayName = "AccordionContent";

/** The card shell the rows sit in. */
export function AccordionCard({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-ink-900/[.12] bg-white",
        className,
      )}
      {...props}
    />
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };

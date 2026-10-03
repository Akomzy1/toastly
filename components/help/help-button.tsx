"use client";

import * as React from "react";
import { HelpPanel } from "./help-panel";

/**
 * Opens Toastly Help. NOT IN THE PROTOTYPE — flagged: toastly-help.slim.html
 * says the panel opens "from Settings, Verification and Payments" but draws no
 * trigger. A quiet outline button, built from the existing button styles.
 */
export function HelpButton({ className = "" }: { className?: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`min-h-11 rounded-md border border-green-500/[.35] bg-white px-4 py-2.5 text-nav font-semibold text-green-500 transition-colors duration-200 hover:border-green-500 hover:bg-green-50 ${className}`}
      >
        Toastly Help
      </button>
      <HelpPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}

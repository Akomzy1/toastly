import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * An inline notice.
 *
 * NOT IN THE PROTOTYPE — flagged. The design system covers field-level
 * success and error messages but has no block-level notice, and the auth and
 * verification screens need one (a failed sign-in, a liveness retry, an
 * explanation of what a locked state is). Built from existing tokens rather
 * than a shadcn default, and kept deliberately plain so it does not read as a
 * new pattern: hairline border, tinted ground, no icon, no shadow.
 *
 * `locked` exists because a locked Starter inbox is a paid feature, never an
 * error (CLAUDE.md). It must never be styled as one — no red, no alarm.
 */
export function Notice({
  tone = "info",
  title,
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  tone?: "info" | "success" | "error" | "locked";
  title?: string;
}) {
  const tones = {
    info: "border-green-500/[.24] bg-green-50 text-ink-900",
    success: "border-success/30 bg-green-50 text-ink-900",
    error: "border-error/30 bg-white text-ink-900",
    locked: "border-gold-600/30 bg-gold-50 text-gold-800",
  };

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "grid gap-1.5 rounded-lg border px-[15px] py-3.5",
        tones[tone],
        className,
      )}
      {...props}
    >
      {title ? (
        <p
          className={cn(
            "text-ui font-semibold",
            tone === "error" && "text-error",
          )}
        >
          {title}
        </p>
      ) : null}
      <div className="text-ui">{children}</div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function ConsoleNav() {
  const path = usePathname();
  const items = [
    { href: "/review", label: "Queue", on: path === "/review" || /^\/review\/\d/.test(path ?? "") },
    { href: "/review/history", label: "Decision history", on: path?.startsWith("/review/history") ?? false },
  ];
  return (
    <nav aria-label="Console" className="flex gap-1">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={i.on ? "page" : undefined}
          className={cn(
            "flex min-h-11 items-center px-3 text-nav no-underline",
            i.on ? "font-semibold text-white shadow-[inset_0_-2px_0_#FFB300]" : "font-medium text-white/[.72] hover:text-white",
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

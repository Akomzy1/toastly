import Link from "next/link";

/**
 * The review console header — review-queue.slim.html. Staff only; the
 * console is reachable at tablet and desktop widths (and still works on a
 * phone, at a squeeze).
 */
export function ConsoleHeader({ active, name, role }: { active: "queue" | "history"; name: string; role: string }) {
  const tab = (href: string, label: string, on: boolean) => (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`flex min-h-11 items-center px-3 text-[14px] no-underline ${
        on ? "font-semibold text-white shadow-[inset_0_-2px_0_#FFB300]" : "font-medium text-white/[.72] hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <header className="flex min-h-[52px] flex-wrap items-center gap-x-7 gap-y-2 bg-green-800 px-6 py-2">
      <span className="flex items-center gap-[9px]">
        <svg width="26" height="26" viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <circle cx="19" cy="20" r="9.5" stroke="#EBD9AE" strokeWidth="3" />
          <circle cx="29" cy="20" r="9.5" stroke="#FFB300" strokeWidth="3" />
          <rect x="8" y="34" width="32" height="2.4" rx="1.2" fill="#EBD9AE" />
        </svg>
        <span className="font-serif text-[18px] font-bold text-white">Toastly</span>
        <span className="rounded-md border border-champagne/40 px-2 py-[3px] text-chip font-semibold text-champagne">Review console</span>
      </span>
      <nav aria-label="Console" className="flex gap-1">
        {tab("/staff", "Queue", active === "queue")}
        {tab("/staff/history", "Decision history", active === "history")}
      </nav>
      <span className="ml-auto text-nav text-white/[.72]">
        {name} · {role}
      </span>
    </header>
  );
}

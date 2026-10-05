import type { Metadata } from "next";
import { requireStaff } from "@/lib/staff";
import { ConsoleNav } from "./console-nav";

export const metadata: Metadata = {
  title: "Review console",
  robots: { index: false, follow: false },
};

/**
 * The staff review console — design/prototype/review-queue.slim.html's
 * header: The Stake on dark, "Review console" tag, Queue and Decision
 * history, the reviewer's name and role. Grey (#F2F2F2) ground, a desktop
 * tool, separate from the member app.
 */
export default async function ReviewLayout({ children }: { children: React.ReactNode }) {
  const { staff } = await requireStaff();
  return (
    <div className="flex min-h-screen flex-col bg-grey-100 font-sans text-ink-900">
      <header className="flex min-h-[52px] flex-wrap items-center gap-x-7 gap-y-2 bg-green-800 px-6 py-2">
        <span className="flex items-center gap-[9px]">
          <svg width="26" height="26" viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <circle cx="19" cy="20" r="9.5" stroke="#EBD9AE" strokeWidth="3" />
            <circle cx="29" cy="20" r="9.5" stroke="#FFB300" strokeWidth="3" />
            <rect x="8" y="34" width="32" height="2.4" rx="1.2" fill="#EBD9AE" />
          </svg>
          <span className="font-serif text-[18px] font-bold text-white">Toastly</span>
          <span className="rounded-sm border border-champagne/40 px-2 py-[3px] text-chip font-semibold text-champagne">
            Review console
          </span>
        </span>
        <ConsoleNav />
        <span className="ml-auto text-[13px] text-white/[.72]">
          {staff.name} · {staff.role === "senior" ? "Senior reviewer" : "Reviewer"}
        </span>
      </header>
      {children}
    </div>
  );
}

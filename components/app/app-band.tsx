import Link from "next/link";
import { ScreenBand } from "@/components/app/screen-band";

/**
 * The band and column the ported photo, not-live and Your data screens were
 * written against (live-profile-and-prompt-14). On main the band IS the
 * shared ScreenBand — title, subline, back link and the Safety pill — so the
 * screens look like every other in-app screen; the column is the in-app
 * prototypes' content column.
 */
export function AppBand({ title, sub, backHref }: { title: string; sub?: string; backHref?: string; safety?: boolean }) {
  return <ScreenBand title={title} sub={sub} back={backHref} />;
}

/** "Still open to you" / settings-style rows with a chevron. */
export function LinkList({ heading, items }: { heading?: string; items: { href: string; label: string; sub?: string }[] }) {
  return (
    <div className="grid gap-2.5">
      {heading ? <p className="mx-0.5 text-chip font-semibold uppercase tracking-[0.12em] text-grey-600">{heading}</p> : null}
      <ul className="m-0 grid list-none overflow-hidden rounded-xl border border-ink-900/[.12] bg-white p-0">
        {items.map((item, i) => (
          <li key={item.href + item.label} className={i ? "border-t border-ink-900/10" : ""}>
            <Link
              href={item.href}
              className="flex min-h-14 items-center justify-between gap-3 px-[15px] py-[11px] no-underline transition-colors hover:bg-paper"
            >
              <span className="grid min-w-0 gap-0.5">
                <span className="text-ui font-medium text-ink-900">{item.label}</span>
                {item.sub ? <span className="text-[13px] leading-[1.45] text-grey-600">{item.sub}</span> : null}
              </span>
              <span aria-hidden="true" className="flex-shrink-0 text-[16px] text-grey-400">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AppColumn({ children, gap = "gap-6" }: { children: React.ReactNode; gap?: string }) {
  return <div className={`mx-auto grid w-full max-w-[680px] content-start px-3.5 pb-7 pt-[18px] ${gap}`}>{children}</div>;
}

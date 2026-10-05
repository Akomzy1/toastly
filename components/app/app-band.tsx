import Link from "next/link";

/**
 * The dark band at the top of an in-app screen: title, a quiet subtitle,
 * an optional back link, and an optional Safety kit button.
 *
 * Taken from the in-app prototypes (profile-not-live, profile-access-paused,
 * photo-replace-main, your-data, account-delete): #001F1B ground, Aleo 19px
 * title, 13px subtitle at 66% white, the ‹ in champagne, and the Safety
 * button as a champagne-outlined pill. The Safety button is never behind a
 * plan or a live profile — the safety kit is open to everyone, always.
 *
 * NOTE: the app shell (app/(app)/layout.tsx) still has its own thin header
 * until the nav prototypes (nav-today, nav-gists…) are built, so for now
 * the band sits under it.
 */
export function AppBand({
  title,
  sub,
  backHref,
  safety = false,
}: {
  title: string;
  sub?: string;
  backHref?: string;
  safety?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 bg-green-800 py-3.5 pl-4 pr-2">
      {backHref ? (
        <Link
          href={backHref}
          aria-label="Back"
          className="-my-3 -ml-3 grid h-11 w-11 flex-shrink-0 place-items-center text-[20px] leading-none text-champagne no-underline"
        >
          ‹
        </Link>
      ) : null}
      <div className="grid min-w-0 flex-1 gap-0.5 py-1.5">
        <p className="font-serif text-[19px] font-bold text-white">{title}</p>
        {sub ? <p className="text-[13px] text-white/[.66]">{sub}</p> : null}
      </div>
      {safety ? (
        <Link
          href="/safety-kit"
          aria-label="Safety kit"
          className="flex min-h-11 min-w-11 flex-shrink-0 items-center gap-1.5 rounded-pill border border-champagne/30 py-0 pl-2.5 pr-3 text-[13px] font-semibold text-champagne no-underline transition-colors hover:border-champagne"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 3.2 18.8 6v5.2c0 4.3-2.8 7.9-6.8 9.6-4-1.7-6.8-5.3-6.8-9.6V6Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
          <span>Safety</span>
        </Link>
      ) : null}
    </div>
  );
}

/** The content column every in-app prototype uses under the band. */
export function AppColumn({ children, gap = "gap-6" }: { children: React.ReactNode; gap?: string }) {
  return <div className={`mx-auto grid w-full max-w-[560px] content-start px-3.5 pb-7 pt-[22px] ${gap}`}>{children}</div>;
}

/** "Still open to you" / settings-style list of rows with a chevron. */
export function LinkList({
  heading,
  items,
}: {
  heading?: string;
  items: { href: string; label: string; sub?: string }[];
}) {
  return (
    <div className="grid gap-2.5">
      {heading ? (
        <p className="mx-0.5 text-chip font-semibold uppercase tracking-[0.12em] text-grey-600">{heading}</p>
      ) : null}
      <ul className="grid list-none overflow-hidden rounded-xl border border-ink-900/[.12] bg-white p-0">
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

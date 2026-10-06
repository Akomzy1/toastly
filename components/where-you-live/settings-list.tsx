import Link from "next/link";

const ROW = "flex min-h-[60px] w-full items-center justify-between gap-3 px-[15px] py-[11px] text-left no-underline";

/**
 * Settings — the "Your account" list from where-you-live-settings.slim.html.
 *
 * Deviation, flagged: the prototype's Phone number row has a chevron, but
 * Toastly has no change-number flow (one number, one account), so the row
 * shows the number without one.
 */
export function SettingsList({ phone, home, abroad }: { phone: string | null; home: string; abroad: boolean }) {
  const chevron = (
    <span aria-hidden="true" className="flex-shrink-0 text-[16px] text-grey-400">
      ›
    </span>
  );
  return (
    <div className="mx-auto grid w-full max-w-[680px] content-start gap-2.5 px-3.5 pb-6 pt-[18px]">
      <p className="m-0 mx-0.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-grey-600">Your account</p>
      <div className="grid overflow-hidden rounded-2xl border border-ink-900/[.12] bg-white">
        <div className={ROW}>
          <span className="grid min-w-0 gap-0.5">
            <span className="text-[15px] font-medium text-ink-900">Phone number</span>
            <span className="text-[13.5px] leading-[1.45] text-grey-600">{phone ?? "Not confirmed yet"}</span>
          </span>
        </div>
        <Link href="/profile/settings/country" className={`${ROW} border-t border-ink-900/10 hover:bg-paper`}>
          <span className="grid min-w-0 gap-0.5">
            <span className="text-[15px] font-medium text-ink-900">Where you live</span>
            <span className="text-[13.5px] leading-[1.45] text-grey-600 [text-wrap:pretty]">{home}</span>
          </span>
          {chevron}
        </Link>
        <Link href="/profile/preferences" className={`${ROW} border-t border-ink-900/10 hover:bg-paper`}>
          <span className="grid min-w-0 gap-0.5">
            <span className="text-[15px] font-medium text-ink-900">Match preferences</span>
            <span className="text-[13.5px] leading-[1.45] text-grey-600">
              {abroad ? "Age range, city, your match pool" : "Age range, city, people living abroad"}
            </span>
          </span>
          {chevron}
        </Link>
      </div>
    </div>
  );
}

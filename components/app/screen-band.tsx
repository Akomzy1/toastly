import Link from "next/link";
import { SafetyPill } from "./nav";

/**
 * The top of every in-app screen (nav-*.slim.html).
 *
 * Phones: the dark band — title, a quiet subline, and the labelled Safety pill
 * at the right end, in the same place at the same size on every screen.
 * Desktop: no band (the header carries Safety kit); the title sits in the
 * content as a 26px serif heading with its subline beside it.
 */
export function ScreenBand({
  title,
  sub,
  back,
  safety = true,
}: {
  title: string;
  sub?: string;
  back?: string;
  /** Off on the safety kit itself. */
  safety?: boolean;
}) {
  return (
    <>
      <div className="flex items-center gap-2.5 bg-green-800 py-3.5 pl-4 pr-2 lg:hidden">
        {back ? (
          <Link href={back} aria-label="Back" className="-my-2 -ml-2 grid h-11 w-11 flex-shrink-0 place-items-center text-[20px] leading-none text-champagne no-underline">
            ‹
          </Link>
        ) : null}
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h1 className="m-0 font-serif text-[19px] font-bold text-white">{title}</h1>
          {sub ? <p className="m-0 text-[13px] text-white/[.66]">{sub}</p> : null}
        </div>
        {safety ? <SafetyPill /> : null}
      </div>
      <div className="mx-auto hidden w-full max-w-[680px] items-baseline justify-between gap-3 px-6 pb-1.5 pt-8 lg:flex">
        <div className="flex items-baseline gap-3">
          {back ? (
            <Link href={back} className="text-nav text-green-500">
              ← Back
            </Link>
          ) : null}
          <h1 className="m-0 font-serif text-[26px] font-bold text-ink-900">{title}</h1>
        </div>
        {sub ? <p className="m-0 text-nav text-grey-600">{sub}</p> : null}
      </div>
    </>
  );
}

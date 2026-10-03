import Link from "next/link";

/**
 * Shared pieces of the gist-invite screens (gist-invite-*.slim.html,
 * gists-list.slim.html). Lifted from the prototypes' own markup.
 *
 * Deviation, flagged: the prototypes show member photos. Photo upload is part
 * of Prompt 14 (parked), so a monogram stands in until photos exist.
 */

export function Band({ title, sub, back }: { title: string; sub?: string; back?: string }) {
  return (
    <div className="flex items-center gap-2.5 bg-green-800 px-4 pb-[18px] pt-5">
      {back ? (
        <Link href={back} aria-label="Back" className="-my-2 -ml-2 grid h-11 w-11 place-items-center text-[20px] leading-none text-champagne no-underline">
          ‹
        </Link>
      ) : null}
      <div className="grid gap-0.5">
        <h1 className="m-0 font-serif text-[19px] font-bold text-white">{title}</h1>
        {sub ? <p className="m-0 text-[13px] text-white/[.66]">{sub}</p> : null}
      </div>
    </div>
  );
}

export function Monogram({ name, size = 44 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      className="grid flex-shrink-0 place-items-center rounded-pill bg-green-50 font-serif font-bold text-green-500"
    >
      {initials || "·"}
    </span>
  );
}

export function PersonHead({ name, city }: { name: string; city: string | null }) {
  return (
    <div className="flex items-center gap-3">
      <Monogram name={name} />
      <div className="grid min-w-0 gap-0.5">
        <p className="m-0 text-ui font-semibold text-ink-900">{name}</p>
        {city ? <p className="m-0 text-[13px] text-grey-400">{city}</p> : null}
      </div>
    </div>
  );
}

/** The quoted answer an invite is about. */
export function AnswerQuote({ label, prompt, answer }: { label: string; prompt: string; answer: string }) {
  return (
    <div className="grid gap-1.5">
      <p className="m-0 font-sans text-chip font-semibold uppercase tracking-[0.12em] text-green-500">{label}</p>
      <p className="m-0 font-serif text-[18px] font-bold leading-[1.3] text-ink-900 [text-wrap:balance]">{prompt}</p>
      <p className="m-0 text-ui leading-[1.6] text-ink-800">&ldquo;{answer}&rdquo;</p>
    </div>
  );
}

/** The compact answer strip inside a list row. */
export function AnswerStrip({ whose, prompt, answer }: { whose: string; prompt: string; answer: string }) {
  return (
    <span className="grid gap-[3px] rounded-md bg-paper px-3 py-2.5">
      <span className="text-[12.5px] font-semibold leading-[1.45] text-grey-600">
        {whose} · {prompt}
      </span>
      <span className="line-clamp-2 text-nav leading-normal text-ink-800">&ldquo;{answer}&rdquo;</span>
    </span>
  );
}

export function ClockIcon({ color = "#001F1B" }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.6" stroke={color} strokeWidth="1.6" />
      <path d="M12 7.4V12l3.2 2" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export const CARD = "grid gap-3.5 rounded-xl border border-ink-900/[.12] bg-white p-3.5";
export const AMBER =
  "flex min-h-12 w-full items-center justify-center gap-2.5 rounded-lg bg-gold-500 px-5 py-3.5 text-button text-green-800 no-underline transition-colors duration-200 hover:bg-gold-300 disabled:bg-grey-200 disabled:text-grey-600";
export const OUTLINE =
  "flex min-h-12 w-full items-center justify-center rounded-lg border border-ink-900/20 bg-transparent px-5 py-3.5 text-button text-ink-900 no-underline transition-colors duration-200 hover:border-green-500 hover:bg-green-50";
export const OUTLINE_WHITE =
  "flex min-h-12 w-full items-center justify-center rounded-lg border border-ink-900/20 bg-white px-3 py-3.5 text-button text-ink-900 no-underline transition-colors duration-200 hover:border-green-500 hover:bg-green-50";
export const NOTE = "m-0 px-0.5 text-nav leading-[1.6] text-grey-600";

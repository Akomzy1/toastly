import { bothClocks } from "@/lib/scheduling";

/**
 * Both clocks — built against design/prototype/both-clocks.slim.html.
 *
 * Two local times side by side with each city named, split by a 1px rule,
 * times set in Aleo at 22px with tabular numerals so the columns align.
 *
 * Behaviour unchanged: this renders a time, it does not choose one. The
 * 08:00–22:00 rule and the refusal to offer a 3am slot live in
 * lib/scheduling.ts and are untouched.
 *
 * SCOPE NOTE, flagged: the prototype is a full "Propose a Gist" screen with
 * selectable windows and a "no window today → see tomorrow" state. There is
 * no propose-a-time screen in the build yet — Starter's outbound move is a
 * Gist invite from the match card — so the window-selection half of that
 * prototype is not rendered anywhere. The clock block below is the part that
 * has a home today, built to the prototype so the rest drops in unchanged.
 */
export function BothClocks({
  instant,
  yourZone,
  yourCity,
  theirZone,
  theirCity,
  theirName,
}: {
  instant: Date;
  yourZone: string | null;
  yourCity: string | null;
  theirZone: string | null;
  theirCity: string | null;
  theirName: string;
}) {
  const clocks = bothClocks(instant, yourZone, theirZone);

  // One clock when they share a zone or either side hasn't set one — never
  // two identical times dressed up as a comparison.
  if (!clocks.yours || !clocks.theirs || yourZone === theirZone) {
    return (
      <p className="text-ui text-ink-900">
        {clocks.yours
          ? `${clocks.yours.day}, ${clocks.yours.time}`
          : instant.toISOString().slice(0, 16).replace("T", " ")}
      </p>
    );
  }

  return (
    <div className="grid gap-[11px]">
      <div className="grid grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] items-stretch gap-3">
        <div className="grid min-w-0 gap-[3px]">
          <span className="text-chip font-semibold uppercase tracking-[0.08em] text-grey-400">
            You{yourCity ? ` · ${yourCity}` : ""}
          </span>
          <span className="font-serif text-[22px] font-bold tabular-nums text-ink-900">
            {clocks.yours.time}
          </span>
        </div>

        <div className="bg-ink-900/10" />

        <div className="grid min-w-0 gap-[3px]">
          <span className="text-chip font-semibold uppercase tracking-[0.08em] text-grey-400">
            {theirName}
            {theirCity ? ` · ${theirCity}` : ""}
          </span>
          <span className="font-serif text-[22px] font-bold tabular-nums text-ink-900">
            {clocks.theirs.time}
          </span>
        </div>
      </div>

      <span className="flex items-center gap-[7px] text-chip text-success">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="7" stroke="#2F8F5B" strokeWidth="1.3" />
          <path d="m5 8.2 2 2 4-4.4" stroke="#2F8F5B" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        Daytime for both of you
      </span>
    </div>
  );
}

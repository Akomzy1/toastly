/**
 * "Open to dating someone who has children?" (PRD §5.2, 13 October 2026): a
 * green panel under the Family group. Built from design/prototype/profile-fields.html.
 *
 * PRIVATE: nobody else can ever read it — not on any profile or card, not in any
 * screen. Neither answer is selected until the member chooses; no answer counts
 * as Yes. Free on every plan. A matching rule (today's six), never a filter.
 */
export function OpenToChildrenPanel({ value }: { value: "yes" | "no" | null }) {
  return (
    <div role="group" aria-labelledby="open-kids-q" className="grid gap-3 rounded-2xl bg-green-50 p-[15px]">
      <div className="grid gap-[5px]">
        <p id="open-kids-q" className="m-0 text-[15px] font-medium leading-snug text-ink-900">
          Open to dating someone who has children?
        </p>
        <p className="m-0 flex items-center gap-1.5 text-[13.5px] text-grey-600">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="5" y="10.5" width="14" height="10" rx="2.5" stroke="#504E52" strokeWidth="1.8" />
            <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" stroke="#504E52" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          Only you see this.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(["yes", "no"] as const).map((v) => (
          <label
            key={v}
            className="group flex min-h-12 cursor-pointer items-center justify-between gap-2.5 rounded-xl border border-ink-900/[.18] bg-white px-3.5 text-[15px] font-semibold text-ink-900 hover:border-green-500 has-[:checked]:border-2 has-[:checked]:border-green-500 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-green-500"
          >
            <input type="radio" name="open_to_children" value={v} defaultChecked={value === v} className="sr-only" />
            <span>{v === "yes" ? "Yes" : "No"}</span>
            <span aria-hidden="true" className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-pill border-[1.5px] border-grey-400 group-has-[:checked]:border-green-500">
              <span className="h-2.5 w-2.5 rounded-pill bg-transparent group-has-[:checked]:bg-green-500" />
            </span>
          </label>
        ))}
      </div>
      <div className="grid gap-0.5">
        <p className="m-0 text-[13.5px] leading-normal text-ink-800">If you don&rsquo;t answer, it counts as Yes.</p>
        <p className="m-0 text-[13.5px] leading-normal text-grey-600">Nobody sees your answer, or who it kept out.</p>
      </div>
    </div>
  );
}

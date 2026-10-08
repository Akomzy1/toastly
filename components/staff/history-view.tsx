import Link from "next/link";
import { actionLabel, KIND_LABEL, STAGE_LABEL, caseNo, wat } from "@/lib/review";

/**
 * Decision history — built against design/prototype/review-history.slim.html.
 * Read-only: entries are written when a decision is confirmed (case_events,
 * append-only in the database) and can't be edited or deleted.
 */

export type HistoryCase = { id: string; case_no: number; kind: string; stage: string; decision: string | null };
export type HistoryEntry = { at: string; who: string; role: string; what: string; why: string | null; decision: boolean };

const GRID = "grid grid-cols-[128px_132px_170px_minmax(0,1fr)] items-start gap-3.5";

export function HistoryView({
  q,
  list,
  selected,
  reason,
  entries,
  base = "/staff/history",
}: {
  q: string;
  list: HistoryCase[];
  selected: HistoryCase | null;
  reason: string;
  entries: HistoryEntry[];
  base?: string;
}) {
  const outcome = (c: HistoryCase) => (c.stage === "decided" ? actionLabel(c.decision ?? "") ?? "Decided" : STAGE_LABEL[c.stage]);
  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-wrap items-start gap-5 p-6">
      <aside aria-label="Cases" className="grid max-w-full flex-[1_1_280px] gap-2.5">
        <form action={base} className="grid gap-1.5">
          <label htmlFor="find" className="text-chip font-semibold uppercase tracking-[0.1em] text-grey-600">
            Find a case
          </label>
          <input
            id="find"
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Case or member ID"
            className="min-h-11 rounded-lg border border-ink-900/[.22] bg-white px-[11px] py-2 text-[13.5px] text-ink-900"
          />
        </form>
        <div className="overflow-hidden rounded-[10px] border border-ink-900/[.12] bg-white">
          {list.map((c) => {
            const on = selected?.id === c.id;
            return (
              <Link
                key={c.id}
                href={`${base}?${new URLSearchParams({ ...(q ? { q } : {}), case: c.id })}`}
                aria-current={on ? "true" : undefined}
                className={`grid min-h-14 w-full gap-[3px] border-t border-ink-900/[.08] px-3.5 py-2.5 text-left no-underline hover:bg-paper ${
                  on ? "bg-green-50 shadow-[inset_3px_0_0_#00695C]" : "bg-white"
                }`}
              >
                <span className="flex justify-between gap-2.5 text-nav font-semibold tabular-nums text-ink-900">
                  <span>{caseNo(c.case_no)}</span>
                  <span className="font-medium text-grey-600">{outcome(c)}</span>
                </span>
                <span className="text-[12.5px] text-grey-600">{KIND_LABEL[c.kind] ?? c.kind}</span>
              </Link>
            );
          })}
          {list.length === 0 ? <p className="m-0 px-3.5 py-[18px] text-nav text-grey-600">No case with that ID.</p> : null}
        </div>
      </aside>

      <section aria-labelledby="h-title" className="grid min-w-0 flex-[999_1_600px] gap-3.5">
        {selected ? (
          <>
            <div className="grid gap-1.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h1 id="h-title" className="m-0 font-serif text-[24px] font-bold leading-[1.2]">
                  {caseNo(selected.case_no)}
                </h1>
                <span className="rounded-md border border-ink-900/[.18] bg-white px-[9px] py-[3px] text-[12.5px] font-semibold text-ink-800">
                  {KIND_LABEL[selected.kind] ?? selected.kind}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-ink-900/[.14] bg-grey-100 px-[9px] py-[3px] text-[12.5px] font-semibold text-ink-800">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="5" y="10.5" width="14" height="9.5" rx="2" stroke="#1E1C21" strokeWidth="2" />
                    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" stroke="#1E1C21" strokeWidth="2" />
                  </svg>
                  Read-only
                </span>
              </div>
              <p className="m-0 max-w-[70ch] text-[14px] leading-[1.55] text-ink-800 [text-wrap:pretty]">{reason}</p>
              <p className="m-0 text-[12.5px] text-grey-600">
                Entries are written when a decision is confirmed and can&rsquo;t be edited or deleted. Times in WAT.
              </p>
            </div>
            <div className="overflow-hidden rounded-[10px] border border-ink-900/[.12] bg-white">
              <div className="overflow-x-auto">
                <div className="min-w-[640px]">
                  <div className={`${GRID} border-b border-ink-900/[.12] bg-paper px-4 py-2.5 text-chip font-semibold uppercase tracking-[0.06em] text-grey-600`}>
                    <span>When</span>
                    <span>Who</span>
                    <span>What</span>
                    <span>Why</span>
                  </div>
                  <ol className="m-0 list-none p-0">
                    {entries.map((e, i) => (
                      <li key={i} className={`${GRID} border-t border-ink-900/[.08] px-4 py-3`}>
                        <span className="text-nav leading-[1.45] tabular-nums text-ink-800">{wat(e.at)}</span>
                        <span className="grid gap-px">
                          <span className="text-nav font-semibold text-ink-900">{e.who}</span>
                          <span className="text-chip text-grey-600">{e.role}</span>
                        </span>
                        <span
                          className={`justify-self-start rounded-md border px-2 py-[3px] text-[12.5px] font-semibold ${
                            e.decision ? "border-green-500/30 bg-green-50 text-green-550" : "border-ink-900/[.12] bg-grey-100 text-ink-800"
                          }`}
                        >
                          {e.what}
                        </span>
                        <span className="text-[13.5px] leading-[1.5] text-ink-800 [text-wrap:pretty]">{e.why}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          </>
        ) : (
          <p className="m-0 rounded-[10px] border border-ink-900/[.12] bg-white p-4 text-ui text-grey-600">Choose a case to see its history.</p>
        )}
      </section>
    </main>
  );
}

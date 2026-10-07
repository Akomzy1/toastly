import Link from "next/link";
import { SortSelect } from "./sort-select";
import { KIND_LABEL, KIND_ORDER, STAGE_LABEL, STAGE_STYLE, caseNo, waited } from "@/lib/review";

/**
 * The queue — built against design/prototype/review-queue.slim.html. Filters
 * are links (the page renders on the server); counts are per type within
 * the chosen status, as in the prototype.
 */

export type QueueRow = {
  id: string;
  case_no: number;
  kind: string;
  reason: string;
  created_at: string;
  stage: string;
  assigned_name: string | null;
  /** A "Threatening or pressuring me" report (0034): listed first. */
  urgent?: boolean;
};

const STATUSES: [string, string][] = [
  ["open", "Open"],
  ["new", "New"],
  ["in_review", "In review"],
  ["waiting_member", "Waiting on member"],
  ["decided", "Decided"],
  ["all", "All"],
];

const GRID = "grid grid-cols-[84px_160px_minmax(0,1fr)_84px_132px] gap-3.5";

export function QueueView({
  rows,
  status,
  type,
  sort,
  base = "/staff",
  caseHref = (id: string) => `/staff/${id}`,
  now = Date.now(),
}: {
  rows: QueueRow[];
  status: string;
  type: string;
  sort: "oldest" | "newest";
  base?: string;
  caseHref?: (id: string) => string;
  now?: number;
}) {
  const byStatus = (r: QueueRow) => (status === "all" ? true : status === "open" ? r.stage !== "decided" : r.stage === status);
  const pool = rows.filter(byStatus);
  const list = pool
    .filter((r) => type === "all" || r.kind === type)
    // Threat reports first, whichever way the rest is sorted (decided 7 October 2026).
    .sort(
      (a, b) =>
        Number(!!b.urgent) - Number(!!a.urgent) ||
        (sort === "oldest" ? 1 : -1) * (Date.parse(a.created_at) - Date.parse(b.created_at)),
    );
  const href = (s: string, t: string, o: string) => `${base}?${new URLSearchParams({ status: s, type: t, sort: o })}`;
  const statusLabel = STATUSES.find(([k]) => k === status)?.[1] ?? "Open";

  const pill = (on: boolean) =>
    `flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border px-[11px] py-1.5 text-nav font-medium no-underline ${
      on ? "border-green-800 bg-green-800 text-white" : "border-ink-900/[.18] bg-white text-ink-800"
    }`;

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-wrap items-start gap-5 p-6">
      <aside aria-label="Filters" className="grid flex-[1_1_100%] gap-3 rounded-[10px] border border-ink-900/[.12] bg-white px-4 py-3.5">
        <div className="grid gap-1.5">
          <p className="m-0 mb-0.5 text-chip font-semibold uppercase tracking-[0.1em] text-grey-600">Status</p>
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map(([k, l]) => (
              <Link key={k} href={href(k, type, sort)} aria-pressed={status === k} className={pill(status === k)}>
                {l}
              </Link>
            ))}
          </div>
        </div>
        <div className="grid gap-1.5">
          <p className="m-0 mb-0.5 text-chip font-semibold uppercase tracking-[0.1em] text-grey-600">Case type</p>
          <div className="flex flex-wrap gap-1.5">
            {[["all", "All types"] as const, ...KIND_ORDER.map((k) => [k, KIND_LABEL[k]] as const)].map(([k, l]) => {
              const on = type === k;
              const count = k === "all" ? pool.length : pool.filter((r) => r.kind === k).length;
              return (
                <Link key={k} href={href(status, k, sort)} aria-pressed={on} className={pill(on)}>
                  <span>{l}</span>
                  <span className={`text-chip tabular-nums ${on ? "text-white/[.72]" : "text-grey-600"}`}>{count}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </aside>

      <section aria-labelledby="q-title" className="grid min-w-0 flex-[999_1_640px] gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2.5">
          <div className="grid gap-1">
            <h1 id="q-title" className="m-0 font-serif text-[24px] font-bold leading-[1.2]">
              Queue
            </h1>
            <p className="m-0 text-[13.5px] text-grey-600">
              {list.length} {list.length === 1 ? "case" : "cases"} · {statusLabel.toLowerCase()} · {sort === "oldest" ? "oldest first" : "newest first"}
            </p>
          </div>
          <SortSelect value={sort} hrefFor={{ oldest: href(status, type, "oldest"), newest: href(status, type, "newest") }} />
        </div>

        <div className="overflow-hidden rounded-[10px] border border-ink-900/[.12] bg-white">
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div role="row" className={`${GRID} border-b border-ink-900/[.12] bg-paper px-4 py-2.5 text-chip font-semibold uppercase tracking-[0.06em] text-grey-600`}>
                <span>Case</span>
                <span>Type</span>
                <span>Reason</span>
                <span>Waited</span>
                <span>Status</span>
              </div>
              {list.map((r) => (
                <Link
                  key={r.id}
                  href={caseHref(r.id)}
                  className={`${GRID} min-h-14 items-center border-t border-ink-900/[.08] px-4 py-2.5 text-ink-900 no-underline hover:bg-paper`}
                >
                  <span className="text-nav font-semibold tabular-nums text-green-500">{caseNo(r.case_no)}</span>
                  <span className="text-nav font-medium leading-[1.35]">{KIND_LABEL[r.kind] ?? r.kind}</span>
                  <span className="text-[13.5px] leading-[1.45] text-ink-800 [text-wrap:pretty]">{r.reason}</span>
                  <span className="text-nav tabular-nums text-ink-800">{waited(r.created_at, now)}</span>
                  <span className="grid justify-items-start gap-[3px]">
                    <span className={`whitespace-nowrap rounded-md border px-2 py-[3px] text-chip font-semibold ${STAGE_STYLE[r.stage]}`}>
                      {STAGE_LABEL[r.stage]}
                    </span>
                    {r.assigned_name ? <span className="text-chip text-grey-600">{r.assigned_name}</span> : null}
                  </span>
                </Link>
              ))}
              {list.length === 0 ? <p className="m-0 px-4 py-7 text-center text-[14px] text-grey-600">No cases match these filters.</p> : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

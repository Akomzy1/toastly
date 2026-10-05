"use client";

import * as React from "react";
import Link from "next/link";
import { CASE_TYPES, STATUS_LABEL, STATUS_PILL, caseId, caseTypeLabel, waited } from "@/lib/review-labels";
import { cn } from "@/lib/utils";

export type QueueCase = {
  id: number;
  kind: string;
  summary: string;
  status: string;
  created_at: string;
  assignee: string | null;
};

const STATUS_FILTERS = ["open", "new", "in_review", "waiting_on_member", "decided", "all"] as const;
const STATUS_FILTER_LABEL: Record<string, string> = { open: "Open", all: "All", ...STATUS_LABEL };

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex min-h-9 items-center gap-2 rounded-[8px] border px-[11px] py-1.5 text-[13px] font-medium",
        on ? "border-green-800 bg-green-800 text-white" : "border-ink-900/[.18] bg-white text-ink-800",
      )}
    >
      {children}
    </button>
  );
}

export function QueueView({ cases, now }: { cases: QueueCase[]; now: number }) {
  const [status, setStatus] = React.useState<string>("open");
  const [type, setType] = React.useState("all");
  const [sort, setSort] = React.useState<"oldest" | "newest">("oldest");

  const byStatus = (c: QueueCase) =>
    status === "all" ? true : status === "open" ? c.status !== "decided" : c.status === status;
  const pool = cases.filter(byStatus);
  const list = pool
    .filter((c) => type === "all" || c.kind === type)
    .sort((a, b) =>
      sort === "oldest"
        ? a.created_at.localeCompare(b.created_at)
        : b.created_at.localeCompare(a.created_at),
    );

  return (
    <main className="mx-auto flex w-full max-w-container flex-1 flex-wrap items-start gap-5 p-6">
      <aside aria-label="Filters" className="grid flex-[1_1_100%] gap-3 rounded-md border border-ink-900/[.12] bg-white px-4 py-3.5">
        <div className="grid gap-1.5">
          <p className="mb-0.5 text-chip font-semibold uppercase tracking-[0.1em] text-grey-600">Status</p>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((k) => (
              <Pill key={k} on={status === k} onClick={() => setStatus(k)}>
                {STATUS_FILTER_LABEL[k]}
              </Pill>
            ))}
          </div>
        </div>
        <div className="grid gap-1.5">
          <p className="mb-0.5 text-chip font-semibold uppercase tracking-[0.1em] text-grey-600">Case type</p>
          <div className="flex flex-wrap gap-1.5">
            {[{ key: "all", label: "All types" }, ...CASE_TYPES].map((t) => (
              <Pill key={t.key} on={type === t.key} onClick={() => setType(t.key)}>
                <span>{t.label}</span>
                <span className={cn("text-chip tabular-nums", type === t.key ? "text-white/[.72]" : "text-grey-600")}>
                  {t.key === "all" ? pool.length : pool.filter((c) => c.kind === t.key).length}
                </span>
              </Pill>
            ))}
          </div>
        </div>
      </aside>

      <section aria-labelledby="q-title" className="grid min-w-0 flex-[999_1_640px] gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2.5">
          <div className="grid gap-1">
            <h1 id="q-title" className="font-serif text-[24px] font-bold leading-[1.2]">
              Queue
            </h1>
            <p className="text-[13.5px] text-grey-600">
              {list.length} {list.length === 1 ? "case" : "cases"} · {STATUS_FILTER_LABEL[status].toLowerCase()} ·{" "}
              {sort === "oldest" ? "oldest first" : "newest first"}
            </p>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-grey-600">
            Sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as "oldest" | "newest")}
              className="min-h-9 rounded-[8px] border border-ink-900/20 bg-white px-2.5 py-1.5 text-[13px] text-ink-900"
            >
              <option value="oldest">Oldest first</option>
              <option value="newest">Newest first</option>
            </select>
          </label>
        </div>

        <div className="overflow-x-auto rounded-md border border-ink-900/[.12] bg-white">
          <div className="min-w-[640px]">
            <div
              role="row"
              className="grid grid-cols-[84px_160px_minmax(0,1fr)_84px_132px] gap-3.5 border-b border-ink-900/[.12] bg-paper px-4 py-2.5 text-chip font-semibold uppercase tracking-[0.06em] text-grey-600"
            >
              <span>Case</span>
              <span>Type</span>
              <span>Reason</span>
              <span>Waited</span>
              <span>Status</span>
            </div>
            {list.map((c) => (
              <Link
                key={c.id}
                href={`/review/${c.id}`}
                className="grid min-h-14 grid-cols-[84px_160px_minmax(0,1fr)_84px_132px] items-center gap-3.5 border-t border-ink-900/[.08] px-4 py-2.5 text-ink-900 no-underline hover:bg-paper"
              >
                <span className="text-[13px] font-semibold tabular-nums text-green-500">{caseId(c.id)}</span>
                <span className="text-[13px] font-medium leading-[1.35]">{caseTypeLabel(c.kind)}</span>
                <span className="text-[13.5px] leading-[1.45] text-ink-800">{c.summary}</span>
                <span className="text-[13px] tabular-nums text-ink-800">{waited(c.created_at, now)}</span>
                <span className="grid justify-items-start gap-[3px]">
                  <span className={cn("whitespace-nowrap rounded-sm border px-2 py-[3px] text-chip font-semibold", STATUS_PILL[c.status])}>
                    {STATUS_LABEL[c.status]}
                  </span>
                  {c.assignee ? <span className="text-chip text-grey-600">{c.assignee}</span> : null}
                </span>
              </Link>
            ))}
            {list.length === 0 ? (
              <p className="px-4 py-7 text-center text-nav text-grey-600">No cases match these filters.</p>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}

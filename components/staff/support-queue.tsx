import Link from "next/link";
import { waited } from "@/lib/review";
import { SUPPORT_CATEGORY_LABEL, SUPPORT_STATUS_LABEL, SUPPORT_STATUS_STYLE } from "@/lib/support-labels";

/**
 * The Support tab — Toastly Help tickets. NOT IN A PROTOTYPE — flagged:
 * built from the review queue's own filters, table and status chips
 * (review-queue.slim.html). Urgent tickets are pinned to the top, then the
 * oldest first, whatever the filter.
 */

export type SupportRow = {
  id: string;
  reference: string;
  category: string;
  urgency: "normal" | "urgent";
  status: string;
  trigger: string | null;
  created_at: string;
  sla_due_at: string | null;
  first_opened_at: string | null;
  replied_at: string | null;
  resolved_at: string | null;
};

const FILTERS: [string, string][] = [
  ["open", "Open"],
  ["resolved", "Resolved"],
  ["all", "All"],
];

const GRID = "grid grid-cols-[96px_96px_minmax(0,1fr)_96px_132px] gap-3.5";

export function SupportQueue({ rows, status, now = Date.now() }: { rows: SupportRow[]; status: string; now?: number }) {
  const list = [...rows].sort(
    (a, b) =>
      Number(b.urgency === "urgent" && b.status !== "resolved") - Number(a.urgency === "urgent" && a.status !== "resolved") ||
      Date.parse(a.created_at) - Date.parse(b.created_at),
  );
  const pill = (on: boolean) =>
    `flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border px-[11px] py-1.5 text-nav font-medium no-underline ${
      on ? "border-green-800 bg-green-800 text-white" : "border-ink-900/[.18] bg-white text-ink-800"
    }`;
  const urgentOpen = list.filter((r) => r.urgency === "urgent" && r.status !== "resolved").length;

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-wrap items-start gap-5 p-6">
      <aside aria-label="Filters" className="grid flex-[1_1_100%] gap-3 rounded-[10px] border border-ink-900/[.12] bg-white px-4 py-3.5">
        <div className="grid gap-1.5">
          <p className="m-0 mb-0.5 text-chip font-semibold uppercase tracking-[0.1em] text-grey-600">Status</p>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map(([k, l]) => (
              <Link key={k} href={`/staff/support?status=${k}`} aria-pressed={status === k} className={pill(status === k)}>
                {l}
              </Link>
            ))}
          </div>
        </div>
      </aside>

      <section aria-labelledby="s-title" className="grid min-w-0 flex-[999_1_640px] gap-3">
        <div className="grid gap-1">
          <h1 id="s-title" className="m-0 font-serif text-[24px] font-bold leading-[1.2]">
            Support
          </h1>
          <p className="m-0 text-[13.5px] text-grey-600">
            {list.length} {list.length === 1 ? "ticket" : "tickets"} · urgent first, then oldest first
            {urgentOpen ? ` · ${urgentOpen} urgent` : ""}
          </p>
        </div>

        <div className="overflow-hidden rounded-[10px] border border-ink-900/[.12] bg-white">
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div role="row" className={`${GRID} border-b border-ink-900/[.12] bg-paper px-4 py-2.5 text-chip font-semibold uppercase tracking-[0.06em] text-grey-600`}>
                <span>Ticket</span>
                <span>Urgency</span>
                <span>Topic</span>
                <span>Waited</span>
                <span>Status</span>
              </div>
              {list.map((r) => {
                const urgent = r.urgency === "urgent" && r.status !== "resolved";
                const overdue = r.status === "open" && r.sla_due_at && Date.parse(r.sla_due_at) < now;
                return (
                  <Link
                    key={r.id}
                    href={`/staff/support/${encodeURIComponent(r.reference)}`}
                    className={`${GRID} min-h-14 items-center border-t border-ink-900/[.08] px-4 py-2.5 text-ink-900 no-underline hover:bg-paper ${
                      urgent ? "shadow-[inset_3px_0_0_#9B1348]" : ""
                    }`}
                  >
                    <span className="text-nav font-semibold tabular-nums text-green-500">{r.reference}</span>
                    <span>
                      {r.urgency === "urgent" ? (
                        <span className="whitespace-nowrap rounded-md border border-error/40 bg-error/[.06] px-2 py-[3px] text-chip font-semibold text-error">
                          Urgent
                        </span>
                      ) : (
                        <span className="text-nav text-ink-800">Normal</span>
                      )}
                    </span>
                    <span className="text-[13.5px] leading-[1.45] text-ink-800">{SUPPORT_CATEGORY_LABEL[r.category] ?? r.category}</span>
                    <span className={`text-nav tabular-nums ${overdue ? "font-semibold text-error" : "text-ink-800"}`}>
                      {waited(r.created_at, now)}
                    </span>
                    <span className="grid justify-items-start gap-[3px]">
                      <span className={`whitespace-nowrap rounded-md border px-2 py-[3px] text-chip font-semibold ${SUPPORT_STATUS_STYLE[r.status] ?? ""}`}>
                        {SUPPORT_STATUS_LABEL[r.status] ?? r.status}
                      </span>
                      {r.status === "open" ? (
                        <span className="text-chip text-grey-600">{r.first_opened_at ? "Opened" : "Not opened"}</span>
                      ) : null}
                    </span>
                  </Link>
                );
              })}
              {list.length === 0 ? <p className="m-0 px-4 py-7 text-center text-[14px] text-grey-600">No tickets here.</p> : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

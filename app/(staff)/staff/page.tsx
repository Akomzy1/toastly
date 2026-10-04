import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { KIND_LABEL, ACTION_LABEL } from "@/lib/review";

type Row = { id: string; kind: string; subject_name: string; created_at: string; decision: string | null; member_open: number };

const KINDS = ["pricing", "report", "married_report", "blind_report", "attendance", "selfie_review", "id_review", "photo_match", "sentinel"];

/** The queue: oldest first, one list for every kind of item. */
export default async function StaffQueue({ searchParams }: { searchParams: { kind?: string; status?: string } }) {
  const supabase = createClient();
  const kind = KINDS.includes(searchParams.kind ?? "") ? searchParams.kind! : null;
  const status = searchParams.status === "closed" ? "closed" : "open";
  const { data, error } = await supabase.rpc("staff_queue", { p_kind: kind, p_status: status });
  const rows = (data ?? []) as Row[];

  const chip = (label: string, href: string, on: boolean) => (
    <Link
      key={href}
      href={href}
      className={`flex min-h-11 items-center rounded-pill border px-3.5 text-nav no-underline ${
        on ? "border-green-500 bg-green-50 font-semibold text-green-550" : "border-ink-900/15 bg-white text-ink-900"
      }`}
    >
      {label}
    </Link>
  );
  const q = (k: string | null, s: string) => `/staff?${new URLSearchParams({ ...(k ? { kind: k } : {}), ...(s === "closed" ? { status: s } : {}) })}`;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {chip("Open", q(kind, "open"), status === "open")}
        {chip("Decided", q(kind, "closed"), status === "closed")}
      </div>
      <div className="flex flex-wrap gap-2">
        {chip("All kinds", q(null, status), kind === null)}
        {KINDS.map((k) => chip(KIND_LABEL[k], q(k, status), kind === k))}
      </div>
      {kind === "sentinel" ? (
        <p className="m-0 text-nav text-grey-600">
          The Sentinel is events-only in Phase 1 (CLAUDE.md), so nothing creates these yet.
        </p>
      ) : null}
      {error ? <p className="m-0 text-nav text-error">{error.message}</p> : null}
      {rows.length === 0 ? (
        <p className="m-0 rounded-xl border border-ink-900/10 bg-white p-4 text-ui text-grey-600">Nothing here.</p>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/staff/${r.id}`}
                className="grid gap-1 rounded-xl border border-ink-900/10 bg-white px-4 py-3 text-inherit no-underline hover:border-green-500"
              >
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-ui font-semibold text-ink-900">{KIND_LABEL[r.kind] ?? r.kind}</span>
                  <span className="text-chip text-grey-400">
                    {new Date(r.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </span>
                <span className="text-nav text-grey-600">
                  {r.subject_name}
                  {r.member_open > 1 ? ` · ${r.member_open} open items for this member` : ""}
                  {r.decision ? ` · ${ACTION_LABEL[r.decision] ?? r.decision}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

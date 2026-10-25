import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ConsoleHeader } from "@/components/staff/console-header";
import { FEEDBACK_CATEGORIES } from "@/lib/beta";
import { betaFeedback } from "../actions";

export const dynamic = "force-dynamic";

/**
 * Beta feedback, newest first. Internal and plain — no design round (owner, 25
 * October 2026). Read-only; staff only. The words are shown to staff and go
 * nowhere else: not to analytics, not to a model.
 */
const PAGE = 50;
type Row = { id: string; created_at: string; category: string; page: string; body: string; from_member: string };

export default async function StaffBetaFeedback({ searchParams }: { searchParams: { category?: string; page?: string } }) {
  const supabase = createClient();
  const { data: me } = await supabase.rpc("staff_me");
  const who = (me ?? { name: "Staff", role: "Reviewer" }) as { name: string; role: string };
  const category = FEEDBACK_CATEGORIES.some((c) => c.code === searchParams.category) ? searchParams.category! : "";
  const page = Math.max(1, Math.floor(Number(searchParams.page) || 1));
  const result = await betaFeedback(category, PAGE, (page - 1) * PAGE);
  const data = result.ok ? (result.data as unknown as { total: number; rows: Row[] }) : { total: 0, rows: [] as Row[] };
  const pages = Math.max(1, Math.ceil(data.total / PAGE));
  const link = (n: number) => `/staff/beta/feedback?${new URLSearchParams({ ...(category ? { category } : {}), page: String(n) })}`;

  return (
    <>
      <ConsoleHeader active="beta-feedback" name={who.name} role={who.role} />
      <main className="mx-auto grid w-full max-w-[1280px] flex-1 content-start gap-4 p-6">
        <div className="grid gap-1">
          <h1 className="m-0 font-serif text-[24px] font-bold leading-[1.2]">Beta feedback</h1>
          <p className="m-0 text-nav text-grey-600">{data.total} in total. Times in Lagos.</p>
        </div>
        <form action="/staff/beta/feedback" className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-chip font-semibold uppercase tracking-[0.06em] text-grey-600">
            Category
            <select name="category" defaultValue={category} className="min-h-11 rounded-lg border border-ink-900/[.22] bg-white px-2 text-nav normal-case tracking-normal text-ink-900">
              <option value="">All</option>
              {FEEDBACK_CATEGORIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="min-h-11 rounded-lg border border-ink-900/[.22] bg-white px-4 text-nav font-semibold text-ink-900">
            Filter
          </button>
        </form>
        {!result.ok ? (
          <p role="alert" className="text-ui text-error">
            {result.error}
          </p>
        ) : null}
        <ol className="m-0 grid list-none gap-2.5 p-0">
          {data.rows.map((r) => (
            <li key={r.id} className="grid gap-1.5 rounded-[10px] border border-ink-900/[.12] bg-white p-3.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-nav text-grey-600">
                <span className="rounded-md border border-ink-900/[.18] px-2 py-[2px] text-[12.5px] font-semibold capitalize text-ink-800">{r.category}</span>
                <span>{new Date(r.created_at).toLocaleString("en-GB", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" })}</span>
                <span>{r.page}</span>
                <span>{r.from_member}</span>
              </div>
              <p className="m-0 whitespace-pre-wrap text-ui text-ink-900">{r.body}</p>
            </li>
          ))}
          {data.rows.length === 0 ? <li className="text-ui text-grey-600">No feedback yet.</li> : null}
        </ol>
        {pages > 1 ? (
          <nav aria-label="Pages" className="flex items-center gap-4 text-nav">
            {page > 1 ? <Link href={link(page - 1)}>← Newer</Link> : null}
            <span className="text-grey-600">
              Page {page} of {pages}
            </span>
            {page < pages ? <Link href={link(page + 1)}>Older →</Link> : null}
          </nav>
        ) : null}
      </main>
    </>
  );
}

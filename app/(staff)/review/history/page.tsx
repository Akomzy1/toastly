import Link from "next/link";
import { requireStaff, caseId, caseTypeLabel, wat } from "@/lib/staff";

/**
 * Decision history — design/prototype/review-history.slim.html. Read-only:
 * entries are written when a decision is confirmed and can't be edited or
 * deleted (0018 refuses both). Times in WAT.
 */
const ACTION_LABEL: Record<string, string> = {
  raised: "Raised",
  assign: "Assigned",
  clear: "Clear",
  switch: "Ask to switch plan",
  reverify: "Request re-verification",
  restrict: "Restrict",
  remove: "Remove",
  confirm_match: "Confirm match",
  not_match: "Not a match",
};

type Entry = { at: string; who: string; action: string; note: string; case: number; kind: string; summary: string; member: string };

export default async function ReviewHistoryPage({ searchParams }: { searchParams: { case?: string } }) {
  const { supabase } = await requireStaff();
  const raw = (searchParams.case ?? "").replace(/^TC-/i, "").trim();
  const filter = raw && /^\d+$/.test(raw) ? Number(raw) : null;
  const { data } = await supabase.rpc("review_history", filter ? { p_case: filter } : {});
  const entries = (data ?? []) as Entry[];

  return (
    <main className="mx-auto grid w-full max-w-container flex-1 content-start gap-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="font-serif text-[24px] font-bold leading-[1.2]">Decision history</h1>
          <p className="text-[13.5px] text-grey-600">
            Read-only. Entries are written when a decision is confirmed and can&rsquo;t be edited or deleted. Times in WAT.
          </p>
        </div>
        <form className="flex items-center gap-2" action="/review/history">
          <label htmlFor="find" className="text-[13px] text-grey-600">
            Find a case
          </label>
          <input
            id="find"
            name="case"
            defaultValue={searchParams.case ?? ""}
            placeholder="TC-20391"
            className="min-h-9 w-36 rounded-[8px] border border-ink-900/20 bg-white px-2.5 text-[13px]"
          />
        </form>
      </div>

      <div className="overflow-x-auto rounded-md border border-ink-900/[.12] bg-white">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead className="bg-paper text-chip font-semibold uppercase tracking-[0.06em] text-grey-600">
            <tr>
              <th className="px-4 py-2.5">When</th>
              <th className="px-4 py-2.5">Who</th>
              <th className="px-4 py-2.5">What</th>
              <th className="px-4 py-2.5">Why</th>
              <th className="px-4 py-2.5">Case or member ID</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.at + e.case + e.action} className="border-t border-ink-900/[.08] align-top text-[13px] text-ink-800">
                <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{wat(e.at)}</td>
                <td className="px-4 py-2.5">{e.who}</td>
                <td className="px-4 py-2.5">
                  <span className="font-semibold text-ink-900">{ACTION_LABEL[e.action] ?? e.action}</span>
                  <span className="block text-chip text-grey-600">{caseTypeLabel(e.kind)}</span>
                </td>
                <td className="max-w-[48ch] px-4 py-2.5 leading-[1.5]">{e.note}</td>
                <td className="px-4 py-2.5 tabular-nums">
                  <Link href={`/review/${e.case}`} className="font-semibold text-green-500">
                    {caseId(e.case)}
                  </Link>
                  <span className="block text-chip text-grey-600">{e.member}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {entries.length === 0 ? (
          <p className="px-4 py-7 text-center text-nav text-grey-600">{filter ? "No case with that ID." : "No decisions yet."}</p>
        ) : null}
      </div>
    </main>
  );
}

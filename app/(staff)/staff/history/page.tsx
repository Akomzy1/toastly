import { createClient } from "@/lib/supabase/server";
import { ConsoleHeader } from "@/components/staff/console-header";
import { HistoryView, type HistoryCase, type HistoryEntry } from "@/components/staff/history-view";

/** Decision history, read-only (review-history.slim.html). */
export default async function StaffHistory({ searchParams }: { searchParams: { q?: string; case?: string } }) {
  const supabase = createClient();
  const q = (searchParams.q ?? "").slice(0, 40);
  const [{ data: list }, { data: me }] = await Promise.all([
    supabase.rpc("staff_history", { p_q: q || null }),
    supabase.rpc("staff_me"),
  ]);
  const who = (me ?? { name: "Staff", role: "Reviewer" }) as { name: string; role: string };
  const cases = (list ?? []) as HistoryCase[];
  const selectedId = searchParams.case ?? cases[0]?.id ?? null;
  const { data: item } = selectedId ? await supabase.rpc("staff_item", { p_id: selectedId }) : { data: null };
  const it = item as { id: string; case_no: number; kind: string; stage: string; decision: string | null; reason: string; events: HistoryEntry[] } | null;
  return (
    <>
      <ConsoleHeader active="history" name={who.name} role={who.role} />
      <HistoryView
        q={q}
        list={cases}
        selected={it ? { id: it.id, case_no: it.case_no, kind: it.kind, stage: it.stage, decision: it.decision } : null}
        reason={it?.reason ?? ""}
        entries={it?.events ?? []}
      />
    </>
  );
}

import { createClient } from "@/lib/supabase/server";
import { ConsoleHeader } from "@/components/staff/console-header";
import { QueueView, type QueueRow } from "@/components/staff/queue-view";
import { KIND_ORDER } from "@/lib/review";

const STATUSES = ["open", "new", "in_review", "waiting_member", "decided", "all"];

/** The review queue (review-queue.slim.html). */
export default async function StaffQueue({ searchParams }: { searchParams: { status?: string; type?: string; sort?: string } }) {
  const supabase = createClient();
  const [{ data }, { data: me }] = await Promise.all([supabase.rpc("staff_queue", { p_group: "all" }), supabase.rpc("staff_me")]);
  const who = (me ?? { name: "Staff", role: "Reviewer" }) as { name: string; role: string };
  const status = STATUSES.includes(searchParams.status ?? "") ? searchParams.status! : "open";
  const type = KIND_ORDER.includes(searchParams.type ?? "") ? searchParams.type! : "all";
  const sort = searchParams.sort === "newest" ? "newest" : "oldest";
  return (
    <>
      <ConsoleHeader active="queue" name={who.name} role={who.role} />
      <QueueView rows={(data ?? []) as QueueRow[]} status={status} type={type} sort={sort} />
    </>
  );
}

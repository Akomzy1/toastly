import { requireStaff } from "@/lib/staff";
import { QueueView, type QueueCase } from "./queue-view";

/** The review queue — design/prototype/review-queue.slim.html. */
export default async function ReviewQueuePage() {
  const { supabase } = await requireStaff();
  const { data } = await supabase.rpc("review_queue");
  return <QueueView cases={(data ?? []) as QueueCase[]} now={Date.now()} />;
}

"use client";

import { useRouter } from "next/navigation";

/** The queue's sort control (review-queue.slim.html): a select that reloads the list. */
export function SortSelect({ value, hrefFor }: { value: "oldest" | "newest"; hrefFor: { oldest: string; newest: string } }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-nav text-grey-600">
      Sort
      <select
        value={value}
        onChange={(e) => router.push(hrefFor[e.target.value as "oldest" | "newest"])}
        className="min-h-11 rounded-lg border border-ink-900/20 bg-white px-2.5 py-1.5 text-nav text-ink-900"
      >
        <option value="oldest">Oldest first</option>
        <option value="newest">Newest first</option>
      </select>
    </label>
  );
}

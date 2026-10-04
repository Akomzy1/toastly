"use client";

import { useFormStatus } from "react-dom";
import { dismissNotice } from "@/app/(app)/notices-actions";

function Button() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="flex min-h-11 min-w-11 items-center border-0 bg-transparent p-0 text-inherit underline">
      {pending ? "…" : "Got it"}
    </button>
  );
}

export function DismissNotice({ id }: { id: string }) {
  return (
    <form action={dismissNotice}>
      <input type="hidden" name="id" value={id} />
      <Button />
    </form>
  );
}

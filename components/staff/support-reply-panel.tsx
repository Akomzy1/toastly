"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { replyToTicket, setTicketStatus } from "@/app/(staff)/staff/support/actions";
import { Notice } from "@/components/ui/notice";

/**
 * Reply to the member (in Toastly Help and by email), and resolve or reopen.
 * Built from the decision panel's own form styles (review-case.slim.html).
 */
export function SupportReplyPanel({ id, reference, status }: { id: string; reference: string; status: string }) {
  const router = useRouter();
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    setSent(null);
    const r = await replyToTicket(id, reference, text);
    setBusy(false);
    if (r.error) return setError(r.error);
    setText("");
    setSent(r.emailed ? "Sent — in Toastly Help and by email." : "Sent in Toastly Help. The email didn't go: check RESEND_API_KEY.");
    router.refresh();
  }

  async function mark(next: "resolved" | "open") {
    setBusy(true);
    setError(null);
    const r = await setTicketStatus(id, reference, next);
    setBusy(false);
    if (r.error) return setError(r.error);
    router.refresh();
  }

  return (
    <div className="grid gap-2.5 border-t border-ink-900/[.08] pt-3">
      <label className="grid gap-1.5">
        <span className="text-nav font-semibold text-ink-900">Reply to the member</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          maxLength={4000}
          className="w-full rounded-lg border border-ink-900/20 bg-white px-3.5 py-3 font-sans text-ui text-ink-900 focus:border-green-500 focus:outline-none focus:ring-[3px] focus:ring-green-500/[.16]"
        />
        <span className="text-[12.5px] text-grey-600">They see it in Toastly Help and by email, from &ldquo;Toastly team&rdquo; — not your name.</span>
      </label>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {sent ? (
        <p role="status" className="m-0 text-nav text-green-500">
          {sent}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          disabled={busy || !text.trim()}
          onClick={send}
          className="min-h-12 rounded-lg bg-green-500 px-5 py-3 text-button text-white hover:bg-green-600 disabled:bg-grey-200 disabled:text-grey-600"
        >
          Send reply
        </button>
        {status === "resolved" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => mark("open")}
            className="min-h-12 rounded-lg border border-ink-900/20 px-5 py-3 text-button text-ink-900 hover:border-green-500"
          >
            Reopen
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => mark("resolved")}
            className="min-h-12 rounded-lg border border-ink-900/20 px-5 py-3 text-button text-ink-900 hover:border-green-500"
          >
            Mark resolved
          </button>
        )}
      </div>
    </div>
  );
}

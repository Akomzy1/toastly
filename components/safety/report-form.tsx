"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { reportMember } from "@/lib/safety-actions";
import type { ReportReason } from "@/lib/safety";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { ReportReasons } from "./report-reasons";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" disabled={pending} className="justify-self-start">
      {pending ? "Sending…" : "Send report"}
    </Button>
  );
}

/**
 * Report a member — from a feed card, a Gist or a date.
 *
 * NOT IN THE PROTOTYPE — flagged. The reasons are the shared list
 * (ReportReasons, the full-profile prototype's rows); then an optional note
 * and "Also block", which this surface has always offered.
 */
export function ReportForm({ memberId, name }: { memberId: string; name: string }) {
  const [state, action] = useFormState(reportMember, null);
  const [reason, setReason] = useState<{ value: ReportReason; label: string } | null>(null);

  if (state?.ok) return <Notice tone="success">{state.ok}</Notice>;

  if (!reason) {
    return (
      <div className="grid gap-3">
        <p className="text-ui font-medium text-ink-900">What happened with {name}?</p>
        <div className="overflow-hidden rounded-lg border border-ink-900/[.12] bg-white [&>div>button:first-child]:border-t-0">
          <ReportReasons onPick={(value, label) => setReason({ value, label })} />
        </div>
        {/* Marital status can't be checked by anyone — reports are how that
            standard is kept, and the copy says so rather than implying a check. */}
        <p className="text-nav text-grey-600">
          Married people aren&rsquo;t welcome here. We can&rsquo;t check anyone&rsquo;s
          marital status, so reports like this are how that rule is kept.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="reported_id" value={memberId} />
      <input type="hidden" name="reason" value={reason.value} />

      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <p className="text-ui text-ink-900">
          You&rsquo;re reporting: &ldquo;{reason.label}&rdquo;
        </p>
        <button
          type="button"
          onClick={() => setReason(null)}
          className="min-h-11 text-ui text-grey-600 underline underline-offset-4 hover:text-ink-900"
        >
          Change
        </button>
      </div>

      <Label htmlFor={`detail-${memberId}`}>
        Anything we should know? <span className="text-grey-400">(optional)</span>
        <Textarea id={`detail-${memberId}`} name="detail" rows={3} maxLength={2000} />
      </Label>

      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-ui text-ink-900">
        <input type="checkbox" name="also_block" className="h-4 w-4 accent-green-500" />
        Also block {name}
      </label>

      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      <Submit />
    </form>
  );
}

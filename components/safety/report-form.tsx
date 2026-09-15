"use client";

import { useFormState, useFormStatus } from "react-dom";
import { reportMember } from "@/lib/safety-actions";
import { REPORT_REASONS } from "@/lib/safety";
import { Button } from "@/components/ui/button";
import { Label, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" disabled={pending} className="justify-self-start">
      {pending ? "Sending…" : "Send report"}
    </Button>
  );
}

/**
 * Report a member.
 *
 * NOT IN THE PROTOTYPE — flagged. Safety & Trust promises "report from any
 * screen"; there is no approved report UI.
 */
export function ReportForm({ memberId, name }: { memberId: string; name: string }) {
  const [state, action] = useFormState(reportMember, null);

  if (state?.ok) return <Notice tone="success">{state.ok}</Notice>;

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="reported_id" value={memberId} />

      <Label htmlFor={`reason-${memberId}`}>
        What happened with {name}?
        <Select id={`reason-${memberId}`} name="reason" required defaultValue="">
          <option value="" disabled>
            Choose one…
          </option>
          {REPORT_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
      </Label>

      {/* Marital status can't be checked by anyone — reports are how that
          standard is kept, and the copy says so rather than implying a check. */}
      <p className="text-nav text-grey-600">
        Married people aren&rsquo;t welcome here. We can&rsquo;t check anyone&rsquo;s
        marital status, so reports like this are how that rule is kept.
      </p>

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

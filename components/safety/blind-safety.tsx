"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { blindBlockLocked, blindReportLocked } from "@/lib/safety-actions";
import type { ReportReason } from "@/lib/safety";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { ReportReasons } from "./report-reasons";

/**
 * Report or block from a locked inbox — decision (a).
 *
 * NOT IN THE PROTOTYPE — flagged.
 *
 * The rule this exists to satisfy: safety is never paywalled. The rule it
 * must not break: a Starter member learns nothing about who messaged them.
 * Both hold here because the member describes what happened and the server
 * resolves the sender — no id reaches this component, so there is nothing for
 * a modified client to read.
 *
 * Free on every tier, and this component reads no tier at all.
 */
function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" disabled={pending} className="justify-self-start">
      {pending ? "Sending…" : label}
    </Button>
  );
}

export function BlindSafety() {
  const [reportState, reportAction] = useFormState(blindReportLocked, null);
  const [blockState, blockAction] = useFormState(blindBlockLocked, null);
  const [open, setOpen] = useState(false);
  // The shared reason list first (ReportReasons), then the note and send.
  const [reason, setReason] = useState<{ value: ReportReason; label: string } | null>(null);

  return (
    <Card className="grid gap-4 p-[26px]">
      <div className="grid gap-1.5">
        <h2 className="text-h5 text-ink-900">
          Is somebody bothering you?
        </h2>
        <p className="text-ui text-grey-600">
          You don&rsquo;t need to read a message, or pay for anything, to report
          or block whoever sent it. We can see who they are even though you
          can&rsquo;t — that part doesn&rsquo;t wait for an upgrade.
        </p>
      </div>

      {reportState?.ok ? <Notice tone="success">{reportState.ok}</Notice> : null}
      {blockState?.ok ? <Notice tone="success">{blockState.ok}</Notice> : null}

      {!open && !reportState?.ok ? (
        <Button
          variant="outline"
          className="justify-self-start"
          onClick={() => setOpen(true)}
        >
          Report or block
        </Button>
      ) : null}

      {open && !reportState?.ok ? (
        <>
          {!reason ? (
            <div className="grid gap-3">
              <p className="text-ui font-medium text-ink-900">What&rsquo;s happening?</p>
              <div className="overflow-hidden rounded-lg border border-ink-900/[.12] bg-white [&>div>button:first-child]:border-t-0">
                <ReportReasons onPick={(value, label) => setReason({ value, label })} />
              </div>
            </div>
          ) : (
          <form action={reportAction} className="grid gap-4">
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

            <Label htmlFor="blind-detail">
              Anything we should know?{" "}
              <span className="text-grey-400">(optional)</span>
              <Textarea id="blind-detail" name="detail" rows={3} maxLength={2000} />
            </Label>

            {reportState?.error ? (
              <Notice tone="error">{reportState.error}</Notice>
            ) : null}
            <Submit label="Send report" />
          </form>
          )}

          {/* The permanence is stated before the button, not after it: an
              innocent sender gets caught by this too, and that trade is the
              member's to make knowingly. */}
          <form action={blockAction} className="grid gap-3 border-t border-grey-200 pt-4">
            <p className="text-ui text-grey-600">
              You can also block everyone whose messages are waiting. Blocking
              is permanent and can&rsquo;t be undone — if several people have
              messaged you, this blocks all of them, including anyone who
              hasn&rsquo;t done anything wrong.
            </p>
            {blockState?.error ? (
              <Notice tone="error">{blockState.error}</Notice>
            ) : null}
            <Submit label="Block everyone waiting" />
          </form>
        </>
      ) : null}
    </Card>
  );
}

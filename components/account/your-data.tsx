"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { deleteAccount } from "@/lib/account-actions";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";

/**
 * Your data — download a copy, or delete the account (privacy policy §10).
 *
 * NOT IN THE PROTOTYPE — flagged. Built in the visual language of
 * genotype-settings.slim.html's row and bottom-sheet delete, so the two
 * destructive flows in the app look and behave the same: Cancel and Delete
 * at equal weight, side by side, focus on Cancel, Escape closes.
 *
 * Free on every tier: this component reads no plan.
 */

const OUTLINE =
  "inline-flex min-h-12 w-full items-center justify-center rounded-lg border border-ink-900/20 bg-transparent px-5 py-3 text-button text-ink-900 transition-colors duration-200 hover:border-green-500 hover:bg-green-50";

function ConfirmDelete() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={OUTLINE}>
      {pending ? "Deleting…" : "Delete account"}
    </button>
  );
}

export function YourData({ initialSheetOpen = false }: { initialSheetOpen?: boolean }) {
  const [sheet, setSheet] = React.useState(initialSheetOpen);
  const [understood, setUnderstood] = React.useState(false);
  const [state, action] = useFormState(deleteAccount, null);
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!sheet) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheet(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet]);

  return (
    <Card className="grid gap-5 p-[26px]">
      <div className="grid gap-1.5">
        <h2 className="text-h5 text-ink-900">Your data</h2>
        <p className="text-ui text-grey-600">
          Download a copy of what Toastly holds about you, or delete your
          account.
        </p>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <a href="/api/account/export" download className={OUTLINE}>
          Download my data
        </a>
        <button type="button" onClick={() => setSheet(true)} className={OUTLINE}>
          Delete my account
        </button>
      </div>

      {sheet ? (
        <div
          className="fixed inset-0 z-50 flex items-end bg-green-800/[.55]"
          onClick={() => setSheet(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-delete-title"
            onClick={(e) => e.stopPropagation()}
            className="mx-auto grid w-full max-w-[640px] gap-3.5 rounded-t-[20px] bg-white px-4 pb-5 pt-2.5"
          >
            <span aria-hidden="true" className="h-1 w-9 justify-self-center rounded-pill bg-grey-200" />
            <h2
              id="account-delete-title"
              className="mt-1 font-serif text-[21px] font-bold leading-[1.25] text-ink-900"
            >
              Delete your account?
            </h2>
            <p className="text-[14.5px] leading-relaxed text-ink-800">
              Your profile, matches, messages, photos and genotype are deleted
              straight away and can&rsquo;t be recovered. We keep only what our
              privacy policy says we must: records of reports about your
              account, and payment records.
            </p>

            <form action={action} className="grid gap-3.5">
              <label
                className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-[13px] py-3 ${
                  understood ? "border-green-500 bg-green-50" : "border-ink-900/20 bg-white"
                }`}
              >
                <input
                  type="checkbox"
                  name="confirm"
                  checked={understood}
                  onChange={(e) => setUnderstood(e.target.checked)}
                  className="mt-1 h-4 w-4 flex-shrink-0 accent-green-500"
                />
                <span className="text-[14.5px] leading-[1.55] text-ink-900">
                  I understand this can&rsquo;t be undone.
                </span>
              </label>

              {state?.error ? <Notice tone="error">{state.error}</Notice> : null}

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  ref={cancelRef}
                  type="button"
                  onClick={() => setSheet(false)}
                  className={OUTLINE}
                >
                  Cancel
                </button>
                <ConfirmDelete />
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

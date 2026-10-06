"use client";

import * as React from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { deleteAccount } from "@/lib/account-actions";
import { Notice } from "@/components/ui/notice";
import { AppColumn } from "@/components/app/app-band";
import { cn } from "@/lib/utils";

function Confirm({ ok }: { ok: boolean }) {
  const { pending } = useFormStatus();
  const on = ok && !pending;
  return (
    <button
      type="submit"
      disabled={!on}
      aria-disabled={!on}
      className={cn(
        "min-h-12 rounded-lg px-5 py-3.5 text-button",
        on ? "bg-green-500 text-white hover:bg-green-600" : "cursor-not-allowed bg-grey-200 text-grey-600",
      )}
    >
      {pending ? "Deleting…" : "Delete my account"}
    </button>
  );
}

/**
 * The two steps of account-delete.slim.html. Plain, never alarming: leaving
 * is an ordinary choice, so there is no red and no warning tone. Ported from
 * live-profile-and-prompt-14; replaces main's invented delete sheet.
 *
 * Step 1 shows any unspent coins and offers to use them first — deleting
 * forfeits them (decided 5 October 2026). Step 2 is the typed confirmation.
 */
export function DeleteFlow({ coins, reviewOpen }: { coins: number; reviewOpen: boolean }) {
  const [step, setStep] = React.useState<1 | 2>(1);
  const [typed, setTyped] = React.useState("");
  const [state, action] = useFormState(deleteAccount, null);
  const ok = typed.trim().toUpperCase() === "DELETE";
  const outline =
    "grid min-h-12 place-items-center rounded-lg border border-ink-900/20 bg-transparent p-3 text-button text-ink-900 no-underline transition-colors hover:border-green-500 hover:bg-green-50";

  return (
    <>
      <div className="flex items-center gap-2.5 bg-green-800 px-4 py-5">
        {step === 2 ? (
          <button
            type="button"
            onClick={() => setStep(1)}
            aria-label="Back"
            className="-my-3 -ml-3 grid h-11 w-11 place-items-center text-[20px] leading-none text-champagne"
          >
            ‹
          </button>
        ) : (
          <Link href="/profile/data" aria-label="Back" className="-my-3 -ml-3 grid h-11 w-11 place-items-center text-[20px] leading-none text-champagne no-underline">
            ‹
          </Link>
        )}
        <div className="grid gap-0.5">
          <p className="font-serif text-[19px] font-bold text-white">Delete your account</p>
          <p className="text-[13px] text-white/[.66]">Step {step} of 2 · Your data</p>
        </div>
      </div>

      {step === 1 ? (
        <AppColumn gap="gap-[22px]">
          <div className="grid gap-3 px-0.5">
            <h2 className="font-serif text-[24px] font-bold leading-[1.2] text-ink-900">What happens when you delete</h2>
            <p className="text-ui leading-[1.6] text-ink-800">
              Your profile, photos, messages and matches are deleted within 30 days. We keep payment records and safety
              reports for as long as the law requires, without your name.
            </p>
            {reviewOpen ? (
              <p className="text-ui leading-[1.6] text-ink-800">Some safety records are kept until an open review is settled.</p>
            ) : null}
          </div>

          {coins > 0 ? (
            <div className="grid gap-3.5 rounded-xl border border-ink-900/[.12] bg-white px-[15px] py-4">
              <div className="flex items-center gap-3">
                <svg width="40" height="40" viewBox="12 12 24 24" fill="none" aria-hidden="true" className="flex-shrink-0">
                  <circle cx="24" cy="24" r="9.5" strokeWidth="3" className="stroke-gold-600" />
                </svg>
                <p className="text-ui leading-[1.55] text-ink-900">
                  You have {coins} coin{coins === 1 ? "" : "s"}. They&rsquo;ll be lost when you delete your account.
                </p>
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(128px,1fr))] gap-2.5">
                <Link href="/coins" className={outline}>
                  Use my coins first
                </Link>
                <button type="button" onClick={() => setStep(2)} className={outline}>
                  Continue
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setStep(2)} className={cn(outline, "w-full px-5 py-3.5")}>
              Continue
            </button>
          )}
        </AppColumn>
      ) : (
        <AppColumn gap="gap-5">
          <h2 className="px-0.5 font-serif text-[24px] font-bold leading-[1.2] text-ink-900">Confirm by typing DELETE</h2>
          <form action={action} className="grid gap-5">
            <div className="grid gap-2">
              <label htmlFor="del-confirm" className="text-nav font-semibold text-ink-900">
                Type DELETE
              </label>
              <input
                id="del-confirm"
                name="confirm"
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className="min-h-[52px] w-full rounded-lg border border-ink-900/[.24] bg-white px-3.5 text-[16px] tracking-[0.06em] text-ink-900 outline-none focus:border-green-500 focus:shadow-[0_0_0_3px_rgba(0,105,92,0.16)]"
              />
            </div>
            {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
            <Confirm ok={ok} />
          </form>
        </AppColumn>
      )}
    </>
  );
}

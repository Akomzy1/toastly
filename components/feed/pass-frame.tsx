"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { passOn, bringBack } from "@/lib/pass-actions";
import { UndoToast } from "./undo-toast";

/** Ten seconds to change your mind (PRD §5.2.5). */
export const UNDO_MS = 10_000;

type Ctx = { first: string; busy: boolean; error: string | null; pass: () => void };
const PassContext = React.createContext<Ctx | null>(null);
export const usePass = () => React.useContext(PassContext);

/**
 * Wraps one card in Today's six (design/prototype/not-for-me.html, states B–D).
 *
 * "Not for me" fades the card and closes its space, leaving a calm line; the
 * toast stays for ten seconds and Undo puts the card back in the same place.
 * Nothing here tells the other person. Reloading keeps the card collapsed, since
 * the pass is in the database. It is not a block and not a report.
 */
export function PassFrame({
  memberId,
  first,
  passed: passedAlready = false,
  toastOnMount = false,
  children,
}: {
  memberId: string;
  first: string;
  /** Already passed on (read from the member's own list on the server). */
  passed?: boolean;
  /** Arrived here from the full profile's "Not for me": show the toast. */
  toastOnMount?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [passed, setPassed] = React.useState(passedAlready);
  const [toast, setToast] = React.useState(toastOnMount && passedAlready);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const timer = React.useRef<number | null>(null);

  const armToast = React.useCallback(() => {
    setToast(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(false), UNDO_MS);
  }, []);
  React.useEffect(() => {
    if (toastOnMount && passedAlready) armToast();
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [toastOnMount, passedAlready, armToast]);

  const pass = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    const res = await passOn(memberId);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setPassed(true);
    armToast();
  }, [memberId, armToast]);

  async function undo() {
    setBusy(true);
    const res = await bringBack(memberId);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    if (timer.current) window.clearTimeout(timer.current);
    setToast(false);
    setPassed(false);
    router.refresh();
  }

  return (
    <PassContext.Provider value={{ first, busy, error, pass }}>
      <div className="relative">
        <div className={`grid transition-[grid-template-rows] duration-[400ms] motion-reduce:transition-none ${passed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}>
          <div className={`min-h-0 ${passed ? "overflow-hidden" : ""}`}>
            <div className={`transition-[opacity,transform] duration-300 motion-reduce:transition-none ${passed ? "scale-[.98] opacity-0" : "opacity-100"}`} aria-hidden={passed || undefined}>
              {children}
            </div>
          </div>
        </div>
        <div className={`grid transition-[grid-template-rows] duration-[350ms] motion-reduce:transition-none ${passed ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
          <div className="min-h-0 overflow-hidden">
            {/* A pass never refills the slot the same day (PRD §5.2.5, decided
                13 October 2026): six a day means six people seen a day. */}
            <p className="m-0 flex min-h-[82px] items-center rounded-[14px] border border-dashed border-ink-900/[.18] px-4 py-3.5 text-[14px] leading-normal text-grey-600">
              Your next six arrive tomorrow.
            </p>
          </div>
        </div>
      </div>
      <UndoToast open={toast} text={`Done. You won't see ${first} again.`} onUndo={undo} />
    </PassContext.Provider>
  );
}

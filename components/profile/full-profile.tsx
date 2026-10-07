"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { reportMember, blockMember } from "@/lib/safety-actions";
import { respondToInvite } from "@/app/(app)/gist/actions";
import { Notice } from "@/components/ui/notice";
import { SafetyPill } from "@/components/app/nav";
import { ReportReasons } from "@/components/safety/report-reasons";
import { originSub, type FullProfileView } from "@/lib/full-profile-view";

/**
 * Another member's full profile (PRD §5.2.4), built against
 * design/prototype/full-profile-view.slim.html: photos, who they are, their
 * answers, then the details they've chosen to show this viewer. A field that
 * isn't shown is absent — no placeholder, no "hidden" label. No score, no
 * summary of the person, nothing about who else they're talking to.
 *
 * Opening this screen records nothing (no "who viewed you"). Report and block
 * are in the ⋯ menu, free on every plan.
 */

type Panel = null | "menu" | "report" | "reported" | "block" | "blocked";


const OUTLINE =
  "flex min-h-11 items-center justify-center gap-2 rounded-md border border-ink-900/20 bg-transparent px-3.5 py-2.5 text-[14px] font-semibold text-ink-900 no-underline transition-colors hover:border-green-500 hover:bg-green-50 hover:text-ink-900";
const PANEL =
  "fixed inset-x-2.5 top-[58px] z-[70] mx-auto grid max-w-[540px] rounded-xl border border-ink-900/[.12] bg-white shadow-[0_18px_40px_-20px_rgba(5,3,9,0.6)]";
const PRIMARY =
  "flex min-h-12 items-center justify-center rounded-lg border-0 bg-gold-500 px-5 py-3 text-[15px] font-semibold text-green-800 no-underline hover:bg-gold-300 hover:text-green-800";
const SECONDARY =
  "min-h-12 rounded-lg border border-ink-900/20 bg-transparent px-5 py-3 text-[15px] font-semibold text-ink-900 hover:border-green-500 hover:bg-green-50";

function Seal({ ring }: { ring: boolean }) {
  return (
    <span aria-hidden="true" className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-pill bg-green-800">
      <svg width="26" height="26" viewBox="-1.5 -1.5 27 27" fill="none">
        {ring ? <circle cx="12" cy="12" r="12.2" stroke="#EBD9AE" strokeWidth="0.9" /> : null}
        <path
          d="M12 2.5 14.1 4l2.5-.5.9 2.4 2.2 1.3-.6 2.5 1.5 2.1-1.5 2.1.6 2.5-2.2 1.3-.9 2.4-2.5-.5L12 21.5 9.9 20l-2.5.5-.9-2.4-2.2-1.3.6-2.5L3.4 12l1.5-2.1-.6-2.5 2.2-1.3.9-2.4 2.5.5z"
          stroke="#FFB300"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path d="m8.6 12.2 2.3 2.3 4.5-4.8" stroke="#FFB300" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function Tick() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" stroke="#00695C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Clock() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.6" stroke="#050309" strokeWidth="1.6" />
      <path d="M12 7.4V12l3.2 2" stroke="#050309" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function FullProfile({
  view,
  back,
  preview,
}: {
  view: FullProfileView;
  back: string;
  /** Mobile audit only: open a panel without tapping. */
  preview?: { panel?: Panel; reported?: string };
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(preview?.panel ?? null);
  const [reported, setReported] = useState(preview?.reported ?? "");
  const [photo, setPhoto] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gallery = useRef<HTMLDivElement>(null);
  const { first } = view;

  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPanel(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel]);

  function goPhoto(i: number) {
    const el = gallery.current;
    if (el) el.scrollTo({ left: i * (el.clientWidth + 8), behavior: "smooth" });
    setPhoto(i);
  }

  async function report(label: string, reason: string) {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("reported_id", view.id);
    fd.set("reason", reason);
    const res = await reportMember(null, fd);
    setBusy(false);
    if (res?.error) return setError(res.error);
    setReported(label);
    setPanel("reported");
  }

  async function block() {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("blocked_id", view.id);
    const res = await blockMember(null, fd);
    setBusy(false);
    if (res?.error) return setError(res.error);
    setPanel("blocked");
  }

  async function accept() {
    if (!view.invite) return;
    setBusy(true);
    setError(null);
    const res = await respondToInvite(view.invite.sessionId, true);
    if (res?.error) {
      setBusy(false);
      return setError(res.error);
    }
    router.push(`/gist/${view.invite.sessionId}`);
  }

  const close = () => {
    // Once blocked, there's no profile to go back to.
    if (panel === "blocked") return router.push("/feed");
    setPanel(null);
    setError(null);
  };
  const n = view.photos.length;

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <div className="flex items-center gap-2.5 bg-green-800 py-3 pl-4 pr-1.5">
        <Link href={back} aria-label="Back" className="-my-2 -ml-2 grid h-11 w-11 flex-shrink-0 place-items-center text-[20px] leading-none text-champagne no-underline hover:text-champagne">
          ‹
        </Link>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h1 className="m-0 break-words font-serif text-[19px] font-bold leading-tight text-white">{first}&rsquo;s profile</h1>
          <p className="m-0 text-[13px] text-white/[.66]">{originSub(view.origin)}</p>
        </div>
        {/* The Safety pill sits in the band on every in-app screen (decided
            7 October 2026); Report and Block stay in the ⋯ menu. */}
        <SafetyPill />
        <button
          type="button"
          onClick={() => setPanel(panel ? null : "menu")}
          aria-label="More options"
          aria-haspopup="menu"
          aria-expanded={!!panel}
          className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-pill border-0 bg-transparent hover:bg-champagne/[.12]"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="5.5" cy="12" r="1.6" fill="#EBD9AE" />
            <circle cx="12" cy="12" r="1.6" fill="#EBD9AE" />
            <circle cx="18.5" cy="12" r="1.6" fill="#EBD9AE" />
          </svg>
        </button>
      </div>

      <div className="grid content-start gap-[22px] px-3.5 pb-7 pt-3.5">
        {n ? (
          <div className="grid gap-2.5">
            <div
              ref={gallery}
              onScroll={(e) => {
                const el = e.currentTarget;
                const i = Math.round(el.scrollLeft / (el.clientWidth + 8));
                if (i !== photo) setPhoto(i);
              }}
              aria-label={`${first}'s photos`}
              className="flex snap-x snap-mandatory gap-2 overflow-x-auto rounded-xl [scrollbar-width:none]"
            >
              {view.photos.map((p, i) => (
                <div key={p.id} className="relative aspect-[4/5] flex-[0_0_100%] snap-start overflow-hidden rounded-xl bg-green-50">
                  {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                  <img
                    src={p.url}
                    alt={i === 0 ? `${first}, main photo` : `${first}, photo ${i + 1} of ${n}`}
                    className="block h-full w-full object-cover"
                    loading={i === 0 ? "eager" : "lazy"}
                  />
                </div>
              ))}
            </div>
            {n > 1 ? (
              // The prototype draws 22px dots; each is a 44px tap target here
              // (mobile audit), so they sit a little further apart.
              <div className="-my-2.5 flex justify-center">
                {view.photos.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => goPhoto(i)}
                    aria-label={`Photo ${i + 1} of ${n}`}
                    aria-current={i === photo ? "true" : undefined}
                    className="grid h-11 w-11 place-items-center border-0 bg-transparent p-0"
                  >
                    <span className={`h-[7px] rounded-pill transition-[width] duration-200 ${i === photo ? "w-[18px] bg-green-800" : "w-[7px] bg-grey-200"}`} />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          // A live profile always has photos; none here means the owner's
          // reveal choice doesn't include this viewer yet (decided 7 October 2026).
          <p className="m-0 rounded-xl border border-ink-900/[.12] bg-white px-4 py-3.5 text-[14.5px] text-grey-600">
            Photos appear once you match.
          </p>
        )}

        <div className="grid gap-3.5 px-0.5">
          <div className="grid gap-1">
            <h2 className="m-0 font-serif text-[24px] font-bold leading-[1.2] text-ink-900">
              {view.name}
              {view.age !== null ? `, ${view.age}` : ""}
            </h2>
            {view.city ? <p className="m-0 text-[14px] text-grey-600">{view.city}</p> : null}
          </div>
          <div className="flex items-center gap-2.5">
            <Seal ring={view.idChecked} />
            <span className="grid min-w-0 gap-px">
              <span className="text-[14px] font-semibold text-ink-900">Verified Real</span>
              <span className="text-[13px] leading-[1.4] text-grey-600">
                {view.idChecked ? "Main photo matches their selfie · ID checked" : "Main photo matches their selfie"}
              </span>
            </span>
          </div>
          {view.intent ? <p className="m-0 text-[14.5px] text-grey-600">{view.intent}</p> : null}
        </div>

        {view.answers.length ? (
          <div className="grid gap-3">
            {view.answers.map((q) => (
              <div key={q.id} className="grid gap-3.5 rounded-xl border border-ink-900/[.12] bg-white px-3.5 pb-3.5 pt-4">
                <div className="grid gap-1.5">
                  <p className="m-0 font-serif text-[18px] font-bold leading-[1.3] text-ink-900 [text-wrap:balance]">{q.prompt}</p>
                  <p className="m-0 text-[15px] leading-[1.6] text-ink-800 [text-wrap:pretty]">&ldquo;{q.answer}&rdquo;</p>
                </div>
                {view.action === "reply" ? (
                  <Link href={`/feed/reply/${q.id}`} className={OUTLINE}>
                    Reply to this
                  </Link>
                ) : view.action === "gist" ? (
                  <div className="grid gap-[7px]">
                    <Link href={`/feed/reply/${q.id}`} className={OUTLINE}>
                      <Clock />
                      Ask for a Gist about this
                    </Link>
                    <p className="m-0 text-center text-[12.5px] text-grey-600">
                      {view.gistsLeft === 1 ? "1 Gist left this month" : `${view.gistsLeft ?? 0} Gists left this month`}
                    </p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {view.details.length ? (
          <div className="grid gap-1.5">
            <p className="m-0 px-0.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-grey-600">Details</p>
            <div className="rounded-xl border border-ink-900/[.12] bg-white px-[15px] py-0.5">
              <dl className="m-0 grid">
                {view.details.map((r, i) => (
                  <div key={r.label} className={`flex min-h-11 items-baseline justify-between gap-4 py-2.5 ${i ? "border-t border-ink-900/10" : ""}`}>
                    <dt className="flex-shrink-0 text-[13.5px] text-grey-600">{r.label}</dt>
                    <dd className="m-0 grid justify-items-end gap-[3px] text-right">
                      <span className="text-[14.5px] font-medium text-ink-800">{r.value}</span>
                      {r.verified ? (
                        <span className="inline-flex items-center gap-1 text-[12.5px] text-green-500">
                          <Tick />
                          Verified
                        </span>
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        ) : null}
      </div>

      {view.invite ? (
        <div className="sticky bottom-[calc(58px+env(safe-area-inset-bottom))] z-[1] grid gap-2 border-t border-ink-900/[.12] bg-white px-3.5 pb-4 pt-3 shadow-[0_-12px_28px_-22px_rgba(5,3,9,0.5)] lg:bottom-0">
          {error && !panel ? <Notice tone="error">{error}</Notice> : null}
          <div className="grid grid-cols-2 gap-2.5">
            {/* "Not now" leaves the invitation open — it closes by itself after three days. */}
            <Link href="/gist" className="flex min-h-12 items-center justify-center rounded-lg border border-ink-900/20 bg-white px-3 py-3.5 text-[15px] font-semibold text-ink-900 no-underline hover:border-green-500 hover:bg-green-50 hover:text-ink-900">
              Not now
            </Link>
            <button type="button" disabled={busy} onClick={accept} className={`${PRIMARY} px-3 py-3.5`}>
              Accept Gist
            </button>
          </div>
          {/* A Gist counts when it connects, for both people (decision of
              3 October 2026), so "It's free to accept" is only the whole
              truth on a paid plan — as on the invite screen. */}
          <p className="m-0 text-center text-[13px] leading-normal text-grey-600">
            {view.invite.starter
              ? "It's free to accept. If the call happens, it counts as one of your 2 Gists this month."
              : "It's free to accept."}
          </p>
        </div>
      ) : null}

      {panel ? <div onClick={close} aria-hidden="true" className="fixed inset-0 z-[60] bg-ink-900/[.42]" /> : null}

      {panel === "menu" ? (
        <div role="menu" className="fixed right-2.5 top-[58px] z-[70] grid w-[220px] overflow-hidden rounded-lg border border-ink-900/[.12] bg-white shadow-[0_18px_40px_-20px_rgba(5,3,9,0.6)] lg:right-[calc(50%-270px)]">
          <button type="button" role="menuitem" onClick={() => setPanel("report")} className="min-h-12 border-0 bg-transparent px-4 py-3 text-left text-[15px] font-medium text-ink-900 hover:bg-paper">
            Report {first}
          </button>
          <button type="button" role="menuitem" onClick={() => setPanel("block")} className="min-h-12 border-0 border-t border-ink-900/10 bg-transparent px-4 py-3 text-left text-[15px] font-medium text-error hover:bg-paper">
            Block {first}
          </button>
        </div>
      ) : null}

      {panel === "report" ? (
        <div role="dialog" aria-label={`Report ${first}`} className={`${PANEL} max-h-[calc(100dvh-74px)] gap-1.5 overflow-y-auto pb-2 pt-[18px]`}>
          <div className="grid gap-1 px-4 pb-1.5">
            <p className="m-0 font-serif text-[19px] font-bold text-ink-900">Report {first}</p>
            <p className="m-0 text-[13.5px] leading-normal text-grey-600">{first} isn&rsquo;t told who reported them.</p>
          </div>
          {error ? <div className="px-4"><Notice tone="error">{error}</Notice></div> : null}
          {/* The whole list, the same on every report surface (decided 7 October 2026). */}
          <ReportReasons disabled={busy} onPick={(reason, label) => report(label, reason)} />
          <button type="button" onClick={close} className="min-h-11 justify-self-center border-0 bg-transparent px-[18px] py-2.5 text-[14px] font-semibold text-grey-600 hover:text-ink-900">
            Cancel
          </button>
        </div>
      ) : null}

      {panel === "reported" ? (
        <div role="dialog" aria-label="Report sent" className={`${PANEL} gap-3.5 px-4 pb-4 pt-5`}>
          <div className="grid gap-1.5">
            <p className="m-0 font-serif text-[19px] font-bold text-ink-900">Thank you for telling us</p>
            <p className="m-0 text-[14px] leading-[1.6] text-grey-600 [text-wrap:pretty]">
              You reported: &ldquo;{reported}&rdquo;. Our safety team reviews every report within 24 hours.
            </p>
          </div>
          <div className="grid gap-2">
            <button type="button" onClick={() => setPanel("block")} className={SECONDARY}>
              Block {first} too
            </button>
            <button type="button" onClick={close} className={PRIMARY}>
              Done
            </button>
          </div>
        </div>
      ) : null}

      {panel === "block" ? (
        <div role="dialog" aria-label={`Block ${first}`} className={`${PANEL} gap-3.5 px-4 pb-4 pt-5`}>
          <div className="grid gap-1.5">
            <p className="m-0 font-serif text-[19px] font-bold text-ink-900">Block {first}?</p>
            <p className="m-0 text-[14px] leading-[1.6] text-grey-600 [text-wrap:pretty]">
              You won&rsquo;t see each other again. This can&rsquo;t be undone.
            </p>
          </div>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <div className="grid gap-2">
            <button type="button" disabled={busy} onClick={block} className="min-h-12 rounded-lg border-0 bg-error px-5 py-3 text-[15px] font-semibold text-white hover:opacity-90">
              Block
            </button>
            <button type="button" onClick={close} className={SECONDARY}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {panel === "blocked" ? (
        <div role="status" className={`${PANEL} gap-3.5 px-4 pb-4 pt-5`}>
          <p className="m-0 font-serif text-[19px] font-bold text-ink-900">{first} is blocked</p>
          <Link href="/feed" className={PRIMARY}>
            Back to Today&rsquo;s six
          </Link>
        </div>
      ) : null}
    </div>
  );
}

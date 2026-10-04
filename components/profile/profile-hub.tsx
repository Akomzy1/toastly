"use client";

import * as React from "react";
import Link from "next/link";
import { HelpPanel } from "@/components/help/help-panel";
import { Monogram } from "@/components/gist/invite-parts";
import { signOut } from "@/app/(auth)/actions";

/**
 * Profile as the hub — nav-profile-hub.slim.html.
 *
 * Your profile and prompts come first, then one plain list to everything that
 * is not a tab. Safety kit is listed here too, marked free on every plan.
 * Sign out sits at the foot of the page (on desktop it's in the header).
 *
 * Deviations, flagged:
 *   - A monogram stands in for the photo (photo upload is Prompt 14, parked).
 *   - "Edit profile and photos" reads "Edit profile" until photos exist.
 *   - "Answer another prompt" under the prompts is not in the prototype: a
 *     member with no answers yet needs a way to start.
 */

export type HubPrompt = { id: number; prompt: string; answer: string };

const HUB: { label: string; sub: string; href?: string; help?: true }[] = [
  { label: "Coins", sub: "Your balance and date stakes", href: "/coins" },
  { label: "Couple Mode", sub: "Free on every plan", href: "/couple" },
  { label: "Safety kit", sub: "Free on every plan, always", href: "/safety-kit" },
  { label: "Verification", sub: "Selfie and ID checks", href: "/verify" },
  { label: "Toastly Help", sub: "Answers, and a person when you need one", help: true },
  { label: "Your data", sub: "See, download or delete what we hold", href: "/profile/data" },
];

const LABEL = "m-0 mt-2 px-0.5 font-sans text-chip font-semibold uppercase tracking-[0.12em] text-grey-600";
const ROW =
  "flex min-h-[60px] w-full items-center justify-between gap-3 border-0 bg-transparent px-[15px] py-[11px] text-left font-sans no-underline hover:bg-paper";

export function ProfileHub({
  name,
  meta,
  verified,
  prompts,
}: {
  name: string;
  /** "Yaba, Lagos · Starter" */
  meta: string;
  verified: boolean;
  prompts: HubPrompt[];
}) {
  const [help, setHelp] = React.useState(false);
  return (
    <div className="mx-auto grid w-full max-w-[680px] content-start gap-3 px-3.5 pb-6 pt-4">
      <div className="grid gap-3.5 rounded-xl border border-ink-900/10 bg-white p-3.5">
        <div className="flex items-center gap-3.5">
          <Monogram name={name} size={64} />
          <div className="grid min-w-0 flex-1 gap-[3px]">
            <p className="m-0 font-serif text-[19px] font-bold text-ink-900">{name}</p>
            <p className="m-0 text-[13px] text-grey-600">{meta}</p>
          </div>
          {verified ? (
            <span className="flex-shrink-0 rounded-pill border border-green-500/[.24] bg-green-50 px-[9px] py-[5px] text-chip font-semibold text-green-550">
              Verified
            </span>
          ) : null}
        </div>
        <Link
          href="/profile/edit"
          className="flex min-h-11 items-center justify-center rounded-md border border-ink-900/20 bg-transparent px-3 py-2.5 text-nav font-semibold text-ink-900 no-underline hover:border-green-500 hover:bg-green-50"
        >
          Edit profile
        </Link>
      </div>

      <p className={LABEL}>Your prompts</p>
      {prompts.map((q) => (
        <Link
          key={q.id}
          href={`/profile/prompts/${q.id}`}
          className="grid gap-[3px] rounded-[14px] border border-ink-900/10 bg-white px-3.5 py-3 text-inherit no-underline hover:border-green-500"
        >
          <span className="text-[12.5px] font-semibold leading-[1.45] text-grey-600">{q.prompt}</span>
          <span className="text-nav leading-normal text-ink-800">&ldquo;{q.answer}&rdquo;</span>
        </Link>
      ))}
      <Link href="/profile/prompts" className="inline-flex min-h-11 items-center justify-self-start px-0.5 text-nav font-semibold text-green-500 underline underline-offset-4">
        {prompts.length ? "Answer another prompt" : "Answer your first prompt"}
      </Link>

      <p className={LABEL}>More</p>
      <div className="grid overflow-hidden rounded-xl border border-ink-900/[.12] bg-white">
        {HUB.map((h, i) => {
          const body = (
            <>
              <span className="grid min-w-0 gap-0.5">
                <span className="text-ui font-medium text-ink-900">{h.label}</span>
                <span className="text-[13px] leading-[1.45] text-grey-600">{h.sub}</span>
              </span>
              <span aria-hidden="true" className="flex-shrink-0 text-[16px] text-grey-400">
                ›
              </span>
            </>
          );
          const rule = i ? " border-t border-solid border-ink-900/10" : "";
          return h.help ? (
            <button key={h.label} type="button" onClick={() => setHelp(true)} className={ROW + rule}>
              {body}
            </button>
          ) : (
            <Link key={h.label} href={h.href!} className={ROW + rule}>
              {body}
            </Link>
          );
        })}
      </div>

      <form action={signOut} className="justify-self-center lg:hidden">
        <button type="submit" className="min-h-11 px-[18px] py-2.5 text-nav font-semibold text-grey-600 hover:text-ink-900">
          Sign out
        </button>
      </form>

      <HelpPanel open={help} onClose={() => setHelp(false)} />
    </div>
  );
}

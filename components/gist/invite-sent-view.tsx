import Link from "next/link";
import { AMBER, AnswerStrip, Band, Monogram, OUTLINE } from "./invite-parts";

/** gist-invite-sent.slim.html (prototype 4) — shared by the page and the audit harness. */
export function InviteSentView({
  otherName,
  starter,
  since,
  answer,
}: {
  otherName: string;
  starter: boolean;
  since: string;
  answer: { prompt: string; answer: string } | null;
}) {
  const name = otherName.split(" ")[0];
  return (
    <div className="mx-auto grid w-full max-w-[680px]">
      <Band title="Invite sent" sub="Gist" />
      <div className="grid content-start gap-6 px-3.5 pb-6 pt-7">
        <div className="grid justify-items-center gap-3.5 px-1.5 text-center">
          <span className="relative">
            <Monogram name={otherName} size={80} />
            <span aria-hidden="true" className="absolute -bottom-0.5 -right-0.5 grid h-[30px] w-[30px] place-items-center rounded-pill border-[3px] border-paper bg-gold-500">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M5 12.5l4.5 4.5L19 7" stroke="#001F1B" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </span>
          <h2 className="m-0 mt-1 font-serif text-[24px] font-bold leading-[1.2] text-ink-900 [text-wrap:balance]">
            Gist invite sent to {name}.
          </h2>
          <p className="m-0 text-ui leading-[1.6] text-ink-800">We&rsquo;ll let you know when they reply.</p>
          {starter ? (
            <p className="m-0 text-[13px] leading-[1.6] text-grey-600">
              This only counts toward your 2 Gists once the call connects.
            </p>
          ) : null}
        </div>

        <div className="grid gap-2.5">
          <p className="m-0 px-0.5 font-sans text-chip font-semibold uppercase tracking-[0.12em] text-grey-600">
            Find it in Gists · Waiting on them
          </p>
          <Link href="/gist" className="grid gap-2.5 rounded-[14px] border border-ink-900/10 bg-white p-3 text-inherit no-underline hover:border-green-500">
            <span className="flex items-center gap-3">
              <Monogram name={otherName} size={48} />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="text-ui font-semibold text-ink-900">{otherName}</span>
                <span className="text-[13px] text-grey-600">Invite sent · {since}</span>
              </span>
              <span aria-hidden="true" className="text-[16px] text-grey-400">›</span>
            </span>
            {answer ? <AnswerStrip whose={`${name}'s answer`} prompt={answer.prompt} answer={answer.answer} /> : null}
          </Link>
        </div>

        <div className="grid gap-2.5">
          <Link href="/gist" className={OUTLINE}>
            See your Gists
          </Link>
          <Link href="/feed" className={AMBER}>
            Back to today&rsquo;s six
          </Link>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { wat, waited } from "@/lib/review";
import {
  PLAN_LABEL,
  SUPPORT_CATEGORY_LABEL,
  SUPPORT_STATUS_LABEL,
  SUPPORT_STATUS_STYLE,
  SUPPORT_TRIGGER_LABEL,
  VERIFICATION_LABEL,
} from "@/lib/support-labels";
import { SupportReplyPanel } from "./support-reply-panel";

/**
 * One Toastly Help ticket. NOT IN A PROTOTYPE — flagged: built from the
 * review case's own cards and type (review-case.slim.html).
 *
 * What staff see, and say so on screen: the reference, the topic, its
 * urgency, the member's plan and verification status when they asked, the
 * Toastly Help conversation (member and assistant only), and the team's
 * replies. Never member-to-member messages, Gist data, photos, selfies, ID
 * numbers or genotype — staff_support_ticket reads none of them.
 */

export type SupportTicket = {
  id: string;
  reference: string;
  category: string;
  urgency: "normal" | "urgent";
  status: string;
  trigger: string | null;
  plan: string | null;
  verification: string | null;
  created_at: string;
  sla_due_at: string | null;
  first_opened_at: string | null;
  replied_at: string | null;
  resolved_at: string | null;
  transcript: { role: "member" | "assistant"; content: string; at: string }[];
  replies: { body: string; at: string; by: string; read: boolean }[];
};

const CARD = "grid gap-3 rounded-[10px] border border-ink-900/[.12] bg-white p-4";
const H2 = "m-0 text-chip font-semibold uppercase tracking-[0.1em] text-grey-600";

export function SupportTicketView({ t, now = Date.now() }: { t: SupportTicket; now?: number }) {
  const rows: [string, string][] = [
    ["Topic", SUPPORT_CATEGORY_LABEL[t.category] ?? t.category],
    ["Why it came to us", t.trigger ? SUPPORT_TRIGGER_LABEL[t.trigger] ?? t.trigger : "Member tapped “Pass this to our team”"],
    ["Plan", t.plan ? PLAN_LABEL[t.plan] ?? t.plan : "Unknown"],
    ["Verification", t.verification ? VERIFICATION_LABEL[t.verification] ?? t.verification : "Unknown"],
    ["Filed", `${wat(t.created_at, true)} · ${waited(t.created_at, now)} ago`],
    ["Reply promised by", t.sla_due_at ? wat(t.sla_due_at, true) : "—"],
  ];
  const overdue = t.status === "open" && t.sla_due_at && Date.parse(t.sla_due_at) < now;

  return (
    <main className="mx-auto grid w-full max-w-[1080px] flex-1 content-start gap-5 p-6">
      <Link href="/staff/support" className="flex min-h-11 items-center text-nav font-medium text-green-500 underline underline-offset-4">
        ← Support
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 font-serif text-[26px] font-bold leading-[1.2] tabular-nums">{t.reference}</h1>
        {t.urgency === "urgent" ? (
          <span className="rounded-md border border-error/40 bg-error/[.06] px-2 py-[3px] text-chip font-semibold text-error">Urgent</span>
        ) : (
          <span className="rounded-md border border-ink-900/[.18] px-2 py-[3px] text-chip font-semibold text-ink-800">Normal</span>
        )}
        <span className={`rounded-md border px-2 py-[3px] text-chip font-semibold ${SUPPORT_STATUS_STYLE[t.status] ?? ""}`}>
          {SUPPORT_STATUS_LABEL[t.status] ?? t.status}
        </span>
        {overdue ? <span className="text-nav font-semibold text-error">Past its reply time</span> : null}
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <div className="grid min-w-0 flex-[999_1_520px] gap-5">
          <section className={CARD} aria-labelledby="t-transcript">
            <h2 id="t-transcript" className={H2}>
              Toastly Help conversation
            </h2>
            <p className="m-0 text-[13px] leading-[1.5] text-grey-600">
              The member&rsquo;s conversation with Toastly Help only — never their messages with other members. It&rsquo;s
              deleted 30 days after the last message.
            </p>
            {t.transcript.length ? (
              <ol className="m-0 grid list-none gap-2.5 p-0">
                {t.transcript.map((m, i) => (
                  <li
                    key={i}
                    className={`grid gap-1 rounded-lg px-3.5 py-2.5 ${m.role === "member" ? "bg-green-50" : "border border-ink-900/[.08] bg-paper"}`}
                  >
                    <span className="text-chip font-semibold text-grey-600">
                      {m.role === "member" ? "Member" : "Toastly Help · AI"} · {wat(m.at)}
                    </span>
                    <span className="whitespace-pre-line text-[14.5px] leading-[1.55] text-ink-900">{m.content}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="m-0 text-[14px] text-grey-600">No conversation on record — it may have passed its 30 days.</p>
            )}
          </section>

          <section className={CARD} aria-labelledby="t-replies">
            <h2 id="t-replies" className={H2}>
              Replies from the team
            </h2>
            {t.replies.length ? (
              <ol className="m-0 grid list-none gap-2.5 p-0">
                {t.replies.map((r, i) => (
                  <li key={i} className="grid gap-1 rounded-lg border border-green-500/[.35] px-3.5 py-2.5">
                    <span className="text-chip font-semibold text-grey-600">
                      {r.by} · {wat(r.at)} · {r.read ? "Read by the member" : "Not read yet"}
                    </span>
                    <span className="whitespace-pre-line text-[14.5px] leading-[1.55] text-ink-900">{r.body}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="m-0 text-[14px] text-grey-600">No reply yet.</p>
            )}
            <SupportReplyPanel id={t.id} reference={t.reference} status={t.status} />
          </section>
        </div>

        <aside className={`${CARD} flex-[1_1_280px]`} aria-labelledby="t-facts">
          <h2 id="t-facts" className={H2}>
            Ticket
          </h2>
          <dl className="m-0 grid gap-2.5">
            {rows.map(([k, v]) => (
              <div key={k} className="grid gap-0.5">
                <dt className="text-chip font-semibold text-grey-600">{k}</dt>
                <dd className="m-0 text-[14.5px] text-ink-900">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="m-0 text-[13px] leading-[1.5] text-grey-600">
            Refunds, disputes, appeals and restrictions are decided here by a person. Safety topics: check the member is
            safe first; the review queue holds any report they made.
          </p>
        </aside>
      </div>
    </main>
  );
}

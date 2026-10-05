import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff, caseId, caseTypeLabel, STATUS_LABEL, STATUS_PILL, waited, wat } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";
import { DecisionPanel } from "./decision-panel";

/**
 * One case — design/prototype/review-case.slim.html: who is involved, the
 * evidence the rules allow, what is never shown, the decision, and the
 * case's history.
 *
 * Everything below comes from review_case_detail() (0018), which builds
 * the evidence field by field. Photo files are the member's profile photos
 * — what other members see — signed for a few minutes; never the selfie.
 */

type Detail = {
  id: number;
  kind: string;
  summary: string;
  status: string;
  source: string;
  created_at: string;
  assignee: string | null;
  subject_deleted: boolean;
  members: { role: string; id: string; plan?: string; since?: string; city?: string | null; standing?: string; deleted?: boolean }[];
  verification: { phone_confirmed: string | null; liveness_passed: string | null; id_check_passed: string | null; reverification_requested: string | null } | null;
  report: { reason: string; detail: string | null; from_locked_inbox: boolean; reporter_could_read: boolean | null; messages_from_reported_to_reporter: number } | null;
  report_history: Record<string, number>;
  conversations_opened_30d: number;
  earlier_cases: number;
  pricing: {
    plan: string;
    profile_country: string;
    time_zone: string | null;
    payments: { provider: string; currency: string; status: string; at: string }[];
    signal: { signal: string; detail: Record<string, unknown> } | null;
  } | null;
  photos: { id: string; path: string; face_match: string; role: string }[] | null;
  history: { at: string; who: string; action: string; note: string }[];
};

const PLAN: Record<string, string> = {
  starter: "Starter",
  premium: "Premium",
  premium_plus: "Premium Plus",
  diaspora: "Diaspora",
  diaspora_plus: "Diaspora Plus",
};
const day = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso)) : "—";

function Section({ title, rows }: { title: string; rows: [string, React.ReactNode][] }) {
  return (
    <section className="overflow-hidden rounded-md border border-ink-900/[.12] bg-white">
      <h2 className="border-b border-ink-900/10 bg-paper px-4 py-[11px] text-[13px] font-semibold tracking-[0.04em] text-ink-800">{title}</h2>
      <dl className="grid">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[minmax(140px,220px)_minmax(0,1fr)] gap-4 border-t border-ink-900/[.06] px-4 py-[9px]">
            <dt className="text-[13px] text-grey-600">{k}</dt>
            <dd className="text-[13.5px] leading-[1.5] tabular-nums text-ink-900">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default async function ReviewCasePage({ params }: { params: { id: string } }) {
  const { supabase } = await requireStaff();
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();
  const { data } = await supabase.rpc("review_case_detail", { p_case: id });
  const c = data as Detail | null;
  if (!c) notFound();

  const photoUrls: Record<string, string> = {};
  if (c.photos?.length) {
    const admin = createAdminClient();
    const { data: signed } = admin
      ? await admin.storage.from("profile-photos").createSignedUrls(c.photos.map((p) => p.path), 60 * 5)
      : { data: [] };
    for (const s of signed ?? []) if (s.path && s.signedUrl) photoUrls[s.path] = s.signedUrl;
  }

  const sections: { title: string; rows: [string, React.ReactNode][] }[] = [];
  if (c.pricing) {
    sections.push({
      title: "Signal details",
      rows: [
        ["Plan", PLAN[c.pricing.plan] ?? c.pricing.plan],
        ["Profile country", c.pricing.profile_country],
        ["Device time zone", c.pricing.time_zone ?? "Not set"],
        ["Signal", c.pricing.signal ? c.pricing.signal.signal.replace(/_/g, " ") : "—"],
        [
          "Recent payments",
          c.pricing.payments.length
            ? c.pricing.payments.map((p) => `${p.currency} via ${p.provider}, ${p.status}, ${day(p.at)}`).join(" · ")
            : "None",
        ],
      ],
    });
  }
  if (c.report) {
    sections.push({
      title: "Report",
      rows: [
        ["Reason", c.report.reason],
        ...(c.report.from_locked_inbox ? ([["Reporter could read messages", "No. Inbox locked; reported without reading"]] as [string, string][]) : []),
        ...(!c.report.from_locked_inbox && c.report.reporter_could_read !== null
          ? ([["Reporter could read messages", c.report.reporter_could_read ? "Yes" : "No"]] as [string, string][])
          : []),
        ["Messages from reported member to reporter", String(c.report.messages_from_reported_to_reporter)],
        ...(c.report.detail ? ([["What the reporter wrote", c.report.detail]] as [string, string][]) : []),
      ],
    });
  }
  sections.push({
    title: "Report history",
    rows: [
      [
        "Reports about this member",
        Object.keys(c.report_history).length
          ? Object.entries(c.report_history).map(([k, n]) => `${k}: ${n}`).join(" · ")
          : "None",
      ],
      ["Earlier cases", String(c.earlier_cases)],
      ["New conversations, last 30 days", String(c.conversations_opened_30d)],
    ],
  });
  if (c.verification) {
    sections.push({
      title: "Verification outcomes",
      rows: [
        ["Phone", c.verification.phone_confirmed ? `Confirmed, ${day(c.verification.phone_confirmed)}` : "Not confirmed"],
        ["Selfie liveness", c.verification.liveness_passed ? `Passed, ${day(c.verification.liveness_passed)}` : "Not passed"],
        ["ID (optional second ring)", c.verification.id_check_passed ? `Passed, ${day(c.verification.id_check_passed)}` : "Not done"],
        ...(c.verification.reverification_requested
          ? ([["Re-verification", `Requested ${day(c.verification.reverification_requested)}`]] as [string, string][])
          : []),
      ],
    });
  }

  return (
    <main className="mx-auto grid w-full max-w-container flex-1 content-start gap-[18px] px-6 pb-10 pt-5">
      <div className="grid gap-2">
        <nav aria-label="Breadcrumb" className="flex gap-1.5 text-[13px] text-grey-600">
          <Link href="/review" className="text-green-500 no-underline">
            Queue
          </Link>
          <span aria-hidden="true">›</span>
          <span>{caseId(c.id)}</span>
        </nav>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="rounded-sm border border-ink-900/[.18] bg-white px-[9px] py-[3px] text-[12.5px] font-semibold text-ink-800">
            {caseTypeLabel(c.kind)}
          </span>
          <span className={cn("rounded-sm border px-[9px] py-[3px] text-[12.5px] font-semibold", STATUS_PILL[c.status])}>
            {STATUS_LABEL[c.status]}
          </span>
          <span className="text-[13px] text-grey-600">
            Raised {wat(c.created_at)} · waited {waited(c.created_at)} · from {c.source.replace(/_/g, " ")}
          </span>
        </div>
        <h1 className="max-w-[62ch] font-serif text-[24px] font-bold leading-[1.3]">{c.summary}</h1>
      </div>

      <div className="flex flex-wrap items-start gap-[18px]">
        <div className="grid min-w-0 flex-[999_1_560px] gap-3.5">
          <section
            aria-label="Members"
            className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] rounded-md border border-ink-900/[.12] bg-white"
          >
            {c.members.map((m) => (
              <div key={m.role + m.id} className="grid gap-2 border-r border-ink-900/[.08] px-4 py-3.5">
                <p className="text-chip font-semibold uppercase tracking-[0.08em] text-grey-600">{m.role}</p>
                <p className="text-ui font-semibold tabular-nums">{m.id}</p>
                <p className="text-[13px] leading-[1.5] text-ink-800">
                  {m.deleted
                    ? "Account deleted while the case was open"
                    : `${PLAN[m.plan ?? ""] ?? m.plan} · member since ${day(m.since)}${m.city ? ` · lists ${m.city}` : ""}${
                        m.standing && m.standing !== "good" ? ` · ${m.standing}` : ""
                      }`}
                </p>
              </div>
            ))}
          </section>

          {c.photos?.length ? (
            <section className="overflow-hidden rounded-md border border-ink-900/[.12] bg-white">
              <h2 className="border-b border-ink-900/10 bg-paper px-4 py-[11px] text-[13px] font-semibold tracking-[0.04em] text-ink-800">
                Profile photos (what other members see)
              </h2>
              <ul className="grid list-none grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3 p-4">
                {c.photos.map((p) => (
                  <li key={p.id} className="grid gap-1.5">
                    {photoUrls[p.path] ? (
                      // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from a private bucket
                      <img src={photoUrls[p.path]} alt={p.role} className="aspect-[4/5] w-full rounded-md bg-grey-200 object-cover" />
                    ) : (
                      <div className="aspect-[4/5] w-full rounded-md bg-grey-200" />
                    )}
                    <span className="text-chip font-semibold text-ink-800">{p.role}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {sections.map((s) => (
            <Section key={s.title} title={s.title} rows={s.rows} />
          ))}

          <section aria-labelledby="not-shown" className="grid gap-2.5 rounded-md border border-dashed border-ink-900/[.28] bg-paper px-4 py-3.5">
            <div className="grid gap-[3px]">
              <h2 id="not-shown" className="text-nav font-semibold text-ink-900">
                Not shown in review, by design
              </h2>
              <p className="text-[13px] leading-[1.55] text-ink-800">The rules keep these out of every case. Nothing has failed to load.</p>
            </div>
            <ul className="grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-x-4 gap-y-1.5 pl-7">
              {["Private message text", "Gist audio and transcripts", "Genotype", "Raw selfie and ID images (outcomes only)"].map((x) => (
                <li key={x} className="text-[13px] leading-[1.5] text-ink-800">
                  {x}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="grid min-w-0 flex-[1_1_320px] gap-3.5">
          <DecisionPanel caseId={c.id} kind={c.kind} status={c.status} assignee={c.assignee} />

          <section aria-labelledby="case-hist" className="grid gap-2.5 rounded-md border border-ink-900/[.12] bg-white p-3.5">
            <div className="flex items-baseline justify-between gap-2.5">
              <h2 id="case-hist" className="mx-0.5 text-nav font-semibold">
                On this case so far
              </h2>
              <Link href={`/review/history?case=${c.id}`} className="text-[13px] font-semibold text-green-500">
                Full history
              </Link>
            </div>
            <ol className="grid list-none gap-2.5 p-0">
              {c.history.map((h) => (
                <li key={h.at + h.action} className="grid gap-0.5 border-l-2 border-green-100 pl-3">
                  <span className="text-chip tabular-nums text-grey-600">
                    {wat(h.at)} · {h.who}
                  </span>
                  <span className="text-[13px] leading-[1.45] text-ink-900">{h.note}</span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </main>
  );
}

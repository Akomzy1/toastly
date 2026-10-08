import Link from "next/link";
import { DecisionPanel } from "./decision-panel";
import { TIER_LABELS } from "@/lib/entitlements";
import { COUNTRY_NAME } from "@/lib/countries";
import { actionLabel, KIND_LABEL, SOURCE_LABEL, STAGE_LABEL, STAGE_STYLE, caseNo, memberNo, waited, wat } from "@/lib/review";
import type { Tier } from "@/lib/types/profile";

/**
 * One case — built against design/prototype/review-case.slim.html.
 *
 * Shows only what the rules allow, and says so on screen: never message
 * text, Gist audio or transcripts, genotype, or raw selfie and ID images
 * (outcomes only). Members appear by number. The facts come from
 * staff_item (0026), which a constraint check keeps away from message
 * bodies, genotype and images.
 *
 * Differences from the prototype's sample data, flagged: Toastly records no
 * sign-in locations, device time-zone history, check-in distance or
 * dispute-form statements, so those rows don't appear; the time zone shown
 * is the one on the member's profile. Attendance disputes are decided with
 * "They attended" / "They didn't attend" (decided 4 October 2026).
 */

type Member = {
  role: string;
  member_no: number | null;
  removed: boolean;
  tier: Tier | null;
  joined: string | null;
  city: string | null;
  country: string | null;
  phone_verified_at: string | null;
  liveness_verified_at: string | null;
  id_confirmed_at: string | null;
  id_type: string | null;
  reports_about: { reason: string; at: string; status: string }[];
  earlier_cases: { case_no: number; kind: string; decision: string | null }[];
  dates: { attended: number; missed: number; cancelled: number } | null;
  restricted: boolean;
};

export type CaseItem = {
  id: string;
  case_no: number;
  kind: string;
  stage: string;
  decision: string | null;
  created_at: string;
  reason: string;
  assigned_name: string | null;
  assigned_to_me: boolean;
  members: Member[];
  evidence: Record<string, unknown>;
  events: { at: string; who: string; role: string; what: string; why: string | null; decision: boolean }[];
  actions: string[];
};

type Row = { k: string; v: string };
type Section = { title: string; rows: Row[] };

const day = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso)) : "";
const month = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", month: "long", year: "numeric" }).format(new Date(iso)) : "";
const country = (c: unknown) => (typeof c === "string" && c ? COUNTRY_NAME[c] ?? c : "Unknown");
const yes = (b: unknown) => (b ? "Yes" : "No");

const SIGNAL: Record<string, string> = {
  profile_country_mismatch: "Naira purchase from a profile abroad",
  payment_geography_mismatch: "Naira payment on a card issued abroad",
  ip_country_mismatch: "Naira checkout opened from abroad",
};
const ROUTE: Record<string, string> = {
  plan_pass: "Bank or USSD, 30 days",
  plan_recurring: "Card, renews monthly",
  plan_remainder: "Coins plus card",
  coin_pack: "Naira coin pack",
  coins: "Coins",
};
const PAY_KIND: Record<string, string> = {
  coin_pack: "coin pack",
  plan_pass: "30-day pass",
  plan_recurring: "monthly plan",
  plan_remainder: "coins plus card",
  plan_renewal: "renewal",
};

function memberMeta(m: Member): string {
  if (m.removed) return "Account removed";
  const tier = m.tier ? TIER_LABELS[m.tier] : "Starter";
  const track = m.tier === "premium" || m.tier === "premium_plus" ? " (naira plan)" : m.tier === "diaspora" || m.tier === "diaspora_plus" ? " (dollar plan)" : "";
  return [`${tier}${track}`, m.joined ? `member since ${month(m.joined)}` : "", m.city ? `lists ${m.city}` : "", m.restricted ? "restricted" : ""]
    .filter(Boolean)
    .join(" · ");
}

export function caseSections(c: CaseItem): Section[] {
  const e = c.evidence;
  const out: Section[] = [];
  if (c.kind === "pricing") {
    const d = (e.detail ?? {}) as Record<string, string>;
    const pays = (e.payments_90_days ?? []) as { currency: string; kind: string; status: string; card_country: string | null; request_country: string | null; at: string }[];
    out.push({
      title: "Signal details",
      rows: [
        { k: "Signal", v: SIGNAL[String(e.signal)] ?? String(e.signal) },
        { k: "Country in the signal", v: country(d.country) },
        ...(d.route || d.kind ? [{ k: "How they paid", v: ROUTE[d.route ?? d.kind] ?? d.route ?? d.kind }] : []),
        { k: "Profile country", v: country(e.profile_country) },
        { k: "Time zone on profile", v: String(e.profile_time_zone ?? "Not set") },
        {
          k: "Payments, last 90 days",
          v: pays.length
            ? pays
                .map((p) => `${day(p.at)} · ${p.currency} ${PAY_KIND[p.kind] ?? p.kind} · ${p.status}${p.card_country ? ` · card ${p.card_country}` : ""}${p.request_country ? ` · from ${p.request_country}` : ""}`)
                .join("\n")
            : "None",
        },
      ],
    });
  } else if (c.kind === "report" || c.kind === "married_report" || c.kind === "blind_report") {
    out.push({
      title: "Report",
      rows: [
        { k: "Category", v: String(e.reason) },
        { k: "Reporter could read messages", v: e.blind ? "No. Inbox locked; reported from the locked inbox" : "Yes" },
        { k: "Reporter's note to Toastly", v: (e.reporter_note as string) || "None" },
        { k: "Messages from reported member to reporter", v: `${e.messages_from_member_to_reporter ?? 0} (count only)` },
        { k: "Had a Gist together", v: yes(e.had_gist_together) },
        { k: "Reported at", v: wat(String(e.reported_at), true) },
      ],
    });
    out.push({ title: "Activity — reported member", rows: [{ k: "New conversations opened", v: `${e.conversations_opened_9_days ?? 0} in the last 9 days` }] });
  } else if (c.kind === "refund") {
    // NOT IN THE PROTOTYPE — flagged. Amounts and coin counts only.
    const money = (minor: unknown) => `${e.currency === "USD" ? "$" : "₦"}${(Number(minor ?? 0) / 100).toLocaleString("en-GB")}`;
    out.push({
      title: "Refund",
      rows: [
        { k: "Payment", v: `${money(e.amount_minor)} · ${PAY_KIND[String(e.kind)] ?? e.kind}${e.paid_at ? ` · paid ${day(String(e.paid_at))}` : ""}` },
        { k: "Refunded", v: `${money(e.refunded_minor)}${e.full_refund ? " (in full)" : " (part — nothing changed automatically)"}` },
        ...(Number(e.coins_in_purchase ?? 0) > 0
          ? [
              { k: "Coins from this purchase", v: String(e.coins_in_purchase) },
              { k: "Removed from their balance", v: String(e.coins_removed ?? 0) },
              { k: "Already spent or staked", v: String(e.coins_already_spent ?? 0) },
            ]
          : []),
        ...(e.full_refund && Number(e.coins_in_purchase ?? 0) === 0 ? [{ k: "Plan grants ended", v: String(e.plans_ended ?? 0) }] : []),
        ...(e.still_renewing ? [{ k: "Subscription", v: "Still renews with the provider — stop it there if the refund means it should end" }] : []),
      ],
    });
  } else if (c.kind === "attendance") {
    const stake = Number(e.stake_coins ?? 0);
    out.push({
      title: "Date",
      rows: [
        { k: "Booked", v: `${e.agreed_time ? wat(String(e.agreed_time), true) : ""} · ${e.venue ?? "Venue not recorded"}` },
        { k: "Coins", v: `${stake} each${e.status === "under_review" ? `, ${stake * 2} held until a decision` : ""}` },
      ],
    });
    out.push({
      title: "Check-in results",
      rows: [
        { k: memberNo(e.proposer_member_no as number), v: e.proposer_checked_in_at ? `Checked in ${wat(String(e.proposer_checked_in_at))}` : "No check-in" },
        { k: memberNo(e.other_member_no as number), v: e.other_checked_in_at ? `Checked in ${wat(String(e.other_checked_in_at))}` : "No check-in" },
        { k: "Contested", v: e.contested_at ? wat(String(e.contested_at)) : "—" },
      ],
    });
  } else if (c.kind === "selfie_review" || c.kind === "id_review") {
    const attempts = (e.attempts ?? []) as { status: string; code: string | null; at: string }[];
    out.push({
      title: "Check result",
      rows: [
        { k: "Check", v: e.product === "smartselfie" ? "Selfie liveness" : "ID check" },
        { k: "Result code", v: String(e.result_code ?? "None") },
        { k: "Environment", v: e.environment === "production" ? "Production" : "Sandbox" },
        { k: "Attempts", v: attempts.map((a) => `${day(a.at)} · ${a.status}${a.code ? ` · ${a.code}` : ""}`).join("\n") || "None" },
      ],
    });
  }

  for (const m of c.members) {
    if (m.removed) continue;
    out.push({
      title: `Verification outcomes — ${m.role.toLowerCase()}`,
      rows: [
        { k: "Phone", v: m.phone_verified_at ? `Verified, ${day(m.phone_verified_at)}` : "Not verified" },
        { k: "Selfie liveness", v: m.liveness_verified_at ? `Passed, ${day(m.liveness_verified_at)}` : "Not passed" },
        { k: "ID (optional second ring)", v: m.id_confirmed_at ? `${m.id_type ?? "ID"}, passed, ${day(m.id_confirmed_at)}` : "Not added" },
      ],
    });
    out.push({
      title: `Report history — ${m.role.toLowerCase()}`,
      rows: [
        { k: "Reports about this member", v: m.reports_about.length ? m.reports_about.map((r) => `${r.reason} · ${day(r.at)} · ${r.status}`).join("\n") : "None" },
        { k: "Earlier cases", v: m.earlier_cases.length ? m.earlier_cases.map((o) => `${caseNo(o.case_no)} · ${KIND_LABEL[o.kind] ?? o.kind}${o.decision ? ` · ${actionLabel(o.decision) ?? o.decision}` : ""}`).join("\n") : "None" },
        ...(m.dates ? [{ k: "Coin-deposit dates", v: `${m.dates.attended} attended, ${m.dates.missed} missed, ${m.dates.cancelled} cancelled` }] : []),
      ],
    });
  }
  return out;
}

export function CaseView({
  c,
  now = Date.now(),
  queueHref = "/staff",
  historyHref = "/staff/history",
}: {
  c: CaseItem;
  now?: number;
  queueHref?: string;
  historyHref?: string;
}) {
  const last = [...c.events].reverse().find((e) => e.decision);
  return (
    <main className="mx-auto grid w-full max-w-[1280px] flex-1 content-start gap-[18px] px-6 pb-10 pt-5">
      <div className="grid gap-2">
        <nav aria-label="Breadcrumb" className="flex gap-1.5 text-nav text-grey-600">
          <Link href={queueHref} className="flex min-h-11 min-w-12 items-center text-green-500 no-underline">
            Queue
          </Link>
          <span aria-hidden="true" className="flex items-center">
            ›
          </span>
          <span className="flex items-center">{caseNo(c.case_no)}</span>
        </nav>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="rounded-md border border-ink-900/[.18] bg-white px-[9px] py-[3px] text-[12.5px] font-semibold text-ink-800">{KIND_LABEL[c.kind] ?? c.kind}</span>
          <span className={`rounded-md border px-[9px] py-[3px] text-[12.5px] font-semibold ${STAGE_STYLE[c.stage]}`}>{STAGE_LABEL[c.stage]}</span>
          <span className="text-nav text-grey-600">
            Raised {wat(c.created_at, true)} WAT · waited {waited(c.created_at, now)} · {SOURCE_LABEL[c.kind] ?? "review"}
            {c.assigned_name ? ` · ${c.assigned_name}` : ""}
          </span>
        </div>
        <h1 className="m-0 max-w-[62ch] font-serif text-[24px] font-bold leading-[1.3] [text-wrap:pretty]">{c.reason}</h1>
      </div>

      <div className="flex flex-wrap items-start gap-[18px]">
        <div className="grid min-w-0 flex-[999_1_560px] gap-3.5">
          <section aria-label="Members" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] rounded-[10px] border border-ink-900/[.12] bg-white">
            {c.members.map((m) => (
              <div key={m.role} className="grid gap-2 border-r border-ink-900/[.08] px-4 py-3.5">
                <p className="m-0 text-chip font-semibold uppercase tracking-[0.08em] text-grey-600">{m.role}</p>
                <p className="m-0 text-ui font-semibold tabular-nums">{memberNo(m.member_no)}</p>
                <p className="m-0 text-nav leading-[1.5] text-ink-800">{memberMeta(m)}</p>
              </div>
            ))}
          </section>

          {caseSections(c).map((s) => (
            <section key={s.title} className="overflow-hidden rounded-[10px] border border-ink-900/[.12] bg-white">
              <h2 className="m-0 border-b border-ink-900/10 bg-paper px-4 py-[11px] text-nav font-semibold tracking-[0.04em] text-ink-800">{s.title}</h2>
              <dl className="m-0 grid">
                {s.rows.map((r) => (
                  <div key={r.k} className="grid grid-cols-[minmax(140px,220px)_minmax(0,1fr)] gap-4 border-t border-ink-900/[.06] px-4 py-[9px]">
                    <dt className="text-nav text-grey-600">{r.k}</dt>
                    <dd className="m-0 whitespace-pre-line text-[13.5px] leading-[1.5] tabular-nums text-ink-900 [text-wrap:pretty]">{r.v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}

          <section aria-labelledby="not-shown" className="grid gap-2.5 rounded-[10px] border border-dashed border-ink-900/[.28] bg-paper px-4 py-3.5">
            <div className="flex items-start gap-2.5">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-px flex-shrink-0">
                <rect x="5" y="10.5" width="14" height="9.5" rx="2" stroke="#504E52" strokeWidth="1.6" />
                <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" stroke="#504E52" strokeWidth="1.6" />
              </svg>
              <div className="grid gap-[3px]">
                <h2 id="not-shown" className="m-0 text-[14px] font-semibold text-ink-900">
                  Not shown in review, by design
                </h2>
                <p className="m-0 text-nav leading-[1.55] text-ink-800 [text-wrap:pretty]">The rules keep these out of every case. Nothing has failed to load.</p>
              </div>
            </div>
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-x-4 gap-y-1.5 p-0 pl-7">
              <li className="text-nav leading-[1.5] text-ink-800">Private message text</li>
              <li className="text-nav leading-[1.5] text-ink-800">Gist audio and transcripts</li>
              <li className="text-nav leading-[1.5] text-ink-800">Genotype</li>
              <li className="text-nav leading-[1.5] text-ink-800">Raw selfie and ID images (outcomes only)</li>
            </ul>
          </section>
        </div>

        <aside className="grid min-w-0 flex-[1_1_320px] gap-3.5">
          <DecisionPanel
            id={c.id}
            actions={c.actions}
            canAssign={c.stage === "new" && !c.assigned_name}
            decided={c.stage === "decided" && last ? { label: last.what, at: last.at, who: last.who, why: last.why ?? "" } : null}
            queueHref={queueHref}
            historyHref={`${historyHref}?case=${c.id}`}
          />
          <section aria-labelledby="case-hist" className="grid gap-2.5 rounded-[10px] border border-ink-900/[.12] bg-white p-3.5">
            <div className="flex items-baseline justify-between gap-2.5">
              <h2 id="case-hist" className="m-0 mx-0.5 text-[14px] font-semibold">
                On this case so far
              </h2>
              <Link href={`${historyHref}?case=${c.id}`} className="flex min-h-11 items-center text-nav font-semibold">
                Full history
              </Link>
            </div>
            <ol className="m-0 grid list-none gap-2.5 p-0">
              {c.events.map((ev, i) => (
                <li key={i} className="grid gap-0.5 border-l-2 border-green-100 pl-3">
                  <span className="text-chip tabular-nums text-grey-600">
                    {wat(ev.at)} · {ev.who}
                  </span>
                  <span className="text-nav leading-[1.45] text-ink-900">
                    {ev.what}
                    {ev.why && ev.what !== "Raised" ? ` — ${ev.why}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </main>
  );
}

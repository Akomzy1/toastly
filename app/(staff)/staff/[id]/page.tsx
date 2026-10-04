import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DecisionForm } from "@/components/staff/decision-form";
import { ACTION_LABEL, KIND_LABEL, reasonLabel } from "@/lib/review";

type Item = {
  id: string;
  kind: string;
  status: string;
  decision: string | null;
  created_at: string;
  decided_at: string | null;
  reason_category: string;
  subject: { id: string; name: string | null; country: string; stage: string; tier: string; joined: string; restricted: boolean; reverification_requested: boolean; open_items: number };
  history: { action: string; kind: string; at: string }[];
  evidence: Record<string, unknown>;
  actions: string[];
};

const human = (k: string) => k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function Value({ v }: { v: unknown }) {
  if (v === null || v === undefined || v === "") return <span className="text-grey-400">—</span>;
  if (typeof v === "boolean") return <>{v ? "Yes" : "No"}</>;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return <>{new Date(v).toLocaleString("en-GB")}</>;
  if (Array.isArray(v)) {
    return v.length ? (
      <ul className="m-0 grid list-none gap-1 p-0">
        {v.map((x, i) => (
          <li key={i} className="rounded-md bg-paper px-2.5 py-1.5">
            <Value v={x} />
          </li>
        ))}
      </ul>
    ) : (
      <span className="text-grey-400">None</span>
    );
  }
  if (typeof v === "object") {
    return (
      <span className="flex flex-wrap gap-x-3 gap-y-0.5">
        {Object.entries(v as Record<string, unknown>).map(([k, x]) => (
          <span key={k}>
            <span className="text-grey-600">{human(k)}:</span> <Value v={x} />
          </span>
        ))}
      </span>
    );
  }
  return <>{String(v)}</>;
}

/** One item: who, why, the evidence the rules allow, and the decision. */
export default async function StaffItem({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("staff_item", { p_id: params.id });
  if (error || !data) notFound();
  const i = data as Item;
  const s = i.subject;

  return (
    <>
      <Link href="/staff" className="flex min-h-11 items-center text-nav text-grey-600 no-underline">
        ‹ Back to the queue
      </Link>
      <div className="grid gap-2 rounded-xl border border-ink-900/10 bg-white p-4">
        <p className="m-0 font-sans text-chip font-semibold uppercase tracking-[0.12em] text-grey-600">{KIND_LABEL[i.kind] ?? i.kind}</p>
        <p className="m-0 font-serif text-[24px] font-bold text-ink-900">{s.name ?? "Member"}</p>
        <p className="m-0 text-nav text-grey-600">
          {s.country} · {s.stage.replace(/_/g, " ")} · {s.tier.replace(/_/g, " ")} · joined {new Date(s.joined).toLocaleDateString("en-GB")}
          {s.restricted ? " · RESTRICTED" : ""}
          {s.reverification_requested ? " · re-verification requested" : ""}
          {s.open_items > 1 ? ` · ${s.open_items} open items` : ""}
        </p>
        <p className="m-0 text-nav text-grey-600">
          If you act, the member is told: &ldquo;{reasonLabel(i.reason_category)}&rdquo; — never the evidence or who reported.
        </p>
      </div>

      <div className="grid gap-2 rounded-xl border border-ink-900/10 bg-white p-4">
        <p className="m-0 font-sans text-chip font-semibold uppercase tracking-[0.12em] text-grey-600">Evidence</p>
        {Object.keys(i.evidence).length === 0 ? (
          <p className="m-0 text-nav text-grey-600">No evidence recorded for this kind of item.</p>
        ) : (
          <dl className="m-0 grid gap-2.5">
            {Object.entries(i.evidence).map(([k, v]) => (
              <div key={k} className="grid gap-0.5 sm:grid-cols-[200px_1fr] sm:gap-3">
                <dt className="text-nav font-semibold text-ink-900">{human(k)}</dt>
                <dd className="m-0 text-nav text-ink-800">
                  <Value v={v} />
                </dd>
              </div>
            ))}
          </dl>
        )}
        <p className="m-0 text-chip text-grey-400">Message content, Gist audio, selfies and ID numbers are never shown — Toastly doesn&rsquo;t keep them.</p>
      </div>

      {i.history.length ? (
        <div className="grid gap-2 rounded-xl border border-ink-900/10 bg-white p-4">
          <p className="m-0 font-sans text-chip font-semibold uppercase tracking-[0.12em] text-grey-600">Earlier decisions about this member</p>
          <ul className="m-0 grid list-none gap-1 p-0">
            {i.history.map((h, n) => (
              <li key={n} className="text-nav text-ink-800">
                {new Date(h.at).toLocaleDateString("en-GB")} · {KIND_LABEL[h.kind] ?? h.kind} · {ACTION_LABEL[h.action] ?? h.action}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {i.status === "open" || i.actions.includes("lift_restriction") ? (
        <DecisionForm id={i.id} actions={i.actions} />
      ) : (
        <p className="m-0 rounded-xl border border-ink-900/10 bg-white p-4 text-ui text-grey-600">
          Decided{i.decided_at ? ` on ${new Date(i.decided_at).toLocaleString("en-GB")}` : ""}: {ACTION_LABEL[i.decision ?? ""] ?? i.decision}.
        </p>
      )}
    </>
  );
}

"use client";

/**
 * Internal screen — plain and functional (no design round, owner 25 October
 * 2026). The founding-members beta's applications: pick rows, then approve,
 * waitlist or decline them — one, or a batch with a wave number.
 *
 * Every rule is the database's (staff_beta_decide): outside Lagos stays on the
 * waitlist, approvals stop at the cap, an application whose number has already
 * signed up can't change. What comes back is shown as it is. There is no
 * export and no messaging here: the approved numbers are on the screen so the
 * owner can send each invitation by hand.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { betaDecide } from "@/app/(staff)/staff/beta/actions";

export type BetaRow = {
  id: string;
  first_name: string;
  age: number;
  gender: string;
  where: string;
  source: string;
  created_at: string;
  status: string;
  wave: number | null;
  used_at: string | null;
  phone: string | null;
};

const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short" });

export function BetaApplications({ rows }: { rows: BetaRow[] }) {
  const router = useRouter();
  const [picked, setPicked] = React.useState<string[]>([]);
  const [action, setAction] = React.useState<"approved" | "waitlisted" | "declined">("approved");
  const [wave, setWave] = React.useState("");
  const [message, setMessage] = React.useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = React.useTransition();

  const allPicked = rows.length > 0 && picked.length === rows.length;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  function apply() {
    setMessage(null);
    const waveNumber = wave.trim() === "" ? null : Number(wave);
    if (action === "approved" && waveNumber !== null && !Number.isInteger(waveNumber)) {
      setMessage({ tone: "error", text: "A wave is a whole number from 1 to 99." });
      return;
    }
    startTransition(async () => {
      const result = await betaDecide(picked, action, action === "approved" ? waveNumber : null);
      if (!result.ok) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      const d = result.data as { changed: number; approved_total: number; places_left: number; women_pct: number | null; women_target_pct: number };
      setMessage({
        tone: "ok",
        text: `${d.changed} changed. ${d.approved_total} approved, ${d.places_left} places left. Women: ${d.women_pct ?? "–"}% of approved (target ${d.women_target_pct}%).`,
      });
      setPicked([]);
      router.refresh();
    });
  }

  return (
    <section aria-label="Applications" className="grid gap-3">
      <div className="flex flex-wrap items-end gap-3 rounded-[10px] border border-ink-900/[.12] bg-white p-3">
        <span className="text-nav font-semibold text-ink-900">{picked.length} selected</span>
        <label className="grid gap-1 text-chip font-semibold uppercase tracking-[0.06em] text-grey-600">
          Do
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as typeof action)}
            className="min-h-11 rounded-lg border border-ink-900/[.22] bg-white px-2 text-nav normal-case tracking-normal text-ink-900"
          >
            <option value="approved">Approve</option>
            <option value="waitlisted">Waitlist</option>
            <option value="declined">Decline</option>
          </select>
        </label>
        {action === "approved" ? (
          <label className="grid gap-1 text-chip font-semibold uppercase tracking-[0.06em] text-grey-600">
            Wave
            <input
              value={wave}
              onChange={(e) => setWave(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 1"
              className="min-h-11 w-24 rounded-lg border border-ink-900/[.22] bg-white px-2 text-nav normal-case tracking-normal text-ink-900"
            />
          </label>
        ) : null}
        <button
          type="button"
          disabled={pending || picked.length === 0}
          onClick={apply}
          className="min-h-11 rounded-lg bg-green-500 px-4 text-nav font-semibold text-white disabled:bg-grey-200 disabled:text-grey-400"
        >
          {pending ? "Saving…" : "Apply to selected"}
        </button>
        {message ? (
          <span role={message.tone === "error" ? "alert" : "status"} className={`text-nav ${message.tone === "error" ? "text-error" : "text-success"}`}>
            {message.text}
          </span>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-[10px] border border-ink-900/[.12] bg-white">
        <table className="w-full min-w-[820px] border-collapse text-left text-nav">
          <thead>
            <tr className="border-b border-ink-900/[.12] bg-paper text-chip font-semibold uppercase tracking-[0.06em] text-grey-600">
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  aria-label="Select all on this page"
                  checked={allPicked}
                  onChange={() => setPicked(allPicked ? [] : rows.map((r) => r.id))}
                />
              </th>
              <th className="px-3 py-2.5">Name</th>
              <th className="px-3 py-2.5">Age</th>
              <th className="px-3 py-2.5">Gender</th>
              <th className="px-3 py-2.5">Where</th>
              <th className="px-3 py-2.5">Heard</th>
              <th className="px-3 py-2.5">Applied</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Wave</th>
              <th className="px-3 py-2.5">Number (approved, not yet signed up)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-ink-900/[.08] align-top">
                <td className="px-3 py-2.5">
                  <input type="checkbox" aria-label={`Select ${r.first_name}`} checked={picked.includes(r.id)} onChange={() => toggle(r.id)} />
                </td>
                <td className="px-3 py-2.5 font-semibold text-ink-900">{r.first_name}</td>
                <td className="px-3 py-2.5 tabular-nums">{r.age}</td>
                <td className="px-3 py-2.5 capitalize">{r.gender}</td>
                <td className="px-3 py-2.5">{r.where}</td>
                <td className="px-3 py-2.5">{r.source}</td>
                <td className="px-3 py-2.5 tabular-nums">{when(r.created_at)}</td>
                <td className="px-3 py-2.5 capitalize">
                  {r.status}
                  {r.used_at ? " · signed up" : ""}
                </td>
                <td className="px-3 py-2.5 tabular-nums">{r.wave ?? ""}</td>
                <td className="px-3 py-2.5 font-mono tabular-nums">{r.phone ?? ""}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-5 text-grey-600">
                  No applications match.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

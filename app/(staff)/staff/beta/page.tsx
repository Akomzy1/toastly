import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ConsoleHeader } from "@/components/staff/console-header";
import { BetaApplications, type BetaRow } from "@/components/staff/beta-applications";
import { BetaSettings } from "@/components/staff/beta-settings";
import { BETA_LAGOS_AREAS, BETA_LOCATION_TYPES, BETA_SOURCES, BETA_STATUS_LABEL, isoToLagosInput } from "@/lib/beta";
import { betaList, betaOverview } from "./actions";

export const dynamic = "force-dynamic";

/**
 * The founding-members beta: applications and approvals. Internal and plain —
 * no design round (owner, 25 October 2026). Staff only: the console layout
 * 404s anyone else, and every staff_beta_* function checks again.
 *
 * No export and no messaging, on purpose. The approved numbers are in the table
 * so the invitations are sent by hand.
 */

const PAGE = 100;
const STATUSES = ["pending", "approved", "waitlisted", "declined"];
const AREAS = [...BETA_LAGOS_AREAS.map((a) => ({ code: a.code, label: a.label })), ...BETA_LOCATION_TYPES.filter((l) => l.code !== "lagos").map((l) => ({ code: l.code, label: l.label }))];
const label = (list: readonly { code: string; label: string }[], code: string | null) => list.find((x) => x.code === code)?.label ?? code ?? "";

type Counts = Record<string, number>;
type Overview = {
  settings: { cap: number; women_target_pct: number; applications_open_at: string; beta_closes_at: string | null; lagos_only: boolean; founding_perk_starts_on: string | null };
  approved: { total: number; women: number; men: number; women_pct: number | null; places_left: number };
  by_status: Counts;
  by_gender: Counts;
  by_area: Counts;
  waitlisted_elsewhere: { elsewhere_nigeria: number; outside_nigeria: number };
  founding_member_count: number;
};
type ListRow = {
  id: string; created_at: string; first_name: string; age: number; gender: string; location_type: string; lagos_area: string | null;
  other_location: string | null; source: string; status: string; wave: number | null; used_at: string | null; phone: string | null;
};

const SELECT = "min-h-11 rounded-lg border border-ink-900/[.22] bg-white px-2 text-nav normal-case tracking-normal text-ink-900";
const CAP = "grid gap-1 text-chip font-semibold uppercase tracking-[0.06em] text-grey-600";

function Stat({ title, rows }: { title: string; rows: [string, number | string][] }) {
  return (
    <div className="grid content-start gap-1.5 rounded-[10px] border border-ink-900/[.12] bg-white p-3">
      <h2 className="m-0 text-chip font-semibold uppercase tracking-[0.06em] text-grey-600">{title}</h2>
      <dl className="m-0 grid gap-0.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 text-nav">
            <dt className="text-ink-800">{k}</dt>
            <dd className="m-0 font-semibold tabular-nums text-ink-900">{v}</dd>
          </div>
        ))}
        {rows.length === 0 ? <p className="m-0 text-nav text-grey-600">Nothing yet.</p> : null}
      </dl>
    </div>
  );
}

export default async function StaffBeta({ searchParams }: { searchParams: { status?: string; gender?: string; area?: string; page?: string } }) {
  const supabase = createClient();
  const { data: me } = await supabase.rpc("staff_me");
  const who = (me ?? { name: "Staff", role: "Reviewer" }) as { name: string; role: string };

  const status = STATUSES.includes(searchParams.status ?? "") ? searchParams.status! : "";
  const gender = ["woman", "man"].includes(searchParams.gender ?? "") ? searchParams.gender! : "";
  const area = AREAS.some((a) => a.code === searchParams.area) ? searchParams.area! : "";
  const page = Math.max(1, Math.floor(Number(searchParams.page) || 1));

  const [overview, list] = await Promise.all([
    betaOverview(),
    betaList({ status, gender, area, limit: PAGE, offset: (page - 1) * PAGE }),
  ]);

  if (!overview.ok || !list.ok) {
    return (
      <>
        <ConsoleHeader active="beta" name={who.name} role={who.role} />
        <p role="alert" className="m-6 text-ui text-error">
          {overview.ok ? (list.ok ? "" : list.error) : overview.error}
        </p>
      </>
    );
  }
  const o = overview.data as unknown as Overview;
  const l = list.data as unknown as { total: number; rows: ListRow[] };
  const rows: BetaRow[] = l.rows.map((r) => ({
    id: r.id,
    first_name: r.first_name,
    age: r.age,
    gender: r.gender,
    where: r.location_type === "lagos" ? `Lagos · ${label(BETA_LAGOS_AREAS, r.lagos_area)}` : `${label(BETA_LOCATION_TYPES, r.location_type)} · ${r.other_location ?? ""}`,
    source: label(BETA_SOURCES, r.source),
    created_at: r.created_at,
    status: r.status,
    wave: r.wave,
    used_at: r.used_at,
    phone: r.phone,
  }));

  const link = (n: number) => `/staff/beta?${new URLSearchParams({ ...(status ? { status } : {}), ...(gender ? { gender } : {}), ...(area ? { area } : {}), page: String(n) })}`;
  const pages = Math.max(1, Math.ceil(l.total / PAGE));

  return (
    <>
      <ConsoleHeader active="beta" name={who.name} role={who.role} />
      <main className="mx-auto grid w-full max-w-[1280px] flex-1 content-start gap-5 p-6">
        <div className="grid gap-1">
          <h1 className="m-0 font-serif text-[24px] font-bold leading-[1.2]">Founding-members beta</h1>
          <p className="m-0 text-nav text-grey-600">
            {o.settings.lagos_only ? "Lagos only. " : ""}
            Applications open {new Date(o.settings.applications_open_at).toLocaleString("en-GB", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" })} (Lagos time).{" "}
            {o.settings.beta_closes_at ? `Closes ${new Date(o.settings.beta_closes_at).toLocaleString("en-GB", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" })}.` : "The beta is open."}{" "}
            {o.settings.founding_perk_starts_on ? `The 3 months start ${o.settings.founding_perk_starts_on}.` : "The 3 months have not started."}
          </p>
        </div>

        <section aria-label="Counts" className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          <Stat
            title="Places"
            rows={[
              ["Approved", `${o.approved.total} of ${o.settings.cap}`],
              ["Places left", o.approved.places_left],
              ["Signed up as founding members", o.founding_member_count],
            ]}
          />
          <Stat
            title="Women and men, approved"
            rows={[
              ["Women", o.approved.women],
              ["Men", o.approved.men],
              ["Women now", o.approved.women_pct === null ? "–" : `${o.approved.women_pct}%`],
              ["Target", `${o.settings.women_target_pct}% women`],
            ]}
          />
          <Stat title="By status" rows={STATUSES.map((s) => [BETA_STATUS_LABEL[s] ?? s, o.by_status[s] ?? 0])} />
          <Stat title="By gender, all applications" rows={Object.entries(o.by_gender).map(([k, v]) => [k === "woman" ? "Women" : "Men", v])} />
          <Stat title="By area, all applications" rows={AREAS.map((a) => [a.label, o.by_area[a.code] ?? 0] as [string, number]).filter(([, n]) => n > 0)} />
          <Stat
            title="Waitlisted outside Lagos (demand for other places)"
            rows={[
              ["Elsewhere in Nigeria", o.waitlisted_elsewhere.elsewhere_nigeria],
              ["Outside Nigeria", o.waitlisted_elsewhere.outside_nigeria],
            ]}
          />
        </section>

        <section aria-label="Settings" className="grid gap-2">
          <h2 className="m-0 text-chip font-semibold uppercase tracking-[0.06em] text-grey-600">Settings</h2>
          <BetaSettings
            cap={o.settings.cap}
            womenTargetPct={o.settings.women_target_pct}
            opensAt={isoToLagosInput(o.settings.applications_open_at)}
            closesAt={isoToLagosInput(o.settings.beta_closes_at)}
          />
        </section>

        <section aria-label="Filters" className="grid gap-2">
          <h2 className="m-0 text-chip font-semibold uppercase tracking-[0.06em] text-grey-600">Applications · {l.total}</h2>
          <form action="/staff/beta" className="flex flex-wrap items-end gap-3">
            <label className={CAP}>
              Status
              <select name="status" defaultValue={status} className={SELECT}>
                <option value="">All</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {BETA_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className={CAP}>
              Gender
              <select name="gender" defaultValue={gender} className={SELECT}>
                <option value="">All</option>
                <option value="woman">Women</option>
                <option value="man">Men</option>
              </select>
            </label>
            <label className={CAP}>
              Where
              <select name="area" defaultValue={area} className={SELECT}>
                <option value="">All</option>
                {AREAS.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="min-h-11 rounded-lg border border-ink-900/[.22] bg-white px-4 text-nav font-semibold text-ink-900">
              Filter
            </button>
          </form>
        </section>

        <BetaApplications rows={rows} />

        {pages > 1 ? (
          <nav aria-label="Pages" className="flex items-center gap-4 text-nav">
            {page > 1 ? <Link href={link(page - 1)}>← Newer</Link> : null}
            <span className="text-grey-600">
              Page {page} of {pages}
            </span>
            {page < pages ? <Link href={link(page + 1)}>Older →</Link> : null}
          </nav>
        ) : null}
      </main>
    </>
  );
}

import type { VerifyView } from "@/lib/verification-view";

/**
 * The ring stepper — verify-overview.slim.html.
 *
 * Three Stake rings (r 9.5, stroke 3, drawn at 40px) above a 4px rule that
 * fills teal behind them. Closed teal ring with a tick = done; amber-deep arc
 * = being checked; grey = to do; dashed = optional. The ID check ring stays
 * dashed and labelled Optional until it is done, so it never reads as missing.
 *
 * Two states are not in the prototype, flagged: phone not yet confirmed (the
 * phone ring as "Next", rule empty) and the ID check being checked (amber arc
 * on the third ring, rule at 83.3%).
 */

type Ring = "done" | "checking" | "todo" | "optional" | "optional_checking";
type Step = { label: string; ring: Ring; status: string };

const STATUS_TONE: Record<Ring, string> = {
  done: "text-green-500",
  checking: "text-gold-800",
  optional_checking: "text-gold-800",
  todo: "text-grey-600",
  optional: "text-grey-600",
};

function steps(view: VerifyView): { steps: Step[]; fill: string } {
  const phone: Step = { label: "Phone", ring: "done", status: "Confirmed" };
  const real = (ring: Ring, status: string): Step => ({ label: "Verified Real", ring, status });
  const id = (ring: Ring, status: string): Step => ({ label: "ID check", ring, status });
  const optional = id("optional", "Optional");

  switch (view.kind) {
    case "phone":
      return { steps: [{ label: "Phone", ring: "todo", status: "Next" }, real("todo", "After phone"), optional], fill: "0%" };
    case "start":
      return { steps: [phone, real("todo", "Next"), optional], fill: "33.3%" };
    case "selfie_retry":
      return { steps: [phone, real("todo", "Try again"), optional], fill: "33.3%" };
    case "selfie_checking":
      return { steps: [phone, real("checking", "Being checked"), optional], fill: "50%" };
    case "selfie_review":
      return { steps: [phone, real("checking", "Being reviewed"), optional], fill: "50%" };
    case "passed":
    case "id_retry":
      return { steps: [phone, real("done", "Done"), optional], fill: "66.6%" };
    case "id_checking":
      return { steps: [phone, real("done", "Done"), id("optional_checking", "Being checked")], fill: "83.3%" };
    case "id_review":
      return { steps: [phone, real("done", "Done"), id("optional_checking", "Being reviewed")], fill: "83.3%" };
    case "both":
      return { steps: [phone, real("done", "Done"), id("done", "Done")], fill: "100%" };
  }
}

function RingSvg({ ring }: { ring: Ring }) {
  const track =
    ring === "done" ? "#00695C" : ring === "todo" ? "#D9D9DA" : ring === "checking" ? "#F2F2F2" : "#828184";
  const dashed = ring === "optional" || ring === "optional_checking";
  const arc = ring === "checking" || ring === "optional_checking";
  return (
    <svg width="40" height="40" viewBox="12 12 24 24" fill="none" aria-hidden="true">
      <circle cx="24" cy="24" r="9.5" stroke={track} strokeWidth="3" strokeDasharray={dashed ? "2.6 3.2" : undefined} />
      {arc ? (
        <circle
          cx="24"
          cy="24"
          r="9.5"
          stroke="#CC8F00"
          strokeWidth="3"
          strokeDasharray="24 60"
          strokeLinecap="round"
          transform="rotate(-90 24 24)"
        />
      ) : null}
      {ring === "done" ? (
        <path d="m20.2 24.3 2.6 2.6 5-5.4" stroke="#00695C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      ) : null}
    </svg>
  );
}

export function RingStepper({ view }: { view: VerifyView }) {
  const { steps: list, fill } = steps(view);
  return (
    <div className="grid gap-2 rounded-xl border border-ink-900/[.12] bg-white px-2.5 pb-4 pt-[18px]">
      <div className="grid grid-cols-3" aria-hidden="true">
        {list.map((s) => (
          <div key={s.label} className="grid justify-items-center">
            <RingSvg ring={s.ring} />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="mx-1.5 h-1 overflow-hidden rounded-pill bg-grey-100">
        <div className="h-full rounded-pill bg-green-500" style={{ width: fill }} />
      </div>
      <ol aria-label="Verification steps" className="m-0 grid list-none grid-cols-3 gap-1 p-0">
        {list.map((s) => (
          <li key={s.label} className="grid justify-items-center gap-0.5 text-center">
            <span className="text-[13px] font-semibold leading-[1.35] text-ink-900">{s.label}</span>
            <span className={`text-chip leading-[1.35] ${STATUS_TONE[s.ring]}`}>{s.status}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

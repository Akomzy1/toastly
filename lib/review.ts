/**
 * Words for the review console (review-queue / review-case / review-history
 * prototypes). Members only ever see a reason CATEGORY — never the signal,
 * the reporter, or the evidence.
 */

export const REASON_LABEL: Record<string, string> = {
  plan_track: "your plan and where you live",
  community_standards: "Toastly's community standards",
  report: "a report about your account",
  date_attendance: "a date",
  verification: "verification",
  safety: "account safety",
  payment: "a payment",
};

/** Case types, in the prototype's order. "Report" and "ID check" are added (flagged). */
export const KIND_LABEL: Record<string, string> = {
  pricing: "Pricing signal",
  sentinel: "Safety flag",
  photo_match: "Photo check",
  selfie_review: "Selfie check",
  id_review: "ID check",
  blind_report: "Locked-inbox report",
  married_report: "Married-user report",
  report: "Report",
  attendance: "Date-attendance dispute",
  refund: "Refund",
};
export const KIND_ORDER = Object.keys(KIND_LABEL);

export const SOURCE_LABEL: Record<string, string> = {
  pricing: "automatic signal",
  sentinel: "automatic signal",
  photo_match: "verification result",
  selfie_review: "verification result",
  id_review: "verification result",
  blind_report: "member report",
  married_report: "member report",
  report: "member report",
  attendance: "dispute filed",
  refund: "payment provider",
};

export const STAGE_LABEL: Record<string, string> = {
  new: "New",
  in_review: "In review",
  waiting_member: "Waiting on member",
  decided: "Decided",
};

/** Status pill colours, from the prototype's ST map (theme tokens). */
export const STAGE_STYLE: Record<string, string> = {
  new: "bg-green-50 border-green-500/30 text-green-550",
  in_review: "bg-gold-50 border-gold-600/35 text-gold-800",
  waiting_member: "bg-grey-100 border-ink-900/[.14] text-ink-800",
  decided: "bg-white border-ink-900/[.18] text-grey-600",
};

export const ACTION_LABEL: Record<string, string> = {
  clear: "Clear",
  ask_switch_plan: "Ask to switch plan",
  request_reverification: "Request re-verification",
  restrict: "Restrict",
  lift_restriction: "Lift restriction",
  remove: "Remove",
  attended: "They attended",
  no_show: "They didn't attend",
  member_switched: "Switched plan",
};

export const ACTION_SUB: Record<string, string> = {
  clear: "No action. The case closes.",
  ask_switch_plan: "Member is asked to move to the plan for where they live.",
  request_reverification: "Member redoes selfie liveness. Account stays open.",
  restrict: "Limits matching and messages until reviewed again.",
  lift_restriction: "Matching and messages return to normal.",
  remove: "Closes the account. The member can appeal.",
  attended: "Both stakes go back to their owners. The case closes.",
  no_show: "The stake goes to the member who showed up. The case closes.",
};

/**
 * Labels for an action, including the gender correction on a "Not who they
 * say they are" report (0038), which carries the option's code:
 * "correct_gender:man". NOT IN THE PROTOTYPE — flagged.
 */
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export function actionLabel(a: string): string | undefined {
  if (a.startsWith("correct_gender:")) return `Correct gender to ${capital(a.slice("correct_gender:".length))}`;
  return ACTION_LABEL[a];
}
export function actionSub(a: string): string | undefined {
  if (a.startsWith("correct_gender:")) return "Sets their gender. Ends the women's launch offer if they have it. The case closes.";
  return ACTION_SUB[a];
}

/** The prototype asks for a short sentence; the database enforces the same. */
export const MIN_REASON = 12;

export const reasonLabel = (category: string | null | undefined) => REASON_LABEL[category ?? ""] ?? "your account";

export const caseNo = (n: number | string) => `TC-${n}`;
export const memberNo = (n: number | string | null | undefined) => (n == null ? "Removed member" : `M-${n}`);

export function waited(fromIso: string, now: number = Date.now()): string {
  const m = Math.max(0, Math.floor((now - Date.parse(fromIso)) / 60_000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return d ? `${d} d ${h} h` : h ? `${h} h ${m % 60} m` : `${m % 60} m`;
}

/** Times in WAT, as the history screen says. */
export function wat(iso: string, withYear = false): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

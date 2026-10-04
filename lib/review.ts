/**
 * Words for the review queue (0025). Members only ever see a reason
 * CATEGORY — never the signal, the reporter, or the evidence.
 */

export const REASON_LABEL: Record<string, string> = {
  plan_track: "your plan and where you live",
  community_standards: "Toastly's community standards",
  report: "a report about your account",
  date_attendance: "a date",
  verification: "verification",
  safety: "account safety",
};

export const KIND_LABEL: Record<string, string> = {
  pricing: "Pricing signal",
  report: "Report",
  married_report: "Married-user report",
  blind_report: "Blind report",
  attendance: "Attendance dispute",
  selfie_review: "Selfie check — borderline",
  id_review: "ID check — borderline",
  photo_match: "Photo match — borderline",
  sentinel: "Sentinel flag",
};

export const ACTION_LABEL: Record<string, string> = {
  clear: "Clear — no action",
  ask_switch_plan: "Ask to switch plan",
  request_reverification: "Request re-verification",
  restrict: "Restrict",
  lift_restriction: "Lift restriction",
  remove: "Remove account",
  attended: "They were there — return both stakes",
  no_show: "They weren't there — stake goes to the attender",
};

/** Actions that change what a member can do: asked to confirm twice. */
export const SERIOUS = new Set(["restrict", "remove"]);

export const reasonLabel = (category: string | null | undefined) => REASON_LABEL[category ?? ""] ?? "your account";

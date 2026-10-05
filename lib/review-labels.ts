/**
 * Review-console labels and formatting — safe to import from client
 * components (no server imports). lib/staff.ts holds the server-only guard.
 */

export const CASE_TYPES: { key: string; label: string }[] = [
  { key: "pricing", label: "Pricing signal" },
  { key: "safety", label: "Safety flag" },
  { key: "photo", label: "Photo check" },
  { key: "selfie", label: "Selfie check" },
  { key: "blind", label: "Locked-inbox report" },
  { key: "married", label: "Married-user report" },
  { key: "date", label: "Date-attendance dispute" },
];
export const caseTypeLabel = (k: string) => CASE_TYPES.find((t) => t.key === k)?.label ?? k;

export const STATUS_LABEL: Record<string, string> = {
  new: "New",
  in_review: "In review",
  waiting_on_member: "Waiting on member",
  decided: "Decided",
};

/** review-queue's status pill colours, as token classes. */
export const STATUS_PILL: Record<string, string> = {
  new: "bg-green-50 border-green-500/30 text-green-550",
  in_review: "bg-gold-50 border-gold-600/[.35] text-gold-800",
  waiting_on_member: "bg-grey-100 border-ink-900/[.14] text-ink-800",
  decided: "bg-white border-ink-900/[.18] text-grey-600",
};

export const caseId = (n: number | string) => `TC-${n}`;

export function waited(fromIso: string, to = Date.now()): string {
  const m = Math.max(0, Math.floor((to - new Date(fromIso).getTime()) / 60000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return d ? `${d} d ${h} h` : h ? `${h} h ${m % 60} m` : `${m % 60} m`;
}

/** WAT, as the history prototype states its times. */
export function wat(iso: string): string {
  return (
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Lagos",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso)) + " WAT"
  );
}

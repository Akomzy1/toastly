/**
 * Crisis helplines, by the member's profile country — shown FIRST when a
 * member tells Toastly Help about self-harm (owner, 9 October 2026).
 *
 * STATIC AND HUMAN-REVIEWED. An entry is shown only once a person has rung
 * or checked it against the service's own site and filled in `reviewedBy`
 * and `reviewedOn`. A wrong number at that moment is worse than none, so an
 * unreviewed entry never reaches a member (scripts/help-escalation.test.mjs
 * proves it). With no reviewed entry for a country, the member sees the
 * emergency numbers from lib/safety.ts and "your local emergency number".
 *
 * Drafts below were written from public listings and are NOT yet reviewed.
 * To review one: confirm the number and hours on the service's own website,
 * then set reviewedBy (your name) and reviewedOn (YYYY-MM-DD). Re-check
 * every six months.
 */

export type CrisisLine = {
  name: string;
  /** What to dial or text, exactly as the member should enter it. */
  contact: string;
  /** "tel:" or "sms:" target for a tap. */
  href: string;
  how: string;
  /** Source to check against. */
  source: string;
  reviewedBy: string | null;
  reviewedOn: string | null;
};

const CRISIS_LINES: Record<string, CrisisLine[]> = {
  NG: [
    {
      name: "Mentally Aware Nigeria Initiative (MANI)",
      contact: "0809 111 6264",
      href: "tel:+2348091116264",
      how: "Call",
      source: "mentallyaware.org",
      reviewedBy: null,
      reviewedOn: null,
    },
    {
      name: "Suicide Research and Prevention Initiative (SURPIN)",
      contact: "0806 210 6493",
      href: "tel:+2348062106493",
      how: "Call",
      source: "surpinng.com",
      reviewedBy: null,
      reviewedOn: null,
    },
  ],
  GB: [
    { name: "Samaritans", contact: "116 123", href: "tel:116123", how: "Call free, any time", source: "samaritans.org", reviewedBy: null, reviewedOn: null },
    { name: "Shout", contact: "85258", href: "sms:85258", how: "Text SHOUT, any time", source: "giveusashout.org", reviewedBy: null, reviewedOn: null },
  ],
  IE: [
    { name: "Samaritans", contact: "116 123", href: "tel:116123", how: "Call free, any time", source: "samaritans.org", reviewedBy: null, reviewedOn: null },
  ],
  US: [
    { name: "988 Suicide & Crisis Lifeline", contact: "988", href: "tel:988", how: "Call or text, any time", source: "988lifeline.org", reviewedBy: null, reviewedOn: null },
  ],
  CA: [
    { name: "9-8-8 Suicide Crisis Helpline", contact: "988", href: "tel:988", how: "Call or text, any time", source: "988.ca", reviewedBy: null, reviewedOn: null },
  ],
};

export const isReviewed = (l: CrisisLine): boolean => Boolean(l.reviewedBy?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(l.reviewedOn ?? ""));

/** Reviewed lines only. An empty list means "use your local emergency number". */
export function crisisLinesFor(countryCode: string | null | undefined, table: Record<string, CrisisLine[]> = CRISIS_LINES): CrisisLine[] {
  return (table[(countryCode ?? "NG").toUpperCase()] ?? []).filter(isReviewed);
}

/** For the review checklist and the tests: every entry, reviewed or not. */
export function allCrisisLines(): Record<string, CrisisLine[]> {
  return CRISIS_LINES;
}

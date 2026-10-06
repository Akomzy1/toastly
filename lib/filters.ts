/**
 * Self-applied filters (PRD §5.2.4; decided 6 October 2026).
 *
 * Premium, Premium Plus, Diaspora and Diaspora Plus — never Starter. A filter
 * narrows only the member's own six; nobody can see another member's
 * filters; only values the other member has chosen to show are matched, and
 * each filter can include people who don't say. The rule itself lives in the
 * database (0031, passes_own_filters) — this module is the option lists.
 *
 * Never filterable: denomination, genotype, hidden relationship history, and
 * anything not in the §7.1 list.
 */

/** Religion filter values: the decided list, less "Prefer not to say". */
export const FILTER_RELIGIONS = [
  "Christian",
  "Muslim",
  "Traditional",
  "Spiritual but not religious",
  "Not religious",
  "Other",
] as const;

/**
 * Tribe filter values. PROVISIONAL — flagged for the owner: the profile's
 * tribe is free text, so the filter offers a fixed list and matches a shown
 * tribe that equals one of these (case and spacing ignored). A tribe typed
 * any other way doesn't match a chosen value.
 */
export const FILTER_TRIBES = [
  "Yoruba",
  "Igbo",
  "Hausa",
  "Fulani",
  "Ijaw",
  "Kanuri",
  "Ibibio",
  "Tiv",
  "Edo",
  "Efik",
  "Urhobo",
  "Itsekiri",
  "Isoko",
  "Nupe",
  "Igala",
  "Idoma",
  "Ebira",
  "Annang",
  "Ogoni",
  "Ikwerre",
  "Esan",
  "Gbagyi",
  "Jukun",
  "Berom",
] as const;

export type MemberFilters = {
  religions: string[];
  religion_include_unsaid: boolean;
  tribes: string[];
  tribe_include_unsaid: boolean;
};

export const NO_FILTERS: MemberFilters = {
  religions: [],
  religion_include_unsaid: true,
  tribes: [],
  tribe_include_unsaid: true,
};

/** "Only {n} people match your filters today." — the feed's line. */
export function tooFewLine(n: number): string {
  if (n === 0) return "Nobody matches your filters today. Widening them shows you more.";
  if (n === 1) return "Only 1 person matches your filters today. Widening them shows you more.";
  return `Only ${n} people match your filters today. Widening them shows you more.`;
}

/**
 * Religion and denomination (PRD §5.2.3; decided 6 October 2026).
 *
 * Toastly is non-religious: faith is something members may show, never
 * something the product sorts people by. This module is the ONE place that
 * decides what another member may see:
 *
 *   - one visibility setting covers both (religion_visibility): 'public' is
 *     "shown", anything else is hidden — and hiding religion hides
 *     denomination;
 *   - never on the feed card; the full profile only.
 *
 * Nothing here — or anywhere — filters, ranks or matches on faith. There is
 * no denomination filter, now or planned (constraint check "no denomination
 * filter"). Never pass these fields to a model, PostHog, the Sentinel or the
 * AriyaPlanner brief.
 *
 * The rules on writes (the option lists, denomination only with Christian or
 * Muslim, changing religion clears denomination, consent first) are enforced
 * by the database: 0030's faith_rules trigger.
 */

export const RELIGIONS = [
  "Christian",
  "Muslim",
  "Traditional",
  "Spiritual but not religious",
  "Not religious",
  "Other",
  "Prefer not to say",
] as const;
export type Religion = (typeof RELIGIONS)[number];

export type Denomination =
  | "catholic" | "anglican" | "methodist" | "baptist" | "presbyterian" | "pentecostal"
  | "orthodox" | "white_garment" | "non_denominational"
  | "sunni" | "shia" | "ahmadiyya"
  | "other";

/** Denominations offered for each religion that has them, with their labels. */
export const DENOMINATIONS: Partial<Record<Religion, { value: Denomination; label: string }[]>> = {
  Christian: [
    { value: "catholic", label: "Catholic" },
    { value: "anglican", label: "Anglican" },
    { value: "methodist", label: "Methodist" },
    { value: "baptist", label: "Baptist" },
    { value: "presbyterian", label: "Presbyterian" },
    { value: "pentecostal", label: "Pentecostal" },
    { value: "orthodox", label: "Orthodox" },
    { value: "white_garment", label: "White-garment (Celestial, C&S, CAC)" },
    { value: "non_denominational", label: "Non-denominational" },
    { value: "other", label: "Other" },
  ],
  Muslim: [
    { value: "sunni", label: "Sunni" },
    { value: "shia", label: "Shia" },
    { value: "ahmadiyya", label: "Ahmadiyya" },
    { value: "other", label: "Other" },
  ],
};

/** Free text for "Other" — shown as typed, never pre-screened by a model. */
export const FAITH_OTHER_MAX = 30;

export type FaithFields = {
  religion: string | null;
  religion_other: string | null;
  denomination: Denomination | null;
  denomination_other: string | null;
  religion_visibility: "private" | "on_match" | "public";
};

export function isListedReligion(v: string | null): v is Religion {
  return v !== null && (RELIGIONS as readonly string[]).includes(v);
}

/** Shown on the profile? One setting covers religion and denomination. */
export function faithShown(p: Pick<FaithFields, "religion_visibility">): boolean {
  return p.religion_visibility === "public";
}

/**
 * The one line on the full profile — "Christian · Pentecostal" — or null when
 * there's nothing to show this viewer. Another member sees it only when it's
 * shown; hidden religion hides denomination too. The owner always sees their
 * own. A religion stored before the option list (free text) shows as stored.
 */
export function faithLine(p: FaithFields, viewer: "owner" | "other"): string | null {
  if (!p.religion) return null;
  if (viewer === "other" && !faithShown(p)) return null;
  const religion = p.religion === "Other" ? p.religion_other : p.religion;
  if (!religion) return null;
  const options = isListedReligion(p.religion) ? DENOMINATIONS[p.religion] : undefined;
  const found = options?.find((d) => d.value === p.denomination);
  const denomination =
    p.denomination === "other" ? p.denomination_other : found ? found.label.replace(/\s*\(.*\)$/, "") : null;
  return denomination ? `${religion} · ${denomination}` : religion;
}

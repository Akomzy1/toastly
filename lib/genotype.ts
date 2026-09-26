/**
 * Genotype — the strictest-handled field in the product (PRD §5.2, CLAUDE.md).
 *
 * Health data: sensitive personal data under Nigeria's NDPA 2023 and
 * special-category data under UK GDPR for diaspora members. Optional,
 * consented at a separate step, private by default, stored encrypted.
 *
 * This module holds the vocabulary and the words. It holds no one's value.
 * The screens it feeds are built against design/prototype/genotype-*.slim.html.
 *
 * The display path — the ONLY code allowed to touch genotype storage — is
 * this file, lib/genotype-actions.ts, components/genotype/ and migration
 * 0014. A constraint check fails the build if genotype storage is referenced
 * anywhere else.
 *
 * Never, anywhere:
 *   - compute, display or imply "compatible" / "incompatible";
 *   - colour-code a value — every value renders in the same neutral style;
 *   - label it verified, confirmed or checked — it is self-reported;
 *   - filter by it, in any form (PRD §5.2: mutual reveal is the mechanism);
 *   - use it to choose or rank anyone's matches;
 *   - pass it to analytics (PostHog), any model or agent, the Trust
 *     Sentinel, or the AriyaPlanner brief.
 */

export const GENOTYPE_VALUES = ["AA", "AS", "AC", "SS", "SC", "unknown"] as const;
export type GenotypeValue = (typeof GENOTYPE_VALUES)[number];

export function isGenotypeValue(v: string): v is GenotypeValue {
  return (GENOTYPE_VALUES as readonly string[]).includes(v);
}

/** The standard order, from genotype-entry.slim.html. No value is a default. */
export const GENOTYPE_LABELS: Record<GenotypeValue, string> = {
  AA: "AA",
  AS: "AS",
  AC: "AC",
  SS: "SS",
  SC: "SC",
  unknown: "I don't know yet",
};

/**
 * How another member's "I don't know yet" reads on a chip.
 *
 * NOT IN THE PROTOTYPE — flagged. genotype-display.slim.html draws the chip
 * for AA–SC only; the shared-but-unknown case has no designed state.
 */
export const GENOTYPE_UNKNOWN_FOR_OTHERS = "not known yet";

export const GENOTYPE_VISIBILITIES = [
  "private",
  "all_matches",
  "after_gist",
  "couple_only",
] as const;
export type GenotypeVisibility = (typeof GENOTYPE_VISIBILITIES)[number];

export function isGenotypeVisibility(v: string): v is GenotypeVisibility {
  return (GENOTYPE_VISIBILITIES as readonly string[]).includes(v);
}

/** Labels and explanations from genotype-visibility.slim.html, verbatim. */
export const GENOTYPE_VISIBILITY_OPTIONS: {
  value: GenotypeVisibility;
  label: string;
  hint: string;
}[] = [
  { value: "private", label: "Only me", hint: "No one else can see it." },
  { value: "all_matches", label: "My matches", hint: "People you've matched with." },
  {
    value: "after_gist",
    label: "After a Gist we both continue",
    hint: "Only people you've both said continue to after a Gist.",
  },
  {
    value: "couple_only",
    label: "My partner in Couple Mode",
    hint: "Only your partner, once you're in Couple Mode together.",
  },
];

/**
 * The consent wording's version. MUST equal genotype_consent_version() in
 * migration 0014 — the database refuses consent to any other version, and a
 * constraint check fails the build if the two drift. Bump both whenever the
 * consent copy below changes.
 */
export const GENOTYPE_CONSENT_VERSION = "2026-09-26";

/**
 * How long Supabase keeps backups that may still hold an encrypted value
 * after deletion. It is stated in the consent copy, so it must be TRUE.
 *
 * NOT VERIFIED against this project: it depends on the Supabase plan, which
 * can't be read from here. Supabase docs (September 2026): Free — no backups;
 * Pro — 7 days; Team — 14; Enterprise — 30; the PITR add-on keeps 7, 14 or 28
 * days instead. 7 is correct only on Pro without PITR.
 */
export const GENOTYPE_BACKUP_RETENTION_DAYS = 7;

/**
 * The privacy policy, with its data-rights contact.
 *
 * BLOCKED — deliberately null. No /privacy page exists (the footer and the
 * signup page already link to one that 404s), and no data-rights contact
 * address has been provided. A dead link inside a legal consent step would be
 * worse than none, so the line renders only once this is set.
 */
export const GENOTYPE_PRIVACY_URL: string | null = null;

/**
 * Plain-language information on what genotype combinations mean.
 *
 * Deliberately null, by decision: which source to point members to is an
 * editorial and medical call. The entry screen's "What do genotypes mean?"
 * link renders only once this is set.
 */
export const GENOTYPE_INFO_URL: string | null = null;

/**
 * The consent copy — APPROVED — laid out the way genotype-consent.slim.html
 * lays it out: an introduction, four headed sections, and a callout.
 */
export const GENOTYPE_CONSENT = {
  title: "Before you add your genotype",
  intro:
    "Your genotype is health information, so we ask for your permission separately before you add it. It's optional — leaving it blank never affects who you're matched with.",
  sections: [
    {
      heading: "What it's for",
      paragraphs: [
        "Showing your genotype to the people you choose, so a conversation many families have before marriage can happen when you're ready. Nothing else.",
      ],
    },
    {
      heading: "Who can see it",
      paragraphs: [
        "Only you, until you decide otherwise. You can share it with your matches, only after a Gist you both want to continue, or only with your partner in Couple Mode — and change that or stop sharing at any time.",
        "You'll only see someone else's genotype if you've both chosen to share with each other.",
      ],
    },
    {
      heading: "What we never do",
      paragraphs: [
        "We never use it to choose or rank your matches, never tell anyone whether a pair is \"compatible\", never mark it as verified, and never pass it to our analytics, to any AI system, to our safety screening, or to AriyaPlanner.",
      ],
    },
    {
      heading: "Deleting it",
      paragraphs: [
        `You can delete it at any time. It's removed from Toastly straight away, together with this permission, and the encrypted backup copies are overwritten within ${GENOTYPE_BACKUP_RETENTION_DAYS} days.`,
        "Until then it's stored encrypted, and only you and the people you've chosen can read it.",
      ],
    },
  ],
  /**
   * Shown at the end of "Deleting it" only once GENOTYPE_PRIVACY_URL is set.
   * NEW LINE — not part of the approved copy; needs review before it renders.
   */
  privacyLine:
    "Our privacy policy explains your rights over this information and how to reach us about them.",
  callout: {
    title: "It's what you tell us. We don't check it.",
    body: "If you're not sure of your genotype, a simple blood test will tell you — and \"I don't know yet\" is a perfectly good answer.",
  },
  checkbox:
    "I agree to Toastly storing my genotype and showing it only to the people I choose, as described above.",
  agree: "Agree and continue",
  decline: "Not now",
} as const;

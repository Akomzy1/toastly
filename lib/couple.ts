/**
 * Couple Mode and the AriyaPlanner handoff CONTRACT.
 *
 * Couple Mode is free on every tier including Starter — the entitlement
 * table types it as literal `true`, so gating it is a compile error. Nothing
 * in this module reads a tier.
 *
 * THE LIVE INTEGRATION IS OUT OF MVP SCOPE. This file defines the shape of
 * the brief and can serialise one, and that is all it does. There is no
 * client, no endpoint, no queue and no outbound call anywhere here. Writing
 * one needs an explicit decision first (PRD §6, Prompt 8).
 */

export type MilestoneKind =
  | "first_date_logged"
  | "official"
  | "met_family"
  | "introduction_ceremony"
  | "anniversary"
  | "engagement";

export const MILESTONE_LABELS: Record<MilestoneKind, string> = {
  first_date_logged: "First date",
  official: "Made it official",
  met_family: "Met the family",
  introduction_ceremony: "Introduction ceremony",
  anniversary: "Anniversary",
  engagement: "Engaged",
};

/** Engagement is the primary handoff trigger into AriyaPlanner. */
export const HANDOFF_TRIGGER: MilestoneKind = "engagement";

/**
 * The handoff brief.
 *
 * Versioned deliberately: this is a contract between two products that will
 * be built at different times, so the consumer needs to know which shape it
 * is reading. Bump `version` on any breaking change.
 */
export const BRIEF_VERSION = 1 as const;

export type CoupleBrief = {
  version: typeof BRIEF_VERSION;
  coupleId: string;
  /** Always true in a serialised brief — see assembleBrief(). */
  bothConsented: true;
  culture: {
    tribes: string[];
    languages: string[];
    homeStates: string[];
  };
  location: {
    /** "NG" for a wedding at home, or the diaspora country. */
    baseCountry: string | null;
    diasporaCity: string | null;
  };
  aesthetic: Record<string, unknown>;
  budgetCues: Record<string, unknown>;
  milestones: { kind: MilestoneKind; occurredOn: string }[];
  assembledAt: string;
};

export type BriefSource = {
  coupleId: string;
  aConsentedAt: string | null;
  bConsentedAt: string | null;
  tribes: string[];
  languages: string[];
  homeStates: string[];
  baseCountry: string | null;
  diasporaCity: string | null;
  aesthetic: Record<string, unknown>;
  budgetCues: Record<string, unknown>;
  milestones: { kind: MilestoneKind; occurredOn: string }[];
};

/**
 * Assemble a brief, or refuse.
 *
 * Returns null unless BOTH members have consented. The consent check lives
 * here rather than at the call site so that no future caller — including the
 * integration, whenever it is written — can assemble a brief without it.
 * `bothConsented` is typed as literal `true` so an unconsented brief is not
 * representable.
 */
export function assembleBrief(source: BriefSource): CoupleBrief | null {
  if (!source.aConsentedAt || !source.bConsentedAt) return null;

  return {
    version: BRIEF_VERSION,
    coupleId: source.coupleId,
    bothConsented: true,
    culture: {
      tribes: source.tribes,
      languages: source.languages,
      homeStates: source.homeStates,
    },
    location: {
      baseCountry: source.baseCountry,
      diasporaCity: source.diasporaCity,
    },
    aesthetic: source.aesthetic,
    budgetCues: source.budgetCues,
    milestones: source.milestones,
    assembledAt: new Date().toISOString(),
  };
}

/**
 * What a member sees before consenting.
 *
 * Consent is meaningless if nobody can see what they are agreeing to share,
 * so this enumerates the brief in plain language for the consent screen.
 */
export function describeBrief(source: BriefSource): string[] {
  const lines: string[] = [];
  if (source.tribes.length) lines.push(`Tribes: ${source.tribes.join(", ")}`);
  if (source.languages.length)
    lines.push(`Languages: ${source.languages.join(", ")}`);
  if (source.homeStates.length)
    lines.push(`Home states: ${source.homeStates.join(", ")}`);
  if (source.baseCountry)
    lines.push(
      source.diasporaCity
        ? `Based in ${source.diasporaCity}`
        : `Based in ${source.baseCountry}`,
    );
  if (Object.keys(source.aesthetic).length)
    lines.push("Style notes you've both saved");
  if (Object.keys(source.budgetCues).length)
    lines.push("Rough budget range you've both indicated");
  if (source.milestones.length)
    lines.push(`${source.milestones.length} milestones from your timeline`);
  return lines;
}

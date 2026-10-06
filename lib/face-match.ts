/**
 * Turning Smile ID's verdicts into a main-photo outcome (PRD §5.1.2).
 *
 * Pure, so it can be tested without a provider. The rules:
 *   - borderline is never a rejection: "attention" goes to a person;
 *   - a spoof or fraud flag also goes to a person — an automated system
 *     must not take that call alone (CLAUDE.md: a person decides any
 *     account restriction);
 *   - a provider or system error is never held against the member: it
 *     goes to a person too;
 *   - only a clear "this is not the face" is a mismatch, and the reason
 *     decides which screen the member sees (photos-main-check).
 */

export type ProviderStatus = "clear" | "attention" | "block" | "error";
export type StepResult = { status: ProviderStatus; reason: string | null };

export type MismatchReason = "face_not_clear" | "not_matching" | "not_same_person";
export type MatchOutcome =
  | { outcome: "matched" }
  | { outcome: "review" }
  | { outcome: "mismatch"; reason: MismatchReason };

const REVIEW: MatchOutcome = { outcome: "review" };

/** Authentication: is the fresh selfie the member enrolled at Verified Real? */
export function authenticationOutcome(r: StepResult): MatchOutcome {
  if (r.status === "clear") return { outcome: "matched" };
  if (r.status === "block" && r.reason === "face_verification_failed") {
    return { outcome: "mismatch", reason: "not_same_person" };
  }
  return REVIEW;
}

/** Compare: does the fresh selfie match the proposed main photo? */
export function compareOutcome(r: StepResult): MatchOutcome {
  if (r.status === "clear") return { outcome: "matched" };
  if (r.status === "block" && r.reason === "face_verification_failed") {
    return { outcome: "mismatch", reason: "not_matching" };
  }
  if (r.status === "error" && r.reason === "image_unavailable_or_invalid") {
    return { outcome: "mismatch", reason: "face_not_clear" };
  }
  return REVIEW;
}

/**
 * The ONE onboarding selfie (decided 2026-10-05): a single Compare of the
 * live selfie against the main photo answers two questions at once — is a
 * real person here (liveness, for Verified Real), and is the main photo
 * them.
 *
 *   clear                       -> live, matched
 *   face_verification_failed    -> live (the selfie passed liveness), but
 *                                  the photo doesn't look like them
 *   image_unavailable_or_invalid-> the check couldn't run: choose a clearer
 *                                  main photo and take it again
 *   anything else               -> a person decides both
 */
export type OnboardingOutcome = {
  live: "passed" | "review" | "retake";
  match: MatchOutcome;
};

export function onboardingOutcome(r: StepResult): OnboardingOutcome {
  if (r.status === "clear") return { live: "passed", match: { outcome: "matched" } };
  if (r.status === "block" && r.reason === "face_verification_failed") {
    return { live: "passed", match: { outcome: "mismatch", reason: "not_matching" } };
  }
  if (r.status === "error" && r.reason === "image_unavailable_or_invalid") {
    return { live: "retake", match: { outcome: "mismatch", reason: "face_not_clear" } };
  }
  return { live: "review", match: REVIEW };
}

/**
 * Both steps must pass. "Not the enrolled person" outranks everything,
 * then any other mismatch, then review.
 */
export function combineOutcomes(auth: StepResult, compare: StepResult): MatchOutcome {
  const a = authenticationOutcome(auth);
  const c = compareOutcome(compare);
  if (a.outcome === "mismatch") return a;
  if (c.outcome === "mismatch") return c;
  if (a.outcome === "review" || c.outcome === "review") return REVIEW;
  return { outcome: "matched" };
}

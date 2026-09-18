/**
 * Trust Sentinel — Phase 1 event contract (PRD §5.1.1).
 *
 * WHAT EXISTS: structured behavioural events, emitted by database triggers.
 * WHAT DOES NOT: scoring, thresholds, a review queue, restrictions, or the
 * agent itself. Those are Phase 2, deliberately deferred until there is
 * enough data to set thresholds from evidence rather than invention.
 *
 * Nothing reads these events yet. This module exists so the event vocabulary
 * has one definition, and so the boundaries travel with it.
 *
 * ---------------------------------------------------------------------------
 * The governing rule, from CLAUDE.md: agents in the infrastructure, never in
 * the intimacy. No agent writes messages for members, suggests replies,
 * coaches a live conversation, or speaks as a member. The Sentinel protects
 * people; it never talks to them or for them.
 * ---------------------------------------------------------------------------
 *
 * Two inputs are forbidden, and the database enforces both with a CHECK on
 * every row's metadata:
 *
 *   - Message content, Gist audio and transcripts. The Sentinel reasons about
 *     behaviour, not words. This extends the existing "never scan chat"
 *     boundary to all content analysis.
 *   - Protected attributes: tribe, religion, language, relationship history,
 *     profession, diaspora status. A signal correlating with any of these is
 *     a defect to be corrected, not a finding.
 */

export type TrustEventKind =
  // Gist refusal pattern — the strongest single signal
  | "gist_invitation_sent"
  | "gist_invitation_declined"
  | "gist_invitation_cancelled"
  | "gist_session_completed"
  // Escalation velocity
  | "couple_mode_requested"
  | "date_request_created"
  // Report clustering
  | "report_filed"
  // Verification drift
  | "verification_recheck"
  // Coin-deposit no-show pattern
  | "stake_forfeited"
  | "stake_credit_received"
  // Cross-tier arbitrage — same signals as pricing integrity, one pipeline
  | "payment_geography_mismatch"
  | "phone_origin_mismatch"
  | "ip_country_mismatch";

export type TrustEvent = {
  id: string;
  /** Whose behaviour this describes. */
  profile_id: string;
  /** The other party, where the signal involves one. */
  subject_id: string | null;
  kind: TrustEventKind;
  occurred_at: string;
  /** Counts, elapsed times and category labels only. */
  meta: Record<string, unknown>;
};

/**
 * Which signal in §5.1.1's table each event serves.
 *
 * Kept as documentation for whoever builds Phase 2, so the scoring work
 * starts from the table the product decided on rather than from the event
 * names alone.
 */
export const SIGNAL_FOR: Record<TrustEventKind, string> = {
  gist_invitation_sent: "Gist refusal pattern",
  gist_invitation_declined: "Gist refusal pattern",
  gist_invitation_cancelled: "Gist refusal pattern",
  gist_session_completed: "Gist refusal pattern (denominator)",
  couple_mode_requested: "Escalation velocity",
  date_request_created: "Escalation velocity",
  report_filed: "Report clustering",
  verification_recheck: "Verification drift",
  stake_forfeited: "Coin-deposit no-show pattern",
  stake_credit_received: "Coin-deposit no-show pattern",
  payment_geography_mismatch: "Cross-tier arbitrage overlap",
  phone_origin_mismatch: "Cross-tier arbitrage overlap",
  ip_country_mismatch: "Cross-tier arbitrage overlap",
};

/**
 * Signals named in §5.1.1 that are NOT instrumented yet, and why.
 *
 * Recorded rather than silently omitted, so Phase 2 knows what is missing
 * instead of assuming the table is fully covered.
 */
export const NOT_YET_INSTRUMENTED = [
  // Needs the Gist deck to record which questions were answered, and a
  // comparison against profile fields. The deck stores no per-question
  // outcome today, and profession/location are protected attributes —
  // so this one needs a design that does not use them as inputs.
  "Profile-vs-Gist inconsistency",
  // There is no off-platform contact affordance yet: PRD §5.1 withholds it
  // until a trust threshold, and it is not built.
  "Escalation velocity — off-platform contact affordance",
] as const;

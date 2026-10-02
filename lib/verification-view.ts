import type { VerificationStage } from "@/lib/types/profile";

/**
 * Which verification screen a member sees, derived from their stage and their
 * latest Smile ID session for each product. Pure — shared by the page and the
 * audit harness. Reads no tier: verification is never paywalled.
 */

export type VerifyView =
  | { kind: "phone" }
  | { kind: "start" }
  | { kind: "selfie_checking" }
  | { kind: "selfie_review" }
  | { kind: "selfie_retry"; status: "block" | "error"; code: string | null }
  | { kind: "passed" }
  | { kind: "id_checking" }
  | { kind: "id_review" }
  | { kind: "id_retry"; status: "block" | "error"; code: string | null }
  | { kind: "both" };

export type SessionSummary = {
  status: "started" | "submitted" | "clear" | "attention" | "block" | "error";
  result_code: string | null;
  created_at: string;
};

/**
 * A session the browser handed to Smile ID but that has no result yet counts
 * as "being checked" for this long. Past it, the member can start again —
 * a late result still lands, because the callback matches on the session.
 */
const CHECKING_WINDOW_MS = 30 * 60 * 1000;

function fromSession(
  s: SessionSummary | null,
  now: number,
): "checking" | "review" | { status: "block" | "error"; code: string | null } | null {
  if (!s) return null;
  if (s.status === "submitted") {
    return now - Date.parse(s.created_at) < CHECKING_WINDOW_MS ? "checking" : null;
  }
  if (s.status === "attention") return "review";
  if (s.status === "block" || s.status === "error") return { status: s.status, code: s.result_code };
  return null;
}

export function deriveVerifyView(
  stage: VerificationStage,
  selfie: SessionSummary | null,
  idCheck: SessionSummary | null,
  now: number = Date.now(),
): VerifyView {
  if (stage === "unverified") return { kind: "phone" };
  if (stage === "id_confirmed") return { kind: "both" };

  if (stage === "phone_verified") {
    const s = fromSession(selfie, now);
    if (s === "checking") return { kind: "selfie_checking" };
    if (s === "review") return { kind: "selfie_review" };
    if (s) return { kind: "selfie_retry", ...s };
    return { kind: "start" };
  }

  const s = fromSession(idCheck, now);
  if (s === "checking") return { kind: "id_checking" };
  if (s === "review") return { kind: "id_review" };
  if (s) return { kind: "id_retry", ...s };
  return { kind: "passed" };
}

export function isVerifiedReal(view: VerifyView): boolean {
  return !["phone", "start", "selfie_checking", "selfie_review", "selfie_retry"].includes(view.kind);
}

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
  /** Set when staff asked this member to take the selfie check again (0025). */
  reverifySince: string | null = null,
): VerifyView {
  if (stage === "unverified") return { kind: "phone" };

  // Asked to re-verify: the selfie step again, judged only on attempts made
  // since the request. A pass clears the request (0025's trigger), and the
  // ID ring is kept throughout.
  if (reverifySince && (stage === "verified_real" || stage === "id_confirmed")) {
    const fresh = selfie && Date.parse(selfie.created_at) >= Date.parse(reverifySince) ? selfie : null;
    const s = fromSession(fresh, now);
    if (s === "checking") return { kind: "selfie_checking" };
    if (s === "review") return { kind: "selfie_review" };
    if (s) return { kind: "selfie_retry", ...s };
    return { kind: "start" };
  }

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

export type IdCheckRow = SessionSummary & { step: string | null; check_id: string | null };

/**
 * The in-page ID check is two sessions on one capture (decided 6 October
 * 2026): id_kyc (the record) and id_auth (the face registered at onboarding).
 * Read as one check, from the latest pair: any half still running → being
 * checked; any half refused → retry, the record's reason first; any error →
 * retry; any half borderline → a person; both clear → clear. A hosted ID
 * check (no step) is retired and decides nothing.
 */
export function latestIdCheck(rows: IdCheckRow[]): SessionSummary | null {
  const halves = rows.filter((r) => r.step === "id_kyc" || r.step === "id_auth");
  const latest = halves.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  if (!latest?.check_id) return null;
  const pair = halves.filter((r) => r.check_id === latest.check_id);
  const kyc = pair.find((r) => r.step === "id_kyc");
  const auth = pair.find((r) => r.step === "id_auth");
  const created_at = pair.reduce((t, r) => (Date.parse(r.created_at) < Date.parse(t) ? r.created_at : t), latest.created_at);
  const any = (s: SessionSummary["status"]) => pair.some((r) => r.status === s);
  if (any("started") || any("submitted")) return { status: "submitted", result_code: null, created_at };
  if (kyc?.status === "block") return { status: "block", result_code: kyc.result_code, created_at };
  if (auth?.status === "block") return { status: "block", result_code: "not_same_person", created_at };
  if (any("error")) return { status: "error", result_code: (kyc?.status === "error" ? kyc : auth)?.result_code ?? null, created_at };
  if (any("attention")) return { status: "attention", result_code: null, created_at };
  return { status: "clear", result_code: null, created_at };
}

export function isVerifiedReal(view: VerifyView): boolean {
  return !["phone", "start", "selfie_checking", "selfie_review", "selfie_retry"].includes(view.kind);
}

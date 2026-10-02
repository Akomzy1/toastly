import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAuditHarness } from "@/lib/audit-harness";
import { VerifyFlow } from "@/components/verify/verify-flow";
import type { VerifyView } from "@/lib/verification-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Audit · verification",
  robots: { index: false, follow: false },
};

/**
 * Mobile-audit harness: every verification state, with mock data.
 * The `attention` states exist only here — Smile ID's sandbox has no
 * scenario that returns one.
 */
const STATES: Record<string, { view: VerifyView; screen?: "overview" | "before_selfie" | "id_form" }> = {
  start: { view: { kind: "start" } },
  "before-selfie": { view: { kind: "start" }, screen: "before_selfie" },
  checking: { view: { kind: "selfie_checking" } },
  review: { view: { kind: "selfie_review" } },
  "retry-spoof": { view: { kind: "selfie_retry", status: "block", code: "spoof_detected" } },
  "retry-image": { view: { kind: "selfie_retry", status: "error", code: "image_unavailable_or_invalid" } },
  "retry-error": { view: { kind: "selfie_retry", status: "error", code: "internal_error" } },
  passed: { view: { kind: "passed" } },
  "id-form": { view: { kind: "passed" }, screen: "id_form" },
  "id-checking": { view: { kind: "id_checking" } },
  "id-review": { view: { kind: "id_review" } },
  "id-not-found": { view: { kind: "id_retry", status: "block", code: "identifier_not_found" } },
  "id-face": { view: { kind: "id_retry", status: "block", code: "face_verification_failed" } },
  "id-used": { view: { kind: "id_retry", status: "block", code: "id_already_used" } },
  "id-error": { view: { kind: "id_retry", status: "error", code: "service_unavailable" } },
  both: { view: { kind: "both" } },
};

export default function AuditVerify({ params }: { params: { state: string } }) {
  requireAuditHarness();
  const s = STATES[params.state];
  if (!s) notFound();
  return <VerifyFlow view={s.view} initialScreen={s.screen} />;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAuditHarness } from "@/lib/audit-harness";
import { VerifyFlow } from "@/components/verify/verify-flow";
import { SelfieCheckStep } from "@/app/(app)/verify/selfie-check-step";
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
const STATES: Record<string, { view: VerifyView; screen?: "overview" | "id_form"; reverify?: boolean; idConfirmed?: boolean }> = {
  start: { view: { kind: "start" } },
  // A re-check a reviewer asked for — the in-page selfie with its own consent.
  reverify: { view: { kind: "start" }, reverify: true },
  checking: { view: { kind: "selfie_checking" } },
  review: { view: { kind: "selfie_review" } },
  "retry-spoof": { view: { kind: "selfie_retry", status: "block", code: "spoof_detected" } },
  "retry-image": { view: { kind: "selfie_retry", status: "error", code: "image_unavailable_or_invalid" } },
  "retry-error": { view: { kind: "selfie_retry", status: "error", code: "internal_error" } },
  "reverify-checking": { view: { kind: "selfie_checking" }, reverify: true },
  // A member with the ID ring: it stays shown as done through a re-check.
  "reverify-with-id": { view: { kind: "start" }, reverify: true, idConfirmed: true },
  "reverify-retry": { view: { kind: "selfie_retry", status: "block", code: "spoof_detected" }, reverify: true },
  passed: { view: { kind: "passed" } },
  "id-form": { view: { kind: "passed" }, screen: "id_form" },
  "id-checking": { view: { kind: "id_checking" } },
  "id-review": { view: { kind: "id_review" } },
  "id-not-found": { view: { kind: "id_retry", status: "block", code: "identifier_not_found" } },
  "id-face": { view: { kind: "id_retry", status: "block", code: "face_verification_failed" } },
  "id-used": { view: { kind: "id_retry", status: "block", code: "id_already_used" } },
  "id-not-same-person": { view: { kind: "id_retry", status: "block", code: "not_same_person" } },
  "id-error": { view: { kind: "id_retry", status: "error", code: "service_unavailable" } },
  both: { view: { kind: "both" } },
};

export default function AuditVerify({ params }: { params: { state: string } }) {
  requireAuditHarness();
  const s = STATES[params.state];
  if (!s) notFound();
  const selfie = s.view.kind === "start" || s.view.kind === "selfie_retry";
  return (
    <VerifyFlow
      view={s.view}
      initialScreen={s.screen}
      reverify={s.reverify}
      idConfirmed={s.idConfirmed}
      selfieStep={
        selfie ? <SelfieCheckStep connected devStandIn={false} photosReady mode={s.reverify ? "reverify" : "onboard"} /> : undefined
      }
    />
  );
}

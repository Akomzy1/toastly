import { notFound } from "next/navigation";
import { requireAuditHarness } from "@/lib/audit-harness";
import { PhotosEditor, type CandidateState, type EditorPhoto } from "@/app/(app)/profile/photos/photos-editor";

export const dynamic = "force-dynamic";

const P = (n: number): EditorPhoto => ({
  id: `photo-${n}`,
  url: ["/img/diaspora/couple-bola-tunde.webp", "/img/diaspora/couple-chidi-ngozi.webp", "/img/diaspora/diaspora-back-home.webp", "/img/diaspora/diaspora-community.webp", "/img/diaspora/diaspora-language-tribe.webp"][n % 5],
});

const STATES: Record<string, { mode: "onboard" | "edit"; main: EditorPhoto | null; candidate: EditorPhoto | null; state: CandidateState; others: EditorPhoto[]; verified: boolean }> = {
  "onboard-empty": { mode: "onboard", main: null, candidate: null, state: null, others: [], verified: false },
  "onboard-ready": { mode: "onboard", main: null, candidate: P(0), state: "waiting", others: [P(1), P(2), P(3)], verified: false },
  "check-face": { mode: "onboard", main: null, candidate: P(0), state: "face", others: [P(1), P(2), P(3)], verified: true },
  "check-selfie": { mode: "onboard", main: null, candidate: P(0), state: "selfie", others: [P(1), P(2), P(3)], verified: true },
  "check-review": { mode: "onboard", main: null, candidate: P(0), state: "review", others: [P(1), P(2), P(3)], verified: false },
  "edit": { mode: "edit", main: P(0), candidate: null, state: null, others: [P(1), P(2), P(3), P(4)], verified: true },
  "replace": { mode: "edit", main: P(0), candidate: P(4), state: "waiting", others: [P(1), P(2), P(3)], verified: true },
  "replace-checking": { mode: "edit", main: P(0), candidate: P(4), state: "checking", others: [P(1), P(2), P(3)], verified: true },
  "replace-failed": { mode: "edit", main: P(0), candidate: P(4), state: "selfie", others: [P(1), P(2), P(3)], verified: true },
};

/** Mobile-audit harness: the photo screens (photos-upload, photos-main-check, photo-replace-main). */
export default function AuditPhotos({ params }: { params: { state: string } }) {
  requireAuditHarness();
  const s = STATES[params.state];
  if (!s) notFound();
  return (
    <div className="min-h-screen bg-paper">
      <PhotosEditor
        mode={s.mode}
        main={s.main}
        candidate={s.candidate}
        candidateState={s.state}
        others={s.others}
        onlyMatches={false}
        verifiedReal={s.verified}
        checksConnected
        devStandIn={false}
      />
    </div>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SANDBOX_IDENTITIES, sandboxPickerAllowed, smileConfig } from "@/lib/smile-id";
import { PhotosEditor, type EditorPhoto, type CandidateState } from "./photos-editor";

export const metadata: Metadata = {
  title: "Your photos",
  robots: { index: false, follow: false },
};

/**
 * Profile photos (/profile/photos) — built against design/prototype/photos-upload.slim.html,
 * photos-main-check.slim.html and photo-replace-main.slim.html (PRD §5.1.2,
 * Prompt 14). Ported from live-profile-and-prompt-14.
 *
 * ALWAYS OPEN, whatever the member's live status: this is how a profile
 * goes live, and how paused access is restored.
 *
 * Deviation, as on every in-app screen so far (see the locked inbox): the
 * prototype's dark frame bar ("‹ Your photos / Profile setup") is the
 * phone-frame chrome of the export, so the page heading carries it inside
 * the app shell instead.
 */
export default async function PhotosPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: rows }, { data: check }] = await Promise.all([
    supabase
      .from("profiles")
      .select("main_photo_id, pending_main_photo_id, photo_reveal, first_live_at, stage")
      .eq("id", user.id)
      .single(),
    supabase
      .from("profile_photos")
      .select("id, storage_path, position, face_match, created_at")
      .eq("profile_id", user.id)
      .order("position")
      .order("created_at"),
    supabase.rpc("main_photo_check"),
  ]);

  const photos = rows ?? [];

  // Short-lived signed URLs: the bucket is private, and the member's own
  // files are always theirs to see (0007).
  const { data: signed } = photos.length
    ? await supabase.storage
        .from("profile-photos")
        .createSignedUrls(photos.map((p) => p.storage_path), 60 * 30)
    : { data: [] };
  const urlOf = (path: string) => signed?.find((s) => s.path === path)?.signedUrl ?? "";

  const c = (check ?? {}) as {
    main_photo_id?: string | null;
    candidate_id?: string | null;
    candidate_state?: string | null;
    candidate_reason?: string | null;
    check_running?: boolean;
  };
  const verifiedReal = profile?.stage === "verified_real" || profile?.stage === "id_confirmed";

  const toEditor = (p: (typeof photos)[number]): EditorPhoto => ({
    id: p.id,
    url: urlOf(p.storage_path),
  });

  const main = photos.find((p) => p.id === profile?.main_photo_id) ?? null;
  const candidate = photos.find((p) => p.id === c.candidate_id) ?? null;

  // "waiting": chosen, but no check has run — during onboarding it waits for
  // the one selfie on /verify; when replacing, for the fresh selfie.
  let candidateState: CandidateState = null;
  if (candidate) {
    if (c.candidate_state === "pending") candidateState = c.check_running ? "checking" : "waiting";
    else if (c.candidate_state === "review") candidateState = "review";
    else if (c.candidate_reason === "face_not_clear") candidateState = "face";
    else if (c.candidate_reason) candidateState = "selfie";
  }

  const others = photos
    .filter((p) => p.id !== main?.id && p.id !== candidate?.id)
    .map(toEditor);

  return (
    <PhotosEditor
      mode={profile?.first_live_at ? "edit" : "onboard"}
      main={main ? toEditor(main) : null}
      candidate={candidate ? toEditor(candidate) : null}
      candidateState={candidateState}
      others={others}
      onlyMatches={profile?.photo_reveal === "after_i_reply" || profile?.photo_reveal === "after_gist"}
      verifiedReal={verifiedReal}
      checksConnected={smileConfig() !== null}
      devStandIn={process.env.NODE_ENV !== "production"}
      sandbox={
        sandboxPickerAllowed(smileConfig(), user.email)
          ? SANDBOX_IDENTITIES.filter((s) => s.products.includes("smartselfie")).map(({ key, label }) => ({ key, label }))
          : []
      }
    />
  );
}

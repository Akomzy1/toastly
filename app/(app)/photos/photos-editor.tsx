"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { compressPhoto } from "@/lib/compress-photo";
import { Notice } from "@/components/ui/notice";
import { VerifiedSeal } from "@/components/ui/verified-seal";
import { AppBand, AppColumn } from "@/components/app/app-band";
import { ConsentPanel } from "@/components/app/consent-panel";
import { cn } from "@/lib/utils";
import {
  askForReview,
  checkMainPhoto,
  keepAsOtherPhoto,
  nominateMainPhoto,
  prepareUpload,
  registerPhoto,
  removePhoto,
  setOnlyMatches,
} from "./actions";

/**
 * The photo screens, as one client component because they act on one set:
 *
 *   photos-upload.slim.html       the set — 4:5 tiles, the main-photo card,
 *                                 Optional slots 5–6, the quiet counter, the
 *                                 replace/remove sheet
 *   photos-main-check.slim.html   a first main photo that wasn't confirmed
 *   photo-replace-main.slim.html  replacing a matched main photo: current and
 *                                 new side by side, the consent, the result
 *
 * Onboarding (decided 2026-10-05): photos come first, and the main photo
 * waits — private — for the ONE selfie on /verify, which checks liveness and
 * the photo together. Only a member who is already Verified Real takes a
 * fresh selfie here, to replace the main photo.
 *
 * The selfie capture is Smile ID's in-browser camera, not wired yet: in
 * development a stand-in records a match; elsewhere the screen says so.
 */

export type EditorPhoto = { id: string; url: string };
export type CandidateState = "waiting" | "checking" | "review" | "face" | "selfie" | null;

const MIN = 4;
const MAX = 6;

type View = "photos" | "replace" | "check";

export function PhotosEditor(props: {
  mode: "onboard" | "edit";
  main: EditorPhoto | null;
  candidate: EditorPhoto | null;
  candidateState: CandidateState;
  others: EditorPhoto[];
  onlyMatches: boolean;
  verifiedReal: boolean;
  checksConnected: boolean;
  devStandIn: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [sheet, setSheet] = React.useState<number | null>(null); // 0 = main
  const [onlyMatches, setOnly] = React.useState(props.onlyMatches);
  const [confirmed, setConfirmed] = React.useState(false);

  const replacing = Boolean(props.main); // a matched main photo exists
  const failed = props.candidateState === "face" || props.candidateState === "selfie";
  // A Verified Real member's new main photo is checked here, with a fresh
  // selfie; anyone else's waits for the onboarding selfie on /verify.
  const freshSelfie = props.verifiedReal;
  const [view, setView] = React.useState<View>(() => {
    if (!props.candidate || !props.candidateState) return "photos";
    if (replacing) return "replace";
    if (failed) return "check";
    if (props.candidateState === "review") return freshSelfie ? "replace" : "check";
    return freshSelfie ? "replace" : "photos";
  });

  const fileInput = React.useRef<HTMLInputElement>(null);
  const pendingSlot = React.useRef<number | null>(null);

  const edit = props.mode === "edit";
  // Onboarding shows the chosen main photo in the main slot while it waits
  // or is checked; when replacing, the matched one stays there.
  const mainShown = replacing
    ? props.main
    : props.candidate && (props.candidateState === "waiting" || props.candidateState === "checking")
      ? props.candidate
      : null;
  const mainState: "matched" | "checking" | "waiting" | null = replacing
    ? "matched"
    : props.candidateState === "checking"
      ? "checking"
      : props.candidateState === "waiting"
        ? "waiting"
        : null;
  const count = (mainShown ? 1 : 0) + props.others.length;
  const ready = Boolean(mainShown) && count >= MIN;

  let counterNote: string;
  if (count < MIN) counterNote = `Add ${MIN - count} more to continue`;
  else if (!mainShown) counterNote = "Add your main photo to continue";
  else counterNote = count < MAX ? `You can add ${MAX - count} more` : "That's the most you can add";

  async function upload(file: File, slot: number) {
    setBusy(true);
    setMessage(null);
    const fail = (text = "That photo didn't upload. Try again.") => setMessage({ tone: "error", text });
    try {
      let blob: Blob;
      try {
        blob = await compressPhoto(file);
      } catch {
        return fail("That file isn't a photo we can use. Try a JPEG or PNG.");
      }
      const target = await prepareUpload();
      if (target?.error || !target?.url || !target.path) return fail(target?.error);
      const put = await fetch(target.url, {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg", "x-upsert": "false" },
        body: blob,
      });
      if (!put.ok) return fail();

      const result = await registerPhoto(target.path, slot);
      if (result?.error || !result?.id) return fail(result?.error);

      if (slot === 0) {
        // An earlier candidate that wasn't confirmed, or is being replaced
        // before its check, goes.
        if (props.candidate) await removePhoto(props.candidate.id);
        const n = await nominateMainPhoto(result.id);
        if (n?.error) return fail(n.error);
        setConfirmed(false);
        setView(freshSelfie ? "replace" : "photos");
      }
      router.refresh();
    } catch {
      fail();
    } finally {
      setBusy(false);
    }
  }

  function choose(slot: number) {
    pendingSlot.current = slot;
    setSheet(null);
    fileInput.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const slot = pendingSlot.current;
    if (!file || slot === null) return;
    // Replacing one of the other photos: the new one goes in, the old one out.
    if (slot > 0 && props.others[slot - 1]) {
      const old = props.others[slot - 1];
      await upload(file, slot);
      await removePhoto(old.id);
      router.refresh();
      return;
    }
    await upload(file, slot);
  }

  async function remove(slot: number) {
    const photo = props.others[slot - 1];
    setSheet(null);
    if (!photo) return;
    setBusy(true);
    const r = await removePhoto(photo.id);
    setBusy(false);
    if (r?.error) setMessage({ tone: "error", text: r.error });
    router.refresh();
  }

  async function toggleOnly() {
    const next = !onlyMatches;
    setOnly(next);
    const r = await setOnlyMatches(next);
    if (r?.error) {
      setOnly(!next);
      setMessage({ tone: "error", text: r.error });
    }
  }

  const fileField = (
    <input ref={fileInput} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onFile} />
  );
  const notice = message ? <Notice tone={message.tone}>{message.text}</Notice> : null;

  // --- Replacing the main photo (photo-replace-main) ------------------------
  if (view === "replace" && (props.candidate || confirmed)) {
    return (
      <>
        <AppBand title="Main photo" sub={edit ? "Edit photos" : "Profile setup"} />
        <AppColumn gap="gap-5">
          {fileField}
          <ReplaceMain
            current={props.main}
            candidate={props.candidate}
            state={confirmed ? "confirmed" : props.candidateState}
            busy={busy}
            checksConnected={props.checksConnected}
            devStandIn={props.devStandIn}
            onSubmit={async (form) => {
              setBusy(true);
              setMessage(null);
              const r = await checkMainPhoto(form);
              setBusy(false);
              if (r?.error) return setMessage({ tone: "error", text: r.error });
              if (r?.ok?.startsWith("Matched")) setConfirmed(true);
              router.refresh();
            }}
            onKeep={async () => {
              if (props.candidate) await removePhoto(props.candidate.id);
              setView("photos");
              router.refresh();
            }}
            onTryAnother={() => choose(0)}
            onDone={() => {
              setConfirmed(false);
              setView("photos");
              router.refresh();
            }}
          />
          {notice}
        </AppColumn>
      </>
    );
  }

  // --- A first main photo that wasn't confirmed (photos-main-check) -------
  if (view === "check" && props.candidate && props.candidateState) {
    return (
      <>
        <AppBand title="Main photo" sub={edit ? "Profile" : "Profile setup"} />
        <AppColumn gap="gap-5">
          {fileField}
          <MainCheck
            photo={props.candidate}
            state={props.candidateState}
            busy={busy}
            onChooseAnother={() => choose(0)}
            onUseAsOther={async () => {
              setBusy(true);
              const r = await keepAsOtherPhoto(props.candidate!.id);
              setBusy(false);
              if (r?.error) setMessage({ tone: "error", text: r.error });
              setView("photos");
              router.refresh();
            }}
            onAskPerson={async () => {
              setBusy(true);
              const r = await askForReview(props.candidate!.id);
              setBusy(false);
              if (r?.error) setMessage({ tone: "error", text: r.error });
              router.refresh();
            }}
            onKeepGoing={() => setView("photos")}
          />
          {notice}
        </AppColumn>
      </>
    );
  }

  // --- The set (photos-upload) --------------------------------------------
  return (
    <>
      <AppBand title={edit ? "Edit photos" : "Your photos"} sub={edit ? "Profile" : "Profile setup"} />
      <AppColumn gap="gap-5">
        {fileField}

        <div className="grid gap-1.5 px-0.5">
          <h2 className="font-serif text-[24px] font-bold leading-[1.2] text-ink-900">
            {edit ? "Your photos" : "Add your photos"}
          </h2>
          <p className="text-ui leading-[1.6] text-ink-800">Add at least 4 photos, up to 6.</p>
        </div>

        <div className="grid gap-3 rounded-xl border border-ink-900/[.12] bg-white p-3.5">
          <div className="flex items-center gap-3.5">
            <div className="w-[104px] flex-shrink-0">
              {mainShown ? (
                <button
                  type="button"
                  onClick={() => setSheet(0)}
                  aria-label="Main photo. Tap to choose another."
                  className="relative block aspect-[4/5] w-full overflow-hidden rounded-lg bg-grey-200"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from a private bucket */}
                  <img src={mainShown.url} alt="" className="block h-full w-full object-cover" />
                  <SlotNumber n={1} />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => choose(0)}
                  className="grid aspect-[4/5] w-full place-items-center content-center gap-0.5 rounded-lg border-[1.5px] border-dashed border-green-500/50 bg-green-50 text-green-500 transition-colors hover:border-green-500"
                >
                  <span aria-hidden="true" className="text-[24px] leading-none">+</span>
                  <span className="text-[13px] font-semibold">Add main photo</span>
                </button>
              )}
            </div>

            <div className="grid min-w-0 gap-2">
              <p className="text-chip font-semibold uppercase tracking-[0.12em] text-green-500">Main photo</p>
              {mainState === "matched" ? (
                <StatusLine icon={<Seal size={36} />} title="Verified Real" sub="Matches your selfie" />
              ) : null}
              {mainState === "checking" ? (
                <StatusLine role="status" icon={<Ring track="stroke-gold-100" arc="stroke-gold-600" dash="24 60" />} title="Checking" sub="You can keep going" />
              ) : null}
              {mainState === "waiting" ? (
                <StatusLine
                  title="Not checked yet"
                  sub={freshSelfie ? "Needs a quick selfie" : "Checked with your selfie, after your photos"}
                />
              ) : null}
              {!mainShown ? <span className="text-nav leading-[1.5] text-grey-600">A clear photo of your face</span> : null}
            </div>
          </div>
          <p className="text-nav leading-[1.6] text-ink-800">
            Your main photo needs to show your face clearly. We&rsquo;ll check it matches your Verified Real selfie,
            so people know your photos are really you.
          </p>
        </div>

        {/* A replacement or an unconfirmed first photo: the way back to it. */}
        {props.candidate && props.candidateState && (replacing || freshSelfie || failed || props.candidateState === "review") ? (
          <button
            type="button"
            onClick={() => setView(failed && !replacing ? "check" : freshSelfie ? "replace" : "check")}
            className="min-h-11 rounded-lg border border-ink-900/20 px-4 py-3 text-left text-ui font-semibold text-ink-900 hover:border-green-500 hover:bg-green-50"
          >
            {props.candidateState === "review"
              ? "Your new main photo is with our team"
              : props.candidateState === "checking"
                ? "Your new main photo is being checked"
                : props.candidateState === "waiting"
                  ? "Finish checking your new main photo"
                  : "We couldn't confirm your new main photo"}
          </button>
        ) : null}

        <div className="grid gap-3">
          <div className="grid gap-1.5 px-0.5">
            <p className="text-chip font-semibold uppercase tracking-[0.12em] text-green-500">Your other photos</p>
            <p className="text-nav leading-[1.6] text-ink-800">
              Show your world — a place you love, what you&rsquo;re cooking, a moment with friends. They don&rsquo;t
              need to be of your face.
            </p>
          </div>
          <ul className="grid list-none grid-cols-3 gap-2 p-0">
            {[1, 2, 3, 4, 5].map((slot) => {
              const p = props.others[slot - 1];
              const optional = slot >= 4;
              return (
                <li key={slot} className="min-w-0">
                  {p ? (
                    <button
                      type="button"
                      onClick={() => setSheet(slot)}
                      aria-label={`Photo ${slot + 1}. Tap to replace or remove.`}
                      className="relative block aspect-[4/5] w-full overflow-hidden rounded-lg bg-grey-200"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from a private bucket */}
                      <img src={p.url} alt="" className="block h-full w-full object-cover" />
                      <SlotNumber n={slot + 1} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy || count >= MAX}
                      onClick={() => choose(slot)}
                      aria-label={`Add photo ${slot + 1}${optional ? ", optional" : ""}`}
                      className={cn(
                        "grid aspect-[4/5] w-full place-items-center content-center gap-0.5 rounded-lg border-[1.5px] border-dashed transition-colors hover:border-green-500 disabled:cursor-not-allowed disabled:opacity-60",
                        optional ? "border-ink-900/[.22] bg-transparent text-grey-600" : "border-green-500/50 bg-white text-green-500",
                      )}
                    >
                      <span aria-hidden="true" className="text-[22px] leading-none">+</span>
                      <span className="text-[13px] font-semibold">Add</span>
                      {optional ? <span className="text-chip text-grey-600">Optional</span> : null}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mx-0.5 text-[13px] leading-[1.55] text-grey-600">Tap a photo to replace or remove it.</p>
        </div>

        <p className="mx-0.5 text-[13px] leading-[1.6] text-grey-600">
          Only upload photos of yourself, as you are. No filters that change your face, and no AI-generated photos.
        </p>

        <label
          className={cn(
            "relative flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-[13px] py-3.5",
            onlyMatches ? "border-green-500 bg-green-50" : "border-ink-900/20 bg-white",
          )}
        >
          <input type="checkbox" checked={onlyMatches} onChange={toggleOnly} className="peer sr-only" />
          <Tick on={onlyMatches} />
          <span className="text-[14.5px] leading-[1.55] text-ink-900">Show my photos only to people I match with</span>
        </label>

        {notice}

        <div className="grid gap-2.5">
          <div role="status" className="flex items-baseline justify-between gap-3 px-0.5">
            <span className="text-nav font-semibold text-ink-900">{count < MIN ? `${count} of ${MIN}` : `${count} of ${MAX}`}</span>
            <span className="text-right text-[13px] text-grey-600">{counterNote}</span>
          </div>
          {ready ? (
            <Link
              // Onboarding continues to the one selfie; editing goes back.
              href={!props.verifiedReal ? "/verify" : "/profile"}
              className="grid min-h-12 place-items-center rounded-lg bg-green-500 px-5 py-3.5 text-button text-white no-underline hover:bg-green-600"
            >
              {edit ? "Save changes" : "Continue"}
            </Link>
          ) : (
            <button type="button" disabled aria-disabled="true" className="min-h-12 cursor-not-allowed rounded-lg bg-grey-200 px-5 py-3.5 text-button text-grey-600">
              {edit ? "Save changes" : "Continue"}
            </button>
          )}
        </div>

        {sheet !== null ? (
          <PhotoSheet
            isMain={sheet === 0}
            title={sheet === 0 ? "Main photo" : `Photo ${sheet + 1}`}
            onReplace={() => choose(sheet)}
            onRemove={sheet === 0 ? undefined : () => remove(sheet)}
            onCancel={() => setSheet(null)}
          />
        ) : null}
      </AppColumn>
    </>
  );
}

function SlotNumber({ n }: { n: number }) {
  return (
    <span className="absolute left-1.5 top-1.5 grid h-[22px] min-w-[22px] place-items-center rounded-pill bg-green-800/[.82] px-1.5 text-chip font-semibold text-white">
      {n}
    </span>
  );
}

function Tick({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-px grid h-6 w-6 flex-shrink-0 place-items-center rounded-sm border-[1.5px] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-green-500",
        on ? "border-green-500 bg-green-500" : "border-grey-400 bg-white",
      )}
    >
      {on ? (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="m3.5 8.4 3 3 6-6.6" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </span>
  );
}

function StatusLine({ icon, title, sub, role }: { icon?: React.ReactNode; title: string; sub?: string; role?: string }) {
  return (
    <div role={role} className="flex items-center gap-2.5">
      {icon}
      <span className="grid min-w-0 gap-px">
        <span className="text-nav font-semibold text-ink-900">{title}</span>
        {sub ? <span className="text-[13px] leading-[1.4] text-grey-600">{sub}</span> : null}
      </span>
    </div>
  );
}

/** The seal on a deep-green disc, as the prototypes draw it beside a photo. */
function Seal({ size }: { size: number }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size }} className="grid flex-shrink-0 place-items-center rounded-pill bg-green-800">
      <VerifiedSeal size={Math.round(size * 0.66)} className="text-gold-500" />
    </span>
  );
}

/** The Stake's ring geometry: radius 9.5, stroke 3, a 24-unit box. */
function Ring({ track, arc, dash, size = 36 }: { track: string; arc: string; dash: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="12 12 24 24" fill="none" aria-hidden="true" className="flex-shrink-0">
      <circle cx="24" cy="24" r="9.5" strokeWidth="3" className={track} />
      <circle cx="24" cy="24" r="9.5" strokeWidth="3" strokeDasharray={dash} strokeLinecap="round" transform="rotate(-90 24 24)" className={arc} />
    </svg>
  );
}

function PhotoSheet(props: { isMain: boolean; title: string; onReplace: () => void; onRemove?: () => void; onCancel: () => void }) {
  const first = React.useRef<HTMLButtonElement>(null);
  const { onCancel } = props;
  React.useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const option =
    "min-h-12 w-full rounded-lg border border-ink-900/20 bg-transparent p-3 text-button text-ink-900 transition-colors hover:border-green-500 hover:bg-green-50";

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-green-800/55" onClick={props.onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-sheet-title"
        onClick={(e) => e.stopPropagation()}
        className="mx-auto grid w-full max-w-[560px] gap-3 rounded-t-[20px] bg-white px-4 pb-5 pt-2.5"
      >
        <span aria-hidden="true" className="h-1 w-9 justify-self-center rounded-pill bg-grey-200" />
        <h2 id="photo-sheet-title" className="mt-1 font-serif text-[21px] font-bold leading-[1.25] text-ink-900">
          {props.title}
        </h2>
        {props.isMain ? (
          <p className="text-[14.5px] leading-[1.6] text-ink-800">A new main photo is checked against your selfie again.</p>
        ) : null}
        <div className="mt-1 grid gap-2.5">
          <button ref={first} type="button" onClick={props.onReplace} className={option}>
            {props.isMain ? "Choose another photo" : "Replace photo"}
          </button>
          {props.onRemove ? (
            <button type="button" onClick={props.onRemove} className={option}>
              Remove photo
            </button>
          ) : null}
          <button type="button" onClick={props.onCancel} className="min-h-12 rounded-lg p-3 text-button text-green-500">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

const primaryBtn =
  "min-h-12 w-full rounded-lg bg-green-500 px-5 py-3.5 text-button text-white hover:bg-green-600 disabled:opacity-60";
const secondaryBtn =
  "min-h-12 w-full rounded-lg border border-ink-900/20 bg-transparent px-5 py-3.5 text-button text-ink-900 hover:border-green-500 hover:bg-green-50 disabled:opacity-60";

const CHECK_COPY: Record<"face" | "selfie" | "review", { status: string; sub: string; title: string; paras: string[]; tips?: string[] }> = {
  face: {
    status: "Not confirmed yet",
    sub: "Face not clear",
    title: "We couldn't confirm it's you",
    paras: ["Your face isn't clear enough in this photo for us to compare it with your selfie."],
    tips: ["Just you in the photo, facing the camera", "Your whole face in view, without sunglasses", "Good light, and no filters that change your face"],
  },
  selfie: {
    status: "Not confirmed yet",
    sub: "Doesn't look like your selfie",
    title: "We couldn't confirm it's you",
    paras: [
      "This photo doesn't look enough like your Verified Real selfie for us to be sure it's you. An older photo, a very different angle or strong light can cause this.",
    ],
    tips: ["Use a recent photo", "Face the camera, the way you did for your selfie"],
  },
  review: {
    status: "With our team",
    sub: "You don't need to do anything",
    title: "Your photo is being reviewed",
    paras: ["A person on our team is taking a look.", "You can keep setting up your profile. We'll show the result here."],
  },
};

/** photos-main-check.slim.html — a first main photo that wasn't confirmed. */
function MainCheck(props: {
  photo: EditorPhoto;
  state: Exclude<CandidateState, null>;
  busy: boolean;
  onChooseAnother: () => void;
  onUseAsOther: () => void;
  onAskPerson: () => void;
  onKeepGoing: () => void;
}) {
  if (props.state !== "face" && props.state !== "selfie" && props.state !== "review") return null;
  const o = CHECK_COPY[props.state];
  const withPerson = props.state === "review";

  return (
    <div role="status" className="grid gap-5">
      <div className="flex items-center gap-3.5 rounded-xl border border-ink-900/[.12] bg-white p-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from a private bucket */}
        <img src={props.photo.url} alt="Your chosen photo" className="block aspect-[4/5] w-24 flex-shrink-0 rounded-md bg-grey-200 object-cover" />
        <div className="grid min-w-0 gap-2.5">
          {withPerson ? (
            <Ring track="stroke-gold-100" arc="stroke-gold-600" dash="40 60" size={40} />
          ) : (
            <Ring track="stroke-green-100" arc="stroke-green-500" dash="46 60" size={40} />
          )}
          <span className="grid gap-0.5">
            <span className="text-ui font-semibold text-ink-900">{o.status}</span>
            <span className="text-[13px] leading-[1.45] text-grey-600">{o.sub}</span>
          </span>
        </div>
      </div>

      <div className="grid gap-2.5 px-0.5">
        <h2 className="font-serif text-[24px] font-bold leading-[1.2] text-ink-900">{o.title}</h2>
        {o.paras.map((p) => (
          <p key={p} className="text-ui leading-[1.6] text-ink-800">
            {p}
          </p>
        ))}
      </div>

      {o.tips ? (
        <div className="grid gap-2.5 rounded-xl border border-ink-900/[.12] bg-white px-[15px] py-4">
          <h3 className="text-chip font-semibold uppercase tracking-[0.12em] text-green-500">What works best</h3>
          <ul className="grid list-none gap-2 p-0">
            {o.tips.map((t) => (
              <li key={t} className="flex items-baseline gap-2.5 text-[14.5px] leading-[1.55] text-ink-800">
                <span aria-hidden="true" className="h-1.5 w-1.5 flex-shrink-0 -translate-y-0.5 rounded-pill bg-green-500" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-2.5">
        {!withPerson ? (
          <button type="button" disabled={props.busy} onClick={props.onChooseAnother} className={primaryBtn}>
            Choose another photo
          </button>
        ) : null}
        {props.state === "face" ? (
          <button type="button" disabled={props.busy} onClick={props.onUseAsOther} className={secondaryBtn}>
            Use it as another photo
          </button>
        ) : null}
        {props.state === "selfie" ? (
          <button type="button" disabled={props.busy} onClick={props.onAskPerson} className={secondaryBtn}>
            Ask a person to look
          </button>
        ) : null}
        {withPerson ? (
          <button type="button" onClick={props.onKeepGoing} className={secondaryBtn}>
            Keep setting up
          </button>
        ) : null}
        {props.state === "face" ? (
          <p className="text-[13px] leading-[1.55] text-grey-600">
            Your other photos don&rsquo;t need to show your face, so this one can go there.
          </p>
        ) : null}
      </div>
    </div>
  );
}

type ReplaceState = CandidateState | "confirmed";

/**
 * photo-replace-main.slim.html — replacing a matched main photo with a fresh
 * selfie. Consent is Toastly-Verification-Consent-Wording.md §2, recorded
 * with its version by checkMainPhoto(). The current photo stays up, and the
 * new one stays private ("Only you can see this"), until it's confirmed.
 */
function ReplaceMain(props: {
  current: EditorPhoto | null;
  candidate: EditorPhoto | null;
  state: ReplaceState;
  busy: boolean;
  checksConnected: boolean;
  devStandIn: boolean;
  onSubmit: (form: FormData) => void;
  onKeep: () => void;
  onTryAnother: () => void;
  onDone: () => void;
}) {
  const s = props.state;
  const failed = s === "face" || s === "selfie";

  if (s === "confirmed") {
    const shown = props.candidate ?? props.current;
    return (
      <div role="status" className="grid gap-5">
        {shown ? (
          <div className="flex items-center gap-3.5 rounded-xl border border-ink-900/[.12] bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from a private bucket */}
            <img src={shown.url} alt="Your new main photo" className="block aspect-[4/5] w-24 flex-shrink-0 rounded-md bg-grey-200 object-cover" />
            <div className="grid min-w-0 gap-2.5">
              <Seal size={40} />
              <span className="grid gap-0.5">
                <span className="text-ui font-semibold text-ink-900">Verified Real</span>
                <span className="text-[13px] leading-[1.45] text-grey-600">Your main photo</span>
              </span>
            </div>
          </div>
        ) : null}
        <div className="grid gap-2.5 px-0.5">
          <h2 className="font-serif text-[24px] font-bold leading-[1.2] text-ink-900">Your new main photo is up</h2>
          <p className="text-ui leading-[1.6] text-ink-800">
            The Verified Real seal shows beside it, so people know your photos are really you.
          </p>
        </div>
        <button type="button" onClick={props.onDone} className={primaryBtn}>
          Done
        </button>
      </div>
    );
  }

  const newTile =
    s === "checking"
      ? { ring: <Ring track="stroke-gold-100" arc="stroke-gold-600" dash="24 60" size={28} />, status: "Checking — only you can see this" }
      : s === "review"
        ? { ring: <Ring track="stroke-gold-100" arc="stroke-gold-600" dash="40 60" size={28} />, status: "With our team", sub: "Only you can see this" }
        : failed
          ? { ring: <Ring track="stroke-green-100" arc="stroke-green-500" dash="46 60" size={28} />, status: "Not confirmed", sub: "Only you can see this", dim: true }
          : { status: "Not checked yet", sub: "Only you can see this" };

  return (
    <div role="status" className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-ink-900/[.12] bg-white p-3">
        <PairTile
          photo={props.current}
          label="Current"
          icon={props.current ? <Seal size={28} /> : null}
          status={props.current ? "Live on your profile" : "No main photo yet"}
        />
        <PairTile photo={props.candidate} label="New" icon={newTile.ring} status={newTile.status} sub={newTile.sub} dim={newTile.dim} />
      </div>

      {s === "waiting" || s === null ? (
        !props.checksConnected && !props.devStandIn ? (
          <Notice tone="info" title="Photo checks aren't connected yet">
            Smile ID isn&rsquo;t connected in this environment, so your new main photo can&rsquo;t be checked yet. Your
            current photo stays up.
          </Notice>
        ) : props.checksConnected ? (
          <Notice tone="info" title="The selfie camera isn't wired up yet">
            Smile ID is connected, but its in-browser capture isn&rsquo;t built into this screen yet. Your current
            photo stays up.
          </Notice>
        ) : (
          <form action={props.onSubmit} className="grid gap-4">
            <input type="hidden" name="photo_id" value={props.candidate?.id ?? ""} />
            <Notice tone="info" title="Development stand-in">
              Smile ID isn&rsquo;t connected here, so Start records a match without a camera.
            </Notice>
            <ConsentPanel kind="replace_main_photo" busy={props.busy} onSecondary={props.onKeep} />
          </form>
        )
      ) : (
        <div className="grid gap-5">
          <div className="grid gap-2.5 px-0.5">
            <h2 className="font-serif text-[24px] font-bold leading-[1.2] text-ink-900">
              {s === "checking"
                ? "We're checking your new photo"
                : s === "review"
                  ? "Your photo is being reviewed"
                  : "We couldn't confirm this photo is you."}
            </h2>
            <p className="text-ui leading-[1.6] text-ink-800">
              {s === "checking"
                ? "This usually takes a minute. You can leave this page — we'll show the result here."
                : s === "review"
                  ? "A person on our team is taking a look. Your current photo stays up meanwhile."
                  : "Your current photo is still up."}
            </p>
          </div>
          {failed ? (
            <button type="button" disabled={props.busy} onClick={props.onTryAnother} className={primaryBtn}>
              Try another photo
            </button>
          ) : (
            <button type="button" onClick={props.onDone} className={secondaryBtn}>
              Back to your photos
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PairTile(props: {
  photo: EditorPhoto | null;
  label: string;
  icon?: React.ReactNode;
  status: string;
  sub?: string;
  dim?: boolean;
}) {
  return (
    <div className="grid min-w-0 content-start gap-2">
      {props.photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from a private bucket
        <img
          src={props.photo.url}
          alt={props.label === "Current" ? "Your current main photo" : "Your new photo"}
          className={cn("block aspect-[4/5] w-full rounded-md bg-grey-200 object-cover", props.dim && "opacity-[.72]")}
        />
      ) : (
        <div aria-hidden="true" className="aspect-[4/5] w-full rounded-md bg-grey-200" />
      )}
      <p className="text-chip font-semibold uppercase tracking-[0.1em] text-green-500">{props.label}</p>
      <div className="flex min-w-0 items-start gap-2">
        {props.icon}
        <span className="grid min-w-0 gap-px pt-1">
          <span className="text-[13.5px] font-semibold leading-[1.4] text-ink-900">{props.status}</span>
          {props.sub ? <span className="text-[13px] leading-[1.4] text-grey-600">{props.sub}</span> : null}
        </span>
      </div>
    </div>
  );
}

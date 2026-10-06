"use client";

import * as React from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { startOnboardingSelfie } from "./selfie-actions";
import { Notice } from "@/components/ui/notice";
import { ConsentPanel } from "@/components/app/consent-panel";
import { SelfieCapture } from "@/components/app/selfie-capture";
import { SelfieDetailsFields, type SandboxIdentity } from "@/components/app/selfie-details-fields";

/**
 * The onboarding selfie — after phone, where you live and photos (decided
 * 5 October 2026). One selfie: liveness for Verified Real AND the main-photo
 * match. The consent is Toastly-Verification-Consent-Wording.md §1, with its
 * bracketed retention line left visible until Smile ID confirms it. Ported
 * from live-profile-and-prompt-14.
 *
 * With Smile ID connected, Start opens its camera; the capture joins the
 * consent form and goes to startSelfieCheck(), which records the consent
 * first. In development without Smile ID, Start records a stand-in pass.
 *
 * Shown inside main's verify-overview flow in place of its hosted "Get
 * verified" button; the hosted selfie stays for re-verification only.
 */

const TEAL =
  "grid min-h-12 w-full place-items-center rounded-lg bg-green-500 px-5 py-3.5 text-button text-white no-underline transition-colors hover:bg-green-600";

function Panel({ devStandIn, sandbox }: { devStandIn: boolean; sandbox: SandboxIdentity[] }) {
  const { pending } = useFormStatus();
  return (
    <>
      {devStandIn ? (
        <Notice tone="info" title="Development stand-in">
          Smile ID isn&rsquo;t connected here, so Start records a pass without a camera.
        </Notice>
      ) : null}
      <ConsentPanel kind="verification_selfie" busy={pending} secondaryHref="/profile/photos">
        {devStandIn ? null : <SelfieDetailsFields sandbox={sandbox} />}
      </ConsentPanel>
    </>
  );
}

export function SelfieCheckStep({
  connected,
  devStandIn,
  photosReady,
  sandbox = [],
}: {
  connected: boolean;
  devStandIn: boolean;
  /** Four photos, including a chosen main photo. */
  photosReady: boolean;
  /** Smile ID sandbox identities, only where the server allows them. */
  sandbox?: SandboxIdentity[];
}) {
  const [state, action] = useFormState(startOnboardingSelfie, null);
  const [pending, startTransition] = React.useTransition();
  const [consented, setConsented] = React.useState<FormData | null>(null);

  // Photos come first. NOT IN A PROTOTYPE as its own card — flagged: the
  // where-you-live stepper and verify-overview name the step; this links to it.
  if (!photosReady) {
    return (
      <div className="grid gap-3 rounded-xl border border-ink-900/[.12] bg-white px-[15px] py-4">
        <div className="grid gap-1.5">
          <h3 className="m-0 text-chip font-semibold uppercase tracking-[0.12em] text-green-500">Next · Your photos</h3>
          <p className="m-0 text-ui leading-[1.6] text-ink-800">
            Add at least four photos and choose your main photo. Your selfie then confirms you&rsquo;re a real person and that
            your main photo is you.
          </p>
        </div>
        <Link href="/profile/photos" className={TEAL}>
          Add your photos
        </Link>
      </div>
    );
  }

  if (state?.ok === "Checking." || pending) {
    return (
      <div role="status" className="grid gap-2 rounded-xl border border-ink-900/[.12] bg-white px-[15px] py-4">
        <h3 className="m-0 font-serif text-[21px] font-bold text-ink-900">We&rsquo;re checking your selfie</h3>
        <p className="m-0 text-ui leading-[1.6] text-grey-600">
          This usually takes a minute — you can leave this page and we&rsquo;ll show the result here next time.
        </p>
      </div>
    );
  }

  if (!connected && !devStandIn) {
    return (
      <Notice tone="info" title="Selfie checks aren't connected yet">
        Smile ID isn&rsquo;t connected in this environment, so this step can&rsquo;t be completed yet.
      </Notice>
    );
  }

  if (connected && consented) {
    return (
      <SelfieCapture
        onCaptured={({ selfie, liveness }) => {
          const form = consented;
          form.append("selfie", selfie);
          liveness.forEach((f) => form.append("liveness", f));
          setConsented(null);
          startTransition(() => action(form));
        }}
        onCancel={() => setConsented(null)}
      />
    );
  }

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!connected) return; // development: the stand-in posts as is
        e.preventDefault();
        setConsented(new FormData(e.currentTarget));
      }}
      className="grid gap-4"
    >
      <Panel devStandIn={!connected && devStandIn} sandbox={sandbox} />
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
    </form>
  );
}

"use client";

import { useFormState, useFormStatus } from "react-dom";
import { startSelfieCheck } from "./actions";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { ConsentPanel } from "@/components/app/consent-panel";

/**
 * The onboarding selfie — step 3, after phone and photos (decided
 * 2026-10-05). One selfie: liveness for Verified Real AND the main-photo
 * match. The consent is Toastly-Verification-Consent-Wording.md §1, with its
 * bracketed retention line left visible until Smile ID confirms it.
 *
 * The capture itself is Smile ID's in-browser camera, which isn't wired yet:
 * in development a stand-in records a pass, and anywhere else the step says
 * plainly that it can't run.
 */
function Panel({ devStandIn }: { devStandIn: boolean }) {
  const { pending } = useFormStatus();
  return (
    <>
      {devStandIn ? (
        <Notice tone="info" title="Development stand-in">
          Smile ID isn&rsquo;t connected here, so Start records a pass without a
          camera.
        </Notice>
      ) : null}
      <ConsentPanel kind="verification_selfie" busy={pending} secondaryHref="/photos" />
    </>
  );
}

export function SelfieCheckStep({
  connected,
  devStandIn,
}: {
  connected: boolean;
  devStandIn: boolean;
}) {
  const [state, action] = useFormState(startSelfieCheck, null);

  if (state?.ok === "Checking.") {
    return (
      <Card role="status" className="grid gap-2 p-[26px]">
        <h2 className="text-h5 text-ink-900">We&rsquo;re checking your selfie</h2>
        <p className="text-ui text-grey-600">
          This usually takes a minute — you can leave this page and we&rsquo;ll
          show the result here next time.
        </p>
      </Card>
    );
  }

  return (
    <Card className="grid gap-5 p-[26px]">
      {!connected && !devStandIn ? (
        <Notice tone="info" title="Selfie checks aren't connected yet">
          Smile ID isn&rsquo;t connected in this environment, so this step
          can&rsquo;t be completed yet.
        </Notice>
      ) : connected ? (
        <Notice tone="info" title="The selfie camera isn't wired up yet">
          Smile ID is connected, but its in-browser capture isn&rsquo;t built
          into this screen yet, so the check can&rsquo;t start.
        </Notice>
      ) : (
        <form action={action} className="grid gap-4">
          <Panel devStandIn={devStandIn} />
          {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
        </form>
      )}
    </Card>
  );
}

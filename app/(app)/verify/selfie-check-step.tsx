"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { startSelfieCheck } from "./actions";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { ConsentPanel } from "@/components/app/consent-panel";
import { SelfieCapture } from "@/components/app/selfie-capture";

/**
 * The onboarding selfie — step 3, after phone and photos (decided
 * 2026-10-05). One selfie: liveness for Verified Real AND the main-photo
 * match. The consent is Toastly-Verification-Consent-Wording.md §1, with its
 * bracketed retention line left visible until Smile ID confirms it.
 *
 * With Smile ID connected, Start opens its camera; the capture joins the
 * consent form and goes to startSelfieCheck(), which records the consent
 * first. In development without Smile ID, Start records a stand-in pass.
 */
function Panel({ devStandIn }: { devStandIn: boolean }) {
  const { pending } = useFormStatus();
  return (
    <>
      {devStandIn ? (
        <Notice tone="info" title="Development stand-in">
          Smile ID isn&rsquo;t connected here, so Start records a pass without a camera.
        </Notice>
      ) : null}
      <ConsentPanel kind="verification_selfie" busy={pending} secondaryHref="/photos" />
    </>
  );
}

export function SelfieCheckStep({ connected, devStandIn }: { connected: boolean; devStandIn: boolean }) {
  const [state, action] = useFormState(startSelfieCheck, null);
  const [pending, startTransition] = React.useTransition();
  const [consented, setConsented] = React.useState<FormData | null>(null);

  if (state?.ok === "Checking." || pending) {
    return (
      <Card role="status" className="grid gap-2 p-[26px]">
        <h2 className="text-h5 text-ink-900">We&rsquo;re checking your selfie</h2>
        <p className="text-ui text-grey-600">
          This usually takes a minute — you can leave this page and we&rsquo;ll show the result here next time.
        </p>
      </Card>
    );
  }

  if (!connected && !devStandIn) {
    return (
      <Card className="grid gap-5 p-[26px]">
        <Notice tone="info" title="Selfie checks aren't connected yet">
          Smile ID isn&rsquo;t connected in this environment, so this step can&rsquo;t be completed yet.
        </Notice>
      </Card>
    );
  }

  // Consent given: the camera, then the check.
  if (connected && consented) {
    return (
      <Card className="grid gap-4 p-[26px]">
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
      </Card>
    );
  }

  return (
    <Card className="grid gap-5 p-[26px]">
      <form
        action={action}
        onSubmit={(e) => {
          if (!connected) return; // development: the stand-in posts as is
          e.preventDefault();
          setConsented(new FormData(e.currentTarget));
        }}
        className="grid gap-4"
      >
        <Panel devStandIn={!connected && devStandIn} />
        {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      </form>
    </Card>
  );
}

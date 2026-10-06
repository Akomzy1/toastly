"use client";

import * as React from "react";
import { Notice } from "@/components/ui/notice";

/**
 * Smile ID's in-browser selfie and liveness capture (`<smart-camera-web>`
 * from @smileid/web-sdk).
 *
 * The SDK is loaded only when this mounts — it is large, and every other
 * screen is on metered mobile data (PRD §5.8). The camera needs a secure
 * context (HTTPS or localhost).
 *
 * On capture, Smile ID publishes base64 images: image_type_id 2 is the
 * selfie and 6 the liveness frames. They are turned into JPEG files and
 * handed straight to the caller's form, which posts them to a server action
 * that passes them to Smile ID. Nothing here keeps them: no state outlives
 * the hand-off, and nothing is written to storage, the database or the
 * browser.
 */

const SELFIE = 2;
const LIVENESS = 6;

type Published = { images?: { image: string; image_type_id: number }[] };

function toJpeg(base64: string, name: string): File {
  const data = base64.replace(/^data:image\/\w+;base64,/, "");
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  return new File([bytes], name, { type: "image/jpeg" });
}

export function SelfieCapture({
  onCaptured,
  onCancel,
}: {
  onCaptured: (capture: { selfie: File; liveness: File[] }) => void;
  onCancel: () => void;
}) {
  const host = React.useRef<HTMLDivElement>(null);
  const [state, setState] = React.useState<"loading" | "ready" | "error">("loading");
  const done = React.useRef(onCaptured);
  const cancel = React.useRef(onCancel);
  done.current = onCaptured;
  cancel.current = onCancel;

  React.useEffect(() => {
    let el: HTMLElement | null = null;
    let alive = true;

    const onPublish = (e: Event) => {
      const images = (e as CustomEvent<Published>).detail?.images ?? [];
      const selfie = images.find((i) => i.image_type_id === SELFIE);
      const liveness = images.filter((i) => i.image_type_id === LIVENESS);
      if (!selfie) return setState("error");
      done.current({
        selfie: toJpeg(selfie.image, "selfie.jpg"),
        liveness: liveness.map((l, n) => toJpeg(l.image, `liveness-${n}.jpg`)),
      });
    };
    const onClose = () => cancel.current();

    (async () => {
      try {
        if (!window.isSecureContext) throw new Error("insecure");
        await import("@smileid/web-sdk/smart-camera-web");
        if (!alive || !host.current) return;
        el = document.createElement("smart-camera-web");
        el.setAttribute("theme-color", "#00695C");
        el.setAttribute("hide-attribution", "");
        el.addEventListener("smart-camera-web.publish", onPublish);
        el.addEventListener("smart-camera-web.cancelled", onClose);
        el.addEventListener("smart-camera-web.close", onClose);
        host.current.appendChild(el);
        setState("ready");
      } catch {
        if (alive) setState("error");
      }
    })();

    return () => {
      alive = false;
      if (el) {
        el.removeEventListener("smart-camera-web.publish", onPublish);
        el.removeEventListener("smart-camera-web.cancelled", onClose);
        el.removeEventListener("smart-camera-web.close", onClose);
        el.remove();
      }
    };
  }, []);

  return (
    <div className="grid gap-3">
      {state === "loading" ? (
        <p role="status" className="text-nav text-grey-600">
          Opening your camera…
        </p>
      ) : null}
      {state === "error" ? (
        <Notice tone="error" title="The camera couldn't start">
          Check that Toastly can use your camera, then try again.
        </Notice>
      ) : null}
      <div ref={host} />
      <button
        type="button"
        onClick={() => cancel.current()}
        className="min-h-12 w-full rounded-lg border border-ink-900/20 bg-transparent px-5 py-3.5 text-button text-ink-900 hover:border-green-500 hover:bg-green-50"
      >
        Not now
      </button>
    </div>
  );
}

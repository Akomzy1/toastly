"use client";

import * as React from "react";
import { Notice } from "@/components/ui/notice";

/**
 * "Get a copy" → "Your download is ready." → "Download" (your-data.slim.html).
 *
 * The file is built on demand by /account/export and held in the browser
 * only; nothing is emailed or stored anywhere else.
 */
export function DownloadCard() {
  const [state, setState] = React.useState<"idle" | "busy" | "ready" | "error">("idle");
  const [file, setFile] = React.useState<{ url: string; name: string } | null>(null);

  React.useEffect(() => () => {
    if (file) URL.revokeObjectURL(file.url);
  }, [file]);

  async function getCopy() {
    setState("busy");
    try {
      const res = await fetch("/account/export", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const name =
        /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "toastly-data.json";
      setFile({ url: URL.createObjectURL(blob), name });
      setState("ready");
    } catch {
      setState("error");
    }
  }

  const button = "grid min-h-12 w-full place-items-center rounded-lg bg-green-500 px-5 py-3.5 text-button text-white no-underline hover:bg-green-600 disabled:opacity-60";

  return (
    <div className="grid gap-3.5 rounded-xl border border-ink-900/[.12] bg-white px-[15px] py-4">
      <p className="text-ui leading-[1.6] text-ink-800">Get a copy of everything you&rsquo;ve shared with Toastly.</p>

      {state === "ready" ? (
        <div role="status" className="flex items-center gap-2.5 rounded-lg border border-green-500/[.24] bg-green-50 px-[13px] py-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="flex-shrink-0">
            <path d="M5 13l4 4 10-11" stroke="#00695C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[14.5px] font-semibold leading-[1.5] text-green-550">Your download is ready.</span>
        </div>
      ) : null}
      {state === "error" ? <Notice tone="error">Your copy couldn&rsquo;t be prepared. Try again.</Notice> : null}

      {state === "ready" && file ? (
        <a href={file.url} download={file.name} className={button}>
          Download
        </a>
      ) : (
        <button type="button" onClick={getCopy} disabled={state === "busy"} className={button}>
          {state === "busy" ? "Preparing…" : "Get a copy"}
        </button>
      )}

      <p className="text-[13px] leading-[1.55] text-grey-600">
        Some safety records may be left out where the law allows — for example, where sharing them would help someone
        get around our protections.
      </p>
    </div>
  );
}

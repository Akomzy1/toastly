"use client";

import * as React from "react";

/**
 * Tells the server this member is here, once a minute while the tab is
 * visible. Data-light: an empty POST, nothing sent back.
 */
export function PresenceHeartbeat() {
  React.useEffect(() => {
    const beat = () => {
      if (document.visibilityState === "visible") void fetch("/api/presence", { method: "POST" }).catch(() => undefined);
    };
    beat();
    const t = window.setInterval(beat, 60_000);
    document.addEventListener("visibilitychange", beat);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", beat);
    };
  }, []);
  return null;
}

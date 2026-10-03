"use client";

import * as React from "react";
import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";

/**
 * Transport harness (AUDIT_HARNESS only): joins a LiveKit room with a token
 * from the query string, publishes the microphone, and reports what it can
 * hear and what it was refused — so the voice path can be tested end to end
 * with two headless browsers and fake microphones.
 */
export default function AuditLiveKit() {
  const [log, setLog] = React.useState<string[]>([]);
  const add = (line: string) => setLog((l) => [...l, line]);

  React.useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const url = q.get("url");
    const token = q.get("token");
    if (!url || !token) return add("missing url or token");
    const room = new Room({ adaptiveStream: true, dynacast: true });
    room
      .on(RoomEvent.TrackSubscribed, (t: RemoteTrack) => {
        if (t.kind === Track.Kind.Audio) {
          document.body.appendChild(t.attach());
          add("heard: audio");
        } else add(`heard: ${t.kind}`);
      })
      .on(RoomEvent.Disconnected, () => add("disconnected"));
    (async () => {
      try {
        await room.connect(url, token);
        add("connected");
        await room.localParticipant.setMicrophoneEnabled(true);
        add("mic: published");
        try {
          await room.localParticipant.setCameraEnabled(true);
          add("camera: published");
        } catch {
          add("camera: refused");
        }
      } catch (e) {
        add(`error: ${(e as Error).message}`);
      }
    })();
    return () => void room.disconnect();
  }, []);

  return (
    <ul id="log">
      {log.map((l, i) => (
        <li key={i}>{l}</li>
      ))}
    </ul>
  );
}

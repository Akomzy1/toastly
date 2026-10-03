"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type Participant,
} from "livekit-client";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

/**
 * The Gist call — voice only (Phase 1). Live video is Phase 2 (P2-D): the
 * token withholds camera rights and nothing here asks for a camera.
 *
 * NOT IN THE PROTOTYPE — flagged. No Gist room was designed; this is built
 * from the session page's own cards and buttons.
 *
 * The clock is the server's (0019). This component only displays it, and
 * when it runs out it asks the server to close the room for both people.
 * Nothing is recorded: no audio leaves the two browsers except through
 * LiveKit's relay, and no transcript exists anywhere.
 */

type Clock = {
  ends_at: string | null;
  extended: boolean;
  you_asked_to_extend: boolean;
  they_asked_to_extend: boolean;
  finished: boolean;
};

type Phase = "idle" | "connecting" | "in_call" | "reconnecting" | "ended" | "left";

const WARN_SECONDS = 120;

function mmss(total: number) {
  const s = Math.max(0, total);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function GistCall({ sessionId, otherName }: { sessionId: string; otherName: string }) {
  const router = useRouter();
  const roomRef = React.useRef<Room | null>(null);
  const audioRef = React.useRef<HTMLDivElement>(null);
  const finishingRef = React.useRef(false);

  const [phase, setPhase] = React.useState<Phase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [clock, setClock] = React.useState<Clock | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  const [theyHere, setTheyHere] = React.useState(false);
  const [muted, setMuted] = React.useState(false);
  const [speaking, setSpeaking] = React.useState<{ you: boolean; them: boolean }>({ you: false, them: false });
  const [needsTap, setNeedsTap] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const secondsLeft = clock?.ends_at ? Math.ceil((Date.parse(clock.ends_at) - now) / 1000) : null;

  const refreshClock = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/gist/${sessionId}/state`, { cache: "no-store" });
      const json = (await res.json()) as { clock?: Clock };
      if (json.clock) setClock(json.clock);
    } catch {}
  }, [sessionId]);

  const tellOther = React.useCallback(async () => {
    try {
      await roomRef.current?.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ t: "clock" })), {
        reliable: true,
      });
    } catch {}
  }, []);

  const finish = React.useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    try {
      await fetch(`/api/gist/${sessionId}/finish`, { method: "POST" });
    } catch {}
    await roomRef.current?.disconnect();
    setPhase("ended");
    router.refresh();
  }, [router, sessionId]);

  // Tick while in a call; ask the server to close the room when time is up.
  React.useEffect(() => {
    if (phase !== "in_call" && phase !== "reconnecting") return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    const poll = window.setInterval(refreshClock, 20_000);
    return () => {
      window.clearInterval(t);
      window.clearInterval(poll);
    };
  }, [phase, refreshClock]);

  React.useEffect(() => {
    if (secondsLeft !== null && secondsLeft <= 0 && (phase === "in_call" || phase === "reconnecting")) {
      void finish();
    }
  }, [secondsLeft, phase, finish]);

  // Leave the room if the member navigates away.
  React.useEffect(() => () => void roomRef.current?.disconnect(), []);

  async function join() {
    setError(null);
    setPhase("connecting");
    let url: string, token: string;
    try {
      const res = await fetch(`/api/gist/${sessionId}/join`, { method: "POST" });
      const json = (await res.json()) as { url?: string; token?: string; clock?: Clock; error?: string };
      if (!res.ok || !json.url || !json.token) {
        setError(json.error ?? "You can't join right now. Please try again.");
        setPhase("idle");
        return;
      }
      url = json.url;
      token = json.token;
      if (json.clock) setClock(json.clock);
    } catch {
      setError("You seem to be offline. Check your connection and try again.");
      setPhase("idle");
      return;
    }

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    roomRef.current = room;

    const sync = () => setTheyHere(room.remoteParticipants.size > 0);
    room
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind !== Track.Kind.Audio) return;
        const el = track.attach();
        audioRef.current?.appendChild(el);
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach().forEach((el) => el.remove());
      })
      .on(RoomEvent.ParticipantConnected, sync)
      .on(RoomEvent.ParticipantDisconnected, sync)
      .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        setSpeaking({
          you: speakers.some((p) => p.identity === room.localParticipant.identity),
          them: speakers.some((p) => p.identity !== room.localParticipant.identity),
        });
      })
      .on(RoomEvent.DataReceived, () => void refreshClock())
      .on(RoomEvent.AudioPlaybackStatusChanged, () => setNeedsTap(!room.canPlaybackAudio))
      .on(RoomEvent.Reconnecting, () => setPhase("reconnecting"))
      .on(RoomEvent.Reconnected, () => setPhase("in_call"))
      .on(RoomEvent.Disconnected, () => {
        setTheyHere(false);
        setPhase((p) => (p === "ended" || p === "left" ? p : "left"));
      });

    try {
      await room.connect(url, token);
      sync();
      await room.startAudio().catch(() => undefined);
      setNeedsTap(!room.canPlaybackAudio);
      setPhase("in_call");
    } catch {
      setError("We couldn't connect the call. Check your connection and try again.");
      setPhase("idle");
      return;
    }

    try {
      await room.localParticipant.setMicrophoneEnabled(true);
    } catch {
      setMuted(true);
      setError(
        "Toastly couldn't use your microphone. Allow it in your browser's settings for this site, then tap Unmute.",
      );
    }
  }

  async function toggleMute() {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(muted);
      setMuted(!muted);
      setError(null);
    } catch {
      setError("Toastly couldn't use your microphone. Allow it in your browser's settings for this site.");
    }
  }

  async function leave() {
    await roomRef.current?.disconnect();
    setPhase("left");
    router.refresh();
  }

  async function extend() {
    setBusy(true);
    try {
      const res = await fetch(`/api/gist/${sessionId}/extend`, { method: "POST" });
      const json = (await res.json()) as { clock?: Clock; error?: string };
      if (json.clock) setClock(json.clock);
      else if (json.error) setError(json.error);
      await tellOther();
    } catch {}
    setBusy(false);
  }

  const first = otherName.split(" ")[0];

  if (phase === "ended" || phase === "left") {
    return (
      <div className="grid gap-3">
        <h2 className="text-h5 text-ink-900">{phase === "ended" ? "That's time" : "You've left the call"}</h2>
        <p className="text-ui text-grey-600">
          {phase === "ended"
            ? "Thanks for showing up for each other. Nothing was recorded."
            : "Nothing was recorded. If you'd like to, you can rejoin while there's time left."}
        </p>
        {phase === "left" && (secondsLeft === null || secondsLeft > 0) ? (
          <Button
            variant="outline"
            className="justify-self-start"
            onClick={() => {
              finishingRef.current = false;
              void join();
            }}
          >
            Rejoin
          </Button>
        ) : null}
      </div>
    );
  }

  if (phase === "idle" || phase === "connecting") {
    return (
      <div className="grid gap-3">
        <h2 className="text-h5 text-ink-900">Ready to join</h2>
        <p className="text-ui text-grey-600">
          Your browser will ask to use your microphone. The 18 minutes start when the first of you joins.
        </p>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Button className="justify-self-start" disabled={phase === "connecting"} onClick={join}>
          {phase === "connecting" ? "Connecting…" : "Join the call"}
        </Button>
        <p className="text-nav text-grey-600">This is a voice call. Your camera will not be requested.</p>
      </div>
    );
  }

  const warn = secondsLeft !== null && secondsLeft <= WARN_SECONDS;

  return (
    <div className="grid gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-h5 text-ink-900">
          {phase === "reconnecting" ? "Reconnecting…" : theyHere ? `You're talking with ${first}` : `Waiting for ${first}`}
        </h2>
        <span
          role="timer"
          aria-live={warn ? "polite" : "off"}
          className={`font-serif text-[28px] font-bold tabular-nums ${warn ? "text-gold-800" : "text-ink-900"}`}
        >
          {secondsLeft === null ? "--:--" : mmss(secondsLeft)}
        </span>
      </div>

      <ul className="m-0 flex list-none flex-wrap gap-2 p-0 text-nav">
        <li className={`rounded-pill px-3 py-1.5 ${speaking.you ? "bg-green-50 text-green-550" : "bg-grey-100 text-grey-600"}`}>
          You{muted ? " · muted" : speaking.you ? " · speaking" : ""}
        </li>
        <li className={`rounded-pill px-3 py-1.5 ${speaking.them ? "bg-green-50 text-green-550" : "bg-grey-100 text-grey-600"}`}>
          {first}
          {!theyHere ? " · not here yet" : speaking.them ? " · speaking" : ""}
        </li>
      </ul>

      {needsTap ? (
        <Button variant="outline" className="justify-self-start" onClick={() => void roomRef.current?.startAudio()}>
          Tap to hear {first}
        </Button>
      ) : null}

      {error ? <Notice tone="error">{error}</Notice> : null}

      {warn && clock && !clock.extended ? (
        <div className="grid gap-2 rounded-lg border border-champagne/90 bg-gold-50 px-[13px] py-3.5">
          <p className="m-0 text-ui font-semibold text-gold-800">
            {mmss(secondsLeft ?? 0)} left. Want 18 more minutes?
          </p>
          <p className="m-0 text-nav text-gold-800">
            {clock.you_asked_to_extend
              ? `You've asked. It extends if ${first} asks too.`
              : clock.they_asked_to_extend
                ? `${first} would like more time. It extends if you ask too.`
                : "It extends only if you both ask. You can do this once."}
          </p>
          {!clock.you_asked_to_extend ? (
            <Button variant="outline" className="justify-self-start" disabled={busy} onClick={extend}>
              Ask for 18 more minutes
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2.5">
        <Button variant="outline" onClick={toggleMute}>
          {muted ? "Unmute" : "Mute"}
        </Button>
        <Button variant="outline" onClick={leave}>
          Leave the call
        </Button>
      </div>
      <p className="text-nav text-grey-600">Nothing is recorded. Either of you can leave at any time.</p>
      <div ref={audioRef} hidden />
    </div>
  );
}

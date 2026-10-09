"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ConnectionQuality,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  type LocalTrackPublication,
  type RemoteTrack,
  type Participant,
} from "livekit-client";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { ReportForm } from "@/components/safety/report-form";
import { GIST_DEFAULT_MINUTES, GIST_EXTENSION_MINUTES } from "@/lib/gist";
import type { GistVideo } from "@/lib/gist-clock";
import { CallScreen, type CallSheet, type VideoRow } from "./call-screen";

/**
 * The Gist call. In the call, the screen is design/prototype/
 * gist-video-call.html (CallScreen), for voice and video alike. Before
 * joining and after leaving it keeps the session page's own cards and
 * buttons (no prototype draws those — flagged).
 *
 * Every Gist starts as voice. Video (Phase 2; 0040) exists only when
 * clock.video is set — VIDEO_GIST_ENABLED on and a Premium Plus or Diaspora
 * Plus member in the call. Both or neither: the camera turns on only when
 * the server says video is on, and off the moment it says otherwise. A weak
 * connection falls back to voice for both. A one-time notice comes before
 * the first video on mobile data. No upgrade prompt during a call.
 *
 * The clock is the server's (0019, 0020). Either person can extend once —
 * both-clocks.slim.html: "Either of you can extend it once, by 18 minutes."
 * This component only displays it, and
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
  deck_index: number;
  deck: { position: number; text: string }[];
  video: GistVideo | null;
};

/** Mobile data, where the browser can tell (Android Chrome); iOS can't. */
function onMobileData(): boolean {
  const c = (navigator as Navigator & { connection?: { type?: string } }).connection;
  return c?.type === "cellular";
}
const DATA_NOTICE_KEY = "toastly.videoDataNoticeSeen";
function dataNoticeSeen(): boolean {
  try {
    return localStorage.getItem(DATA_NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}
function markDataNoticeSeen() {
  try {
    localStorage.setItem(DATA_NOTICE_KEY, "1");
  } catch {}
}

type Phase = "idle" | "connecting" | "in_call" | "reconnecting" | "ended" | "left";

const WARN_SECONDS = 120;

function mmss(total: number) {
  const s = Math.max(0, total);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function GistCall({
  sessionId,
  otherName,
  otherId,
  myName = "You",
  myPhoto = null,
  otherPhoto = null,
}: {
  sessionId: string;
  otherName: string;
  /** For Report, on every state of the call. */
  otherId?: string;
  myName?: string;
  /** Short-lived signed URLs of each main photo, for the call screen. */
  myPhoto?: string | null;
  otherPhoto?: string | null;
}) {
  const router = useRouter();
  const roomRef = React.useRef<Room | null>(null);
  const audioRef = React.useRef<HTMLDivElement>(null);
  const remoteVideoRef = React.useRef<HTMLDivElement>(null);
  const localVideoRef = React.useRef<HTMLDivElement>(null);
  const poorSinceRef = React.useRef<number | null>(null);
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
  const [reportOpen, setReportOpen] = React.useState(false);
  // One-time notices before a member's camera first turns on: being
  // recorded (once per member, 0041), then mobile data (once per device).
  const [notice, setNotice] = React.useState<null | { kind: "recording" | "data"; then: "ask" | "accept" }>(null);

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
        const el = track.attach();
        if (track.kind === Track.Kind.Video) {
          el.className = "h-full w-full object-cover";
          remoteVideoRef.current?.replaceChildren(el);
        } else {
          audioRef.current?.appendChild(el);
        }
      })
      .on(RoomEvent.LocalTrackPublished, (pub: LocalTrackPublication) => {
        if (pub.source !== Track.Source.Camera || !pub.track) return;
        const el = pub.track.attach();
        el.className = "h-full w-full object-cover";
        localVideoRef.current?.replaceChildren(el);
      })
      .on(RoomEvent.ConnectionQualityChanged, (quality: ConnectionQuality) => {
        poorSinceRef.current = quality === ConnectionQuality.Poor ? (poorSinceRef.current ?? Date.now()) : null;
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
      // Joining made the Gist live on the server; redraw the page so the
      // question deck ("the questions open once you've both joined") appears.
      // The call stays connected: this component keeps its state.
      router.refresh();
    } catch (e) {
      // Say which side failed: the network, or LiveKit refusing the token.
      const reason = (e as Error)?.message ?? "";
      console.error("[gist] connect failed:", reason);
      setError(
        /401|invalid|token|unauthori[sz]ed/i.test(reason)
          ? "The call server didn't accept this call. Please tell us — this is on our side, not yours."
          : /signal connection|fetch|network|websocket/i.test(reason)
            ? "We couldn't reach the call server. Check your connection and try again."
            : `We couldn't connect the call (${reason.slice(0, 80) || "unknown error"}). Please try again.`,
      );
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

  // Video: one action at a time; the server decides, and mirrors it in LiveKit.
  const videoAction = React.useCallback(
    async (action: "request" | "cancel" | "accept" | "decline" | "off", reason?: string) => {
      setBusy(true);
      try {
        const res = await fetch(`/api/gist/${sessionId}/video`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, reason }),
        });
        const json = (await res.json()) as { clock?: Clock; error?: string };
        if (json.clock) setClock(json.clock);
        else if (json.error) setError(json.error);
        await tellOther();
      } catch {}
      setBusy(false);
    },
    [sessionId, tellOther],
  );

  const videoOn = clock?.video?.state === "on";

  // Both or neither: the camera follows the server's state, never a button.
  React.useEffect(() => {
    const room = roomRef.current;
    if (!room || (phase !== "in_call" && phase !== "reconnecting")) return;
    if (videoOn) {
      room.localParticipant
        .setCameraEnabled(true, { resolution: VideoPresets.h360.resolution })
        .catch(() => void videoAction("off", "camera_unavailable"));
    } else {
      void room.localParticipant.setCameraEnabled(false).catch(() => undefined);
      localVideoRef.current?.replaceChildren();
      remoteVideoRef.current?.replaceChildren();
    }
  }, [videoOn, phase, videoAction]);

  // A weak connection while video is on: back to voice, for both.
  React.useEffect(() => {
    if (!videoOn) return;
    const t = window.setInterval(() => {
      if (poorSinceRef.current && Date.now() - poorSinceRef.current > 3000) {
        poorSinceRef.current = null;
        void videoAction("off", "weak_connection");
      }
    }, 1000);
    return () => window.clearInterval(t);
  }, [videoOn, videoAction]);

  // Next question (or a swipe): either person, after agreeing out loud. The
  // server moves the card for both; the other phone hears about it at once.
  async function advance() {
    if (!clock) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/gist/${sessionId}/deck`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected: clock.deck_index }),
      });
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
  const v = clock?.video ?? null;
  const askOpen = v?.ask_from ? now >= Date.parse(v.ask_from) : false;
  const minutes = Math.max(1, Math.round((v?.ask_after_seconds ?? 180) / 60));

  // The video row: absent with no video plan (no upsell, no locked icon).
  let row: VideoRow | null = null;
  if (v && v.state !== "on" && !(v.state === "requested" && !v.asked_by_you)) {
    if (v.declined) row = { kind: "declined", note: v.asked_by_you ? `${first} would like to stay on voice` : null };
    else if (v.state === "requested") row = { kind: "waiting", onCancel: () => void videoAction("cancel") };
    else if (!askOpen) row = { kind: "locked", note: `Available after ${minutes} minute${minutes === 1 ? "" : "s"}` };
    else
      row = { kind: "ask", busy, onAsk: () => proceed("ask") };
  }

  // Before this member's camera first turns on — asking or accepting — the
  // one-time notices: being recorded (once per member), then mobile data
  // (once per device). "Stay on voice" keeps the Gist as voice for both.
  function proceed(step: "ask" | "accept", passed: "recording" | "data" | null = null) {
    if (passed === null && v && !v.notice_seen) return setNotice({ kind: "recording", then: step });
    if (passed !== "data" && onMobileData() && !dataNoticeSeen()) return setNotice({ kind: "data", then: step });
    setNotice(null);
    void videoAction(step === "ask" ? "request" : "accept");
  }
  function stayOnVoice(step: "ask" | "accept") {
    setNotice(null);
    if (step === "accept") void videoAction("decline");
  }

  let sheet: CallSheet | null = null;
  if (notice?.kind === "recording") {
    const step = notice.then;
    sheet = {
      title: "Before you turn on video",
      body: "Toastly never records calls, but we can't stop someone recording their screen. Only turn on video if you're comfortable.",
      yes: "Continue",
      busy,
      onYes: () => {
        void fetch("/api/gist/video-notice", { method: "POST" }).catch(() => undefined);
        if (clock?.video) setClock({ ...clock, video: { ...clock.video, notice_seen: true } });
        proceed(step, "recording");
      },
      onNo: () => stayOnVoice(step),
    };
  } else if (notice?.kind === "data") {
    const step = notice.then;
    sheet = {
      title: "Video uses about 5–10 MB a minute. Continue?",
      body: "You're on mobile data. We'll only ask this once.",
      yes: "Continue",
      busy,
      onYes: () => {
        markDataNoticeSeen();
        proceed(step, "data");
      },
      onNo: () => stayOnVoice(step),
    };
  } else if (v?.state === "requested" && !v.asked_by_you) {
    sheet = {
      title: `${first} would like to turn on video`,
      body: "Both cameras go on together. Either of you can turn video off at any time.",
      yes: "Turn on video",
      busy,
      onYes: () => proceed("accept"),
      onNo: () => void videoAction("decline"),
    };
  }

  const extra = (
    <>
      {phase === "reconnecting" ? <p className="m-0 text-center text-[13px] text-white/75">Reconnecting…</p> : null}
      {!theyHere ? <p className="m-0 text-center text-[13px] text-white/75">Waiting for {first} to join.</p> : null}
      {needsTap ? (
        <button
          type="button"
          onClick={() => void roomRef.current?.startAudio()}
          className="min-h-11 rounded-xl border border-champagne/55 bg-transparent text-[14px] font-semibold text-white"
        >
          Tap to hear {first}
        </button>
      ) : null}
      {error ? <p role="alert" className="m-0 rounded-xl bg-gold-50 px-3.5 py-2.5 text-[14px] text-gold-800">{error}</p> : null}
      {warn && clock && !clock.extended ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-champagne/30 bg-green-700 py-1 pl-3.5 pr-1">
          <span className="text-[14px] text-white">{mmss(secondsLeft ?? 0)} left. Either of you can add 18 minutes, once.</span>
          <button
            type="button"
            disabled={busy}
            onClick={extend}
            className="min-h-11 flex-shrink-0 rounded-[10px] border-0 bg-transparent px-3 text-[14px] font-semibold text-champagne hover:bg-champagne/[.08]"
          >
            Add 18 minutes
          </button>
        </div>
      ) : null}
    </>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-green-800">
      <div className="flex h-full w-full max-w-[480px] flex-col">
        <CallScreen
          peer={{ name: otherName, img: otherPhoto }}
          me={{ name: myName, img: myPhoto }}
          mode={videoOn ? "video" : "voice"}
          timeLeft={secondsLeft === null ? "--:--" : mmss(secondsLeft)}
          timeOf={`${clock?.extended ? GIST_DEFAULT_MINUTES + GIST_EXTENSION_MINUTES : GIST_DEFAULT_MINUTES}:00`}
          peerSpeaking={speaking.them}
          cards={clock?.deck ?? []}
          deckIndex={clock?.deck_index ?? 0}
          deckBusy={busy}
          onNext={() => void advance()}
          row={row}
          banner={v?.state === "off" && v.off_reason === "weak_connection"}
          sheet={sheet}
          remoteVideo={<div ref={remoteVideoRef} className="h-full w-full" />}
          localVideo={<div ref={localVideoRef} className="h-full w-full" />}
          muted={muted}
          onMute={toggleMute}
          onEnd={leave}
          onTurnOffVideo={() => void videoAction("off", "turned_off")}
          onReport={() => setReportOpen(true)}
          extra={extra}
          // The VIEWER's own first name and today's date — nothing else about anyone.
          watermark={`${myName.split(" ")[0]} · ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
        />
        <div ref={audioRef} hidden />
      </div>
      {reportOpen ? (
        <div className="absolute inset-0 z-10 flex items-end justify-center bg-green-800/[.72] p-2.5">
          <div role="dialog" aria-modal="true" aria-label={`Report ${first}`} className="grid max-h-[90vh] w-full max-w-[460px] gap-3 overflow-y-auto rounded-2xl bg-paper p-[18px] text-ink-900">
            <div className="flex items-center justify-between gap-3">
              <p className="m-0 font-serif text-[20px] font-bold">Report {first}</p>
              <button type="button" onClick={() => setReportOpen(false)} className="min-h-11 rounded-lg px-3 text-[14px] font-semibold text-ink-900 underline">
                Close
              </button>
            </div>
            <ReportForm memberId={otherId ?? ""} name={otherName} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

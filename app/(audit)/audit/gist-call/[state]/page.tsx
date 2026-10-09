"use client";

import { notFound } from "next/navigation";
import { CallScreen, type CallSheet, type VideoRow } from "@/components/gist/call-screen";

/**
 * Mobile-audit harness: the in-call screen in every state of
 * design/prototype/gist-video-call.html (A–J), drawn by the real component.
 * Gated by the audit layout (AUDIT_HARNESS).
 */
const noop = () => undefined;
const CARDS = [
  "What did you eat today, and was it a good decision?",
  "What is something you have changed your mind about recently?",
  "Who in your family would you introduce someone to first?",
  "What are you working towards right now, money-wise or otherwise?",
  "What would you want to be true about your life in five years?",
  "What made you decide you are ready for something serious?",
].map((text, i) => ({ position: i + 1, text }));

type S = { time: string; index: number; row?: VideoRow | null; sheet?: CallSheet | null; video?: boolean; banner?: boolean; peer?: string };
const sheet = (title: string, body: string, yes: string): CallSheet => ({ title, body, yes, onYes: noop, onNo: noop });
const STATES: Record<string, S> = {
  a: { time: "16:20", index: 0, row: { kind: "locked", note: "Available after 3 minutes" } },
  b: { time: "14:52", index: 1, row: { kind: "ask", onAsk: noop } },
  c: { time: "14:40", index: 1, row: { kind: "waiting", onCancel: noop } },
  d: { time: "14:40", index: 1, peer: "Kelechi Obi", sheet: sheet("Kelechi would like to turn on video", "Both cameras go on together. Either of you can turn video off at any time.", "Turn on video") },
  e: { time: "13:05", index: 1, video: true },
  f: { time: "14:31", index: 1, row: { kind: "declined", note: "Amaka would like to stay on voice" } },
  g: { time: "11:47", index: 2, row: { kind: "ask", onAsk: noop }, banner: true },
  h: { time: "14:38", index: 1, peer: "Kelechi Obi", sheet: sheet("Video uses about 5–10 MB a minute. Continue?", "You're on mobile data. We'll only ask this once.", "Continue") },
  i: { time: "14:52", index: 1, row: null },
  j: { time: "04:35", index: 6, row: { kind: "ask", onAsk: noop } },
};

export default function AuditGistCallState({ params }: { params: { state: string } }) {
  const s = STATES[params.state];
  if (!s) notFound();
  const tile = (label: string) => (
    <div className="grid h-full w-full place-items-center bg-green-700 text-[13px] text-white/60">{label}</div>
  );
  return (
    <div className="flex h-screen justify-center bg-green-800">
      <div className="flex h-full w-full max-w-[480px] flex-col">
        <CallScreen
          peer={{ name: s.peer ?? "Amaka Eze", img: null }}
          me={{ name: s.peer ? "Amaka Eze" : "Kelechi Obi", img: null }}
          mode={s.video ? "video" : "voice"}
          timeLeft={s.time}
          timeOf="18:00"
          peerSpeaking={!s.video}
          cards={CARDS}
          deckIndex={s.index}
          deckBusy={false}
          onNext={noop}
          row={s.row ?? null}
          banner={Boolean(s.banner)}
          sheet={s.sheet ?? null}
          remoteVideo={tile("Their video")}
          localVideo={tile("You")}
          muted={false}
          onMute={noop}
          onEnd={noop}
          onTurnOffVideo={noop}
          onReport={noop}
        />
      </div>
    </div>
  );
}

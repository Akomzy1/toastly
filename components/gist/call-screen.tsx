"use client";

import * as React from "react";
import { DeckCard, type DeckCardQuestion } from "./deck-card";

/**
 * The in-call screen — design/prototype/gist-video-call.html, states A–J,
 * for voice and video alike. Presentational: the live call (gist-call.tsx)
 * and the audit harness both drive it.
 *
 * Every Gist starts as voice. The video row appears only when this Gist has
 * a video plan and VIDEO_GIST_ENABLED is on (row = null otherwise: no
 * control, no upsell, no locked icon). Report and End are on every state.
 * No upgrade prompt ever appears here.
 *
 * Addition, flagged: the "2:00 left — add 18 minutes" bar (the one-time
 * extension, both-clocks.slim.html) sits above the controls; the prototype
 * draws no extension state.
 */

export type VideoRow =
  | { kind: "locked"; note: string }
  | { kind: "ask"; busy?: boolean; onAsk: () => void }
  | { kind: "waiting"; onCancel: () => void }
  | { kind: "declined"; note: string | null };

export type CallSheet = {
  title: string;
  body: string;
  yes: string;
  busy?: boolean;
  onYes: () => void;
  onNo: () => void;
};

type Person = { img: string | null; name: string };

function Avatar({ person, ring, label }: { person: Person; ring?: boolean; label: string }) {
  const initials = person.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className={`grid justify-items-center gap-2.5 [@media(max-height:700px)]:gap-1`}>
      {person.img ? (
        // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL
        <img
          src={person.img}
          alt={label}
          className={`h-[92px] w-[92px] rounded-pill bg-green-700 object-cover [@media(max-height:700px)]:h-14 [@media(max-height:700px)]:w-14 ${ring ? "shadow-[0_0_0_3px_#001F1B,0_0_0_5px_#FFB300]" : ""}`}
        />
      ) : (
        <span
          role="img"
          aria-label={label}
          className={`grid h-[92px] w-[92px] place-items-center rounded-pill bg-green-700 font-serif text-[30px] [@media(max-height:700px)]:h-14 [@media(max-height:700px)]:w-14 [@media(max-height:700px)]:text-[20px] font-bold text-champagne ${ring ? "shadow-[0_0_0_3px_#001F1B,0_0_0_5px_#FFB300]" : ""}`}
        >
          {initials}
        </span>
      )}
      <span className="text-[14px] font-semibold text-white/[.86]">{label}</span>
    </span>
  );
}

const CamIcon = ({ stroke = "currentColor" }: { stroke?: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3" y="6.5" width="12.5" height="11" rx="2.5" stroke={stroke} strokeWidth="1.8" />
    <path d="m15.5 10.5 5-3v9l-5-3" stroke={stroke} strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
);

function Row({ row, peer }: { row: VideoRow; peer: string }) {
  const disabled =
    "flex min-h-12 w-full cursor-default items-center justify-center gap-[9px] rounded-xl border border-white/[.12] bg-white/[.04] text-[15px] font-semibold text-white/40";
  if (row.kind === "locked" || row.kind === "declined") {
    const note = row.kind === "locked" ? row.note : row.note;
    return (
      <div className="grid justify-items-center gap-2">
        <button type="button" disabled className={disabled}>
          <CamIcon />
          Ask for video
        </button>
        {note ? <span className={`text-[13px] ${row.kind === "declined" ? "text-white/75" : "text-white/[.66]"}`}>{note}</span> : null}
      </div>
    );
  }
  if (row.kind === "ask") {
    return (
      <button
        type="button"
        disabled={row.busy}
        onClick={row.onAsk}
        className="flex min-h-12 w-full items-center justify-center gap-[9px] rounded-xl border border-champagne/55 bg-transparent text-[15px] font-semibold text-white hover:border-champagne hover:bg-champagne/[.08]"
      >
        <CamIcon stroke="#EBD9AE" />
        Ask for video
      </button>
    );
  }
  return (
    <div className="flex min-h-12 items-center justify-between gap-2.5 rounded-xl border border-champagne/[.28] bg-green-700 py-1 pl-3.5 pr-1">
      <span className="flex min-w-0 items-center gap-2.5 text-[14.5px] text-white">
        <span className="h-2 w-2 flex-shrink-0 rounded-pill bg-gold-500" />
        <span>Asked {peer} to turn on video…</span>
      </span>
      <button
        type="button"
        onClick={row.onCancel}
        className="min-h-11 flex-shrink-0 rounded-[10px] border-0 bg-transparent px-3.5 text-[14.5px] font-semibold text-champagne hover:bg-champagne/[.08]"
      >
        Cancel
      </button>
    </div>
  );
}

export function CallScreen({
  peer,
  me,
  mode,
  timeLeft,
  timeOf,
  peerSpeaking,
  cards,
  deckIndex,
  deckBusy,
  onNext,
  row,
  banner,
  sheet,
  remoteVideo,
  localVideo,
  muted,
  onMute,
  onEnd,
  onTurnOffVideo,
  onReport,
  extra,
}: {
  peer: Person;
  me: Person;
  mode: "voice" | "video";
  timeLeft: string;
  timeOf: string;
  peerSpeaking: boolean;
  cards: DeckCardQuestion[];
  deckIndex: number;
  deckBusy: boolean;
  onNext: () => void;
  row: VideoRow | null;
  banner: boolean;
  sheet: CallSheet | null;
  remoteVideo?: React.ReactNode;
  localVideo?: React.ReactNode;
  muted: boolean;
  onMute: () => void;
  onEnd: () => void;
  onTurnOffVideo?: () => void;
  onReport: () => void;
  /** Reconnecting, tap-to-hear, an error, the extension bar. */
  extra?: React.ReactNode;
}) {
  const first = peer.name.split(" ")[0];
  const ctrl = "grid h-[60px] w-[60px] place-items-center rounded-pill border-0 [@media(max-height:700px)]:h-[52px] [@media(max-height:700px)]:w-[52px]";
  return (
    <div className="flex h-full min-h-0 flex-col bg-green-800 text-white">
      <div className={`flex items-center justify-between gap-3 px-4 pb-3.5 pt-[18px] [@media(max-height:700px)]:pb-2 [@media(max-height:700px)]:pt-3`}>
        <div className="grid min-w-0 gap-[3px]">
          <p className="m-0 font-serif text-[19px] font-bold text-white">Gist with {first}</p>
          <p className="m-0 flex items-center gap-[7px] text-[13px] text-white/[.66]">
            <span className="h-[7px] w-[7px] rounded-pill bg-success" />
            {mode === "video" ? "Video" : "Voice"}
          </p>
        </div>
        <button
          type="button"
          onClick={onReport}
          className="flex min-h-11 flex-shrink-0 items-center gap-[7px] rounded-pill border border-white/[.24] bg-transparent px-3.5 text-[14px] font-semibold text-white hover:border-champagne"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 21V4m0 0h11l-2 4 2 4H5" stroke="#EBD9AE" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Report
        </button>
      </div>

      {banner ? (
        <div role="status" className="mx-4 mt-0.5 flex items-center gap-2.5 rounded-xl bg-gold-50 px-3.5 py-[11px] text-[14px] font-semibold leading-[1.4] text-gold-800">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="flex-shrink-0">
            <path d="M4 18h.01M9 18v-3M14 18v-7M19 18V6" stroke="#4C3500" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          Weak connection. Switched to voice.
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1 flex-col">
        {mode === "voice" ? (
          <div className="flex min-h-0 flex-1 overflow-y-auto px-4 pb-2 pt-3">
            {/* m-auto centres when there's room and scrolls when there isn't — never clips. */}
            <div className={`m-auto grid w-full gap-7 [@media(max-height:700px)]:gap-3`}>
            <div className="grid justify-items-center gap-1 text-center">
              <span role="timer" className={`font-serif text-[44px] font-bold leading-none text-white [font-variant-numeric:tabular-nums] [@media(max-height:700px)]:text-[32px]`}>
                {timeLeft}
              </span>
              <span className="text-[13px] text-white/[.66]">left of {timeOf}</span>
            </div>
            <div className="flex justify-center gap-7">
              <Avatar person={me} label="You" />
              <Avatar person={peer} label={first} ring={peerSpeaking} />
            </div>
            {cards.length ? <DeckCard cards={cards} index={deckIndex} busy={deckBusy} onNext={onNext} tone="dark" /> : null}
            {row ? <Row row={row} peer={first} /> : null}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 px-3 pt-0.5">
            <div className="relative flex-1 overflow-hidden rounded-2xl bg-green-700">
              <div className="absolute inset-0">{remoteVideo}</div>
              <span className="absolute left-3 top-3 flex items-baseline gap-1.5 rounded-pill bg-green-800/80 px-[11px] py-[7px]">
                <span role="timer" className="font-serif text-[17px] font-bold text-white [font-variant-numeric:tabular-nums]">
                  {timeLeft}
                </span>
                <span className="text-[12px] text-white/75">left of {timeOf}</span>
              </span>
              <div className="absolute right-3 top-3 h-[124px] w-[92px] overflow-hidden rounded-xl border-2 border-white/[.85] bg-green-700">
                {localVideo}
              </div>
              {cards.length ? (
                <div className="absolute inset-x-3 bottom-3">
                  <DeckCard cards={cards} index={deckIndex} busy={deckBusy} onNext={onNext} tone="overlay" />
                </div>
              ) : null}
            </div>
          </div>
        )}

        {sheet ? (
          <div className="absolute inset-0 flex items-end bg-green-800/[.72] px-2.5 pb-1">
            <div role="dialog" aria-modal="true" aria-label={sheet.title} className="grid w-full gap-3.5 rounded-2xl bg-paper px-[18px] pb-[18px] pt-2.5 text-ink-900 shadow-[0_-12px_40px_-16px_rgba(0,0,0,0.6)]">
              <span className="h-1 w-9 justify-self-center rounded-pill bg-grey-200" />
              <div className="grid gap-2">
                <p className="m-0 font-serif text-[21px] font-bold leading-[1.25] text-ink-900 [text-wrap:balance]">{sheet.title}</p>
                <p className="m-0 text-[15px] leading-[1.55] text-ink-800 [text-wrap:pretty]">{sheet.body}</p>
              </div>
              {/* Both choices the same size and style, with no default. */}
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  [sheet.yes, sheet.onYes],
                  ["Stay on voice", sheet.onNo],
                ].map(([label, fn]) => (
                  <button
                    key={label as string}
                    type="button"
                    disabled={sheet.busy}
                    onClick={fn as () => void}
                    className="min-h-12 rounded-xl border border-ink-900/20 bg-white px-2.5 py-3 text-[15px] font-semibold text-ink-900 hover:border-green-500 hover:bg-green-50"
                  >
                    {label as string}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {extra ? <div className="grid gap-2 px-4 pt-2">{extra}</div> : null}

      <div className={`flex justify-center gap-[30px] px-4 pb-1.5 pt-3.5 [@media(max-height:700px)]:pt-2`}>
        {mode === "video" && onTurnOffVideo ? (
          <span className="grid w-[96px] justify-items-center gap-[7px]">
            <button type="button" aria-label="Turn off video, ends it for both" onClick={onTurnOffVideo} className={`${ctrl} bg-white/[.12] hover:bg-white/20`}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="6.5" width="12.5" height="11" rx="2.5" stroke="#FFFFFF" strokeWidth="1.8" />
                <path d="m15.5 10.5 5-3v9l-5-3M3 3l18 18" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <span className="text-center text-[12.5px] leading-[1.3] text-white/[.86]">
              Turn off video
              <br />
              <span className="text-white/60">ends it for both</span>
            </span>
          </span>
        ) : null}
        <span className="grid w-[72px] content-start justify-items-center gap-[7px]">
          <button type="button" aria-label={muted ? "Unmute" : "Mute"} aria-pressed={muted} onClick={onMute} className={`${ctrl} ${muted ? "bg-white text-green-800" : "bg-white/[.12] hover:bg-white/20"}`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" className={muted ? "text-green-800" : "text-white"} />
              <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={muted ? "text-green-800" : "text-white"} />
              {muted ? <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-green-800" /> : null}
            </svg>
          </button>
          <span className="text-[12.5px] text-white/[.86]">{muted ? "Unmute" : "Mute"}</span>
        </span>
        <span className="grid w-[72px] content-start justify-items-center gap-[7px]">
          <button type="button" aria-label="End Gist" onClick={onEnd} className={`${ctrl} bg-error hover:bg-error/90`}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3.2 13.6c4.9-4.3 12.7-4.3 17.6 0l-1.9 2.6-3.3-1.3-.3-2.2a10 10 0 0 0-6.6 0l-.3 2.2-3.3 1.3z" fill="#FFFFFF" />
            </svg>
          </button>
          <span className="text-[12.5px] text-white/[.86]">End</span>
        </span>
      </div>

      <p className={`m-0 px-4 pb-[18px] pt-2 text-center text-[12.5px] text-white/60 [@media(max-height:700px)]:pb-2.5 [@media(max-height:700px)]:pt-1`}>Toastly never records calls.</p>
    </div>
  );
}

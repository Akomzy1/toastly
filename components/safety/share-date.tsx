"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import {
  buildDateShareText,
  buildPanicText,
  type EmergencyNumber,
} from "@/lib/safety";

/**
 * Share-your-date and panic.
 *
 * NOT IN THE PROTOTYPE — flagged. Safety & Trust describes the kit; there is
 * no approved in-app screen for it.
 *
 * Deliberately server-free. The message is composed on the device and handed
 * to the member's own WhatsApp or share sheet, so Toastly never stores a
 * trusted contact's phone number and never sees the plan. Location is
 * requested only when the member presses the button, and leaves the phone
 * only inside a message they choose to send.
 *
 * Honest about its limits: it alerts nobody automatically — not Toastly, not
 * the police. The emergency numbers are always on screen for that reason.
 */

type Handoff = "idle" | "shared" | "copied" | "failed";

async function handOff(text: string): Promise<Handoff> {
  try {
    if (typeof navigator.share === "function") {
      await navigator.share({ text });
      return "shared";
    }
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch (e) {
    // Closing the share sheet is a choice, not an error.
    if (e instanceof DOMException && e.name === "AbortError") return "idle";
    return "failed";
  }
}

function whatsappHref(text: string) {
  // No number in the link: WhatsApp opens its own contact picker.
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

function HandoffNotice({ result }: { result: Handoff }) {
  if (result === "copied")
    return <Notice tone="success">Copied — paste it to someone you trust.</Notice>;
  if (result === "failed")
    return (
      <Notice tone="error">
        Your phone didn&rsquo;t let us share that. Use the WhatsApp button instead.
      </Notice>
    );
  return null;
}

export function ShareDate({
  firstName,
  numbers,
}: {
  firstName: string;
  numbers: EmergencyNumber[];
}) {
  const [match, setMatch] = React.useState("");
  const [place, setPlace] = React.useState("");
  const [when, setWhen] = React.useState("");
  const [checkIn, setCheckIn] = React.useState("");
  const [dateResult, setDateResult] = React.useState<Handoff>("idle");

  const [panic, setPanic] = React.useState<"idle" | "locating" | "ready">("idle");
  const [panicText, setPanicText] = React.useState("");
  const [located, setLocated] = React.useState(false);
  const [panicResult, setPanicResult] = React.useState<Handoff>("idle");

  const ready = Boolean(match.trim() && place.trim() && when.trim());
  const dateText = ready
    ? buildDateShareText({ me: firstName, match, place, when, checkIn })
    : "";

  function startPanic() {
    if (!("geolocation" in navigator)) {
      setPanicText(buildPanicText(null));
      setLocated(false);
      setPanic("ready");
      return;
    }
    setPanic("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPanicText(
          buildPanicText({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        );
        setLocated(true);
        setPanic("ready");
      },
      () => {
        // Location refused or unavailable: still let them ask for help.
        setPanicText(buildPanicText(null));
        setLocated(false);
        setPanic("ready");
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  }

  return (
    <div className="grid gap-6">
      {/* Panic first: in a bad moment nobody should scroll past a form. */}
      <Card className="grid gap-4 border-error/30 p-[26px]">
        <div className="grid gap-1.5">
          <h2 className="text-h5 text-ink-900">Need help now?</h2>
          <p className="text-ui text-grey-600">
            This sends your location to someone you choose. It doesn&rsquo;t alert
            Toastly or the police — for an emergency, call a number below.
          </p>
        </div>

        {panic !== "ready" ? (
          <button
            type="button"
            onClick={startPanic}
            disabled={panic === "locating"}
            className="inline-flex min-h-11 items-center justify-center justify-self-start rounded-lg bg-error px-6 py-3.5 font-sans text-button text-white transition-colors duration-200 hover:bg-error/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-error/30 disabled:opacity-70"
          >
            {panic === "locating" ? "Finding your location…" : "I need help"}
          </button>
        ) : (
          <div className="grid gap-3">
            {!located ? (
              <Notice tone="info">
                We couldn&rsquo;t get your location, so the message asks them to
                ring you first.
              </Notice>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <a href={whatsappHref(panicText)} target="_blank" rel="noopener noreferrer">
                  Send on WhatsApp
                </a>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={async () => setPanicResult(await handOff(panicText))}
              >
                Share another way
              </Button>
            </div>
            <HandoffNotice result={panicResult} />
          </div>
        )}

        <div className="grid gap-2 border-t border-ink-900/[.12] pt-4">
          {numbers.length ? (
            <div className="flex flex-wrap gap-3">
              {numbers.map((n) => (
                <Button key={n.number} variant="outline" asChild>
                  <a href={`tel:${n.number}`}>
                    {n.label} · {n.number}
                  </a>
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-ui text-ink-900">
              Call your local emergency number.
            </p>
          )}
        </div>
      </Card>

      <Card className="grid gap-5 p-[26px]">
        <div className="grid gap-1.5">
          <h2 className="text-h5 text-ink-900">Share your date</h2>
          <p className="text-ui text-grey-600">
            Tell a friend where you&rsquo;ll be. This is written on your phone and
            sent by you — Toastly never sees it or who you send it to.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Label htmlFor="sd-match">
            Who you&rsquo;re meeting
            <Input
              id="sd-match"
              value={match}
              onChange={(e) => setMatch(e.target.value)}
              placeholder="First name"
              autoComplete="off"
            />
          </Label>
          <Label htmlFor="sd-place">
            Where
            <Input
              id="sd-place"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder="Café, area"
              autoComplete="off"
            />
          </Label>
          <Label htmlFor="sd-when">
            When
            <Input
              id="sd-when"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              placeholder="Saturday, 7pm"
              autoComplete="off"
            />
          </Label>
          <Label htmlFor="sd-checkin">
            Check in by <span className="text-grey-400">(optional)</span>
            <Input
              id="sd-checkin"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              placeholder="9:30pm"
              autoComplete="off"
            />
          </Label>
        </div>

        {ready ? (
          <>
            <p className="rounded-lg bg-paper p-4 text-ui text-ink-900">{dateText}</p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <a href={whatsappHref(dateText)} target="_blank" rel="noopener noreferrer">
                  Send on WhatsApp
                </a>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={async () => setDateResult(await handOff(dateText))}
              >
                Share another way
              </Button>
            </div>
            <HandoffNotice result={dateResult} />
          </>
        ) : (
          <p className="text-nav text-grey-600">
            Fill in who, where and when to see the message.
          </p>
        )}
      </Card>
    </div>
  );
}

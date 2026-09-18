"use client";

import { useFormState, useFormStatus } from "react-dom";
import { setSpotStatus, suggestSpots } from "./spot-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";

/**
 * Date-spot card — built against design/prototype/date-spot.slim.html.
 *
 * Behaviour unchanged from the version this replaces:
 *   - nothing appears until both people privately said continue, so the card
 *     cannot hint at the other person's answer;
 *   - cafés and restaurants only — the category allowlist has no bar, lounge
 *     or club in it, in the enum and in the provider mapping;
 *   - accept, swap or ignore. Nothing books anything, and the copy says so.
 *
 * Two deviations, flagged rather than faked:
 *   - The prototype's card carries a 16:10 photograph. `date_spots` stores no
 *     image and the Places lookup doesn't request one, so the photo is
 *     omitted rather than filled with a stock shot of a café that isn't this
 *     café.
 *   - The prototype shows a distance panel ("4.2 km · Yaba" / "3.1 km ·
 *     Victoria Island"). Profiles carry no coordinates and no neighbourhood,
 *     so those numbers cannot be computed. Omitted rather than invented.
 */
function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="min-h-12 w-full">
      {pending ? "Looking…" : label}
    </Button>
  );
}

export type Spot = {
  id: string;
  name: string;
  address: string;
  category: string;
  anchor: string;
  status: string;
};

const KIND: Record<string, string> = {
  cafe: "Café",
  restaurant: "Restaurant",
  bakery: "Bakery",
  park: "Park",
  museum: "Museum",
  gallery: "Gallery",
};

function SpotCard({
  spot,
  sessionId,
  matchFirst,
}: {
  spot: Spot;
  sessionId: string;
  matchFirst: string;
}) {
  const [state, action] = useFormState(setSpotStatus, null);
  const accepted = spot.status === "accepted";

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-white ${
        accepted ? "border-success" : "border-ink-900/[.12]"
      }`}
    >
      <div className="grid gap-3 px-[15px] py-4">
        <div className="flex items-start justify-between gap-2.5">
          <div className="grid min-w-0 gap-1">
            <h3 className="font-serif text-[22px] font-bold leading-tight text-ink-900">
              {spot.name}
            </h3>
            <p className="text-nav text-grey-600">
              {KIND[spot.category] ?? spot.category}
              {spot.address ? ` · ${spot.address}` : ""}
            </p>
          </div>
          {/* The public-venue nudge is the safety signal, so it is stated on
              the card rather than left implicit. */}
          <span className="flex-shrink-0 rounded-sm border border-green-500/[.24] bg-green-50 px-[11px] py-1.5 text-chip font-semibold text-green-550">
            Public
          </span>
        </div>

        {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
        {state?.ok ? <Notice tone="success">{state.ok}</Notice> : null}

        {accepted ? (
          <p className="mt-0.5 flex items-center gap-2 text-nav font-semibold text-success">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="7" stroke="#2F8F5B" strokeWidth="1.3" />
              <path d="m5 8.2 2 2 4-4.4" stroke="#2F8F5B" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            You accepted this spot
          </p>
        ) : (
          <form action={action} className="mt-0.5 grid gap-2.5">
            <input type="hidden" name="spot_id" value={spot.id} />
            <input type="hidden" name="session_id" value={sessionId} />
            <Button
              type="submit"
              name="status"
              value="accepted"
              className="min-h-12 w-full"
            >
              Accept this spot
            </Button>
            <Button
              type="submit"
              name="status"
              value="swapped"
              variant="outline"
              className="min-h-12 w-full"
            >
              Swap for another
            </Button>
            <button
              type="submit"
              name="status"
              value="ignored"
              className="min-h-11 border-0 bg-transparent p-2.5 text-nav font-medium text-grey-600"
            >
              Not now
            </button>
          </form>
        )}
      </div>

      {accepted ? (
        <div className="grid gap-3 px-[15px] pb-4">
          <div className="grid gap-2.5 rounded-xl border border-green-500 bg-green-800 px-4 py-[18px] text-white">
            <p className="text-chip font-semibold uppercase tracking-[0.12em] text-champagne">
              Next
            </p>
            <h4 className="font-serif text-[20px] font-bold leading-tight">
              Pick a time you can both make.
            </h4>
            {/* Warm framing, per CLAUDE.md — a deposit is showing up for each
                other, never a forfeit or a penalty. */}
            <p className="text-nav leading-relaxed text-white/[.76]">
              You propose, {matchFirst} confirms. Once the time is set you each
              put down a small coin deposit — it&rsquo;s how you show up for
              each other, and it comes back to both of you after the date.
            </p>
          </div>
          <p className="text-center text-nav leading-relaxed text-grey-600">
            Nothing is booked. {spot.name} isn&rsquo;t expecting you — call
            ahead if you&rsquo;d like a table.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function SpotSuggestions({
  sessionId,
  spots,
  mutual,
  configured,
  matchFirst = "they",
}: {
  sessionId: string;
  spots: Spot[];
  mutual: boolean;
  configured: boolean;
  matchFirst?: string;
}) {
  const [state, action] = useFormState(suggestSpots, null);

  // Before a mutual continue there is nothing to show, and showing anything
  // at all would leak that the other person said yes.
  if (!mutual) return null;

  const live = spots.filter((s) => s.status !== "ignored");
  const anchor = live[0]?.anchor;

  return (
    <Card className="grid gap-3 p-[26px]">
      <div className="grid gap-1.5">
        <h2 className="text-h5 text-ink-900">A spot to meet</h2>
        <p className="text-ui text-grey-600">
          You and {matchFirst} both said continue. Public places only — a café
          or a restaurant, never a bar. Somewhere with other people around is
          the safer first move.
        </p>
      </div>

      {anchor === "nigeria_side" ? (
        <Notice tone="info">
          These are near whoever is in Nigeria, since one of you is abroad.
        </Notice>
      ) : null}

      {!configured ? (
        <Notice tone="locked" title="Suggestions aren't connected yet">
          The venue lookup isn&rsquo;t configured in this environment. You can
          still agree a place between you — pick somewhere public.
        </Notice>
      ) : null}

      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}

      {live.length > 0 ? (
        <div className="grid gap-3">
          {live.map((s) => (
            <SpotCard
              key={s.id}
              spot={s}
              sessionId={sessionId}
              matchFirst={matchFirst}
            />
          ))}
        </div>
      ) : null}

      {configured ? (
        <form action={action} className="grid">
          <input type="hidden" name="session_id" value={sessionId} />
          <Submit label={live.length ? "Suggest a few more" : "Suggest a few places"} />
        </form>
      ) : null}
    </Card>
  );
}

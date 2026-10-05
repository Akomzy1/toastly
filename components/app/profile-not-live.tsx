import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import type { LiveStatus } from "@/lib/live-profile";

/**
 * Shown in place of a feed, Gist, inbox or date screen when the member's own
 * profile isn't live (PRD §5.1.2).
 *
 * NOT IN THE PROTOTYPE — flagged as invented UI. No approved screen covers
 * "not live yet" or "access paused". The only related approved copy is
 * verify-overview's "Your profile goes live once you're Verified Real" and
 * photos-upload's "Four photos to go live, up to six"; this reuses that
 * wording and is otherwise built from existing primitives (Card, Notice,
 * Badge, Button) so there is little to unpick when a design lands.
 *
 * Two states, one component:
 *   - not live yet (still onboarding): what's left, in order;
 *   - access paused (was live, dropped below the bar): what changed and how
 *     to restore it. Plain, never alarming — tone is info, never error, and
 *     never the gold "locked" tone, which means a paid feature here.
 */
export function ProfileNotLive({ status }: { status: LiveStatus }) {
  const photosShort = Math.max(status.minPhotos - status.photoCount, 0);

  const steps: { label: string; done: boolean; detail?: string }[] = [
    { label: "Phone confirmed", done: status.phoneConfirmed },
    { label: "Verified Real selfie", done: status.verifiedReal },
    {
      label: `${status.minPhotos} photos`,
      done: photosShort === 0,
      detail: `${Math.min(status.photoCount, status.minPhotos)} of ${status.minPhotos} added`,
    },
    {
      label: "Main photo matched to your selfie",
      done: status.mainPhoto === "matched",
      detail:
        status.mainPhoto === "checking"
          ? "Being checked"
          : status.mainPhoto === "missing"
            ? "Not added yet"
            : undefined,
    },
  ];

  const needsVerification = !status.phoneConfirmed || !status.verifiedReal;
  const needsPhotos = photosShort > 0 || status.mainPhoto !== "matched";

  const reasons: string[] = [];
  if (status.mainPhoto === "checking") {
    reasons.push("Your new main photo is being checked against your selfie.");
  } else if (status.mainPhoto === "missing") {
    reasons.push(
      "Your main photo was removed — a live profile needs one that matches your selfie.",
    );
  }
  if (photosShort > 0) {
    reasons.push(
      `You have ${status.photoCount} photo${status.photoCount === 1 ? "" : "s"} — a live profile needs ${status.minPhotos}.`,
    );
  }
  if (!status.phoneConfirmed || !status.verifiedReal) {
    reasons.push("Your verification needs finishing again.");
  }
  const reason = reasons.join(" ");

  return (
    <div className="mx-auto grid max-w-[640px] gap-6 px-5 py-section-y">
      <div className="grid gap-2">
        <h1 className="text-h3 text-ink-900">
          {status.wasLive
            ? "Your profile is hidden for now"
            : "Your profile isn’t live yet"}
        </h1>
        <p className="text-ui text-grey-600">
          You can&rsquo;t look at people who can&rsquo;t see you. Matches, Gist
          sessions, messages and dates open once your profile is live.
        </p>
      </div>

      {status.wasLive ? (
        <Notice tone="info" title="Access paused">
          {reason} Until then nobody can see your profile, and matches, Gists,
          messages and dates are paused. Nothing has been deleted.
        </Notice>
      ) : null}

      <Card className="grid gap-4 p-[26px]">
        <h2 className="text-h5 text-ink-900">
          {status.wasLive ? "To restore it" : "To go live"}
        </h2>
        <ol className="grid list-none gap-3 p-0">
          {steps.map((s) => (
            <li key={s.label} className="flex flex-wrap items-center gap-2.5">
              <Badge variant={s.done ? "verified" : "optional"}>
                {s.done ? "Done" : "To do"}
              </Badge>
              <span className="text-ui text-ink-900">{s.label}</span>
              {!s.done && s.detail ? (
                <span className="text-nav text-grey-600">{s.detail}</span>
              ) : null}
            </li>
          ))}
        </ol>

        {needsVerification ? (
          <Button asChild className="justify-self-start">
            <Link href="/verify">Continue verification</Link>
          </Button>
        ) : null}

        {needsPhotos && !needsVerification ? (
          <Button asChild className="justify-self-start">
            <Link href="/photos">
              {status.mainPhoto === "checking" ? "See your photo check" : "Add your photos"}
            </Link>
          </Button>
        ) : null}
      </Card>

      <p className="text-nav text-grey-600">
        Still open to you whatever your status: verification, your{" "}
        <Link href="/photos" className="text-green-500">
          photos
        </Link>
        , your{" "}
        <Link href="/profile" className="text-green-500">
          profile settings
        </Link>{" "}
        and the{" "}
        <Link href="/safety-kit" className="text-green-500">
          safety kit
        </Link>
        .
      </p>
    </div>
  );
}

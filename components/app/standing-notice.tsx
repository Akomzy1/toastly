import type { LiveStatus } from "@/lib/live-profile";
import { AppBand, AppColumn, LinkList } from "@/components/app/app-band";

/**
 * What a member sees when a PERSON in review has restricted or removed
 * their account (0018). CLAUDE.md: never an automatic step, and the member
 * is always told why — as a reason category, never the evidence or who
 * reported them.
 *
 * INVENTED UI — flagged. No prototype covers telling a member their account
 * is restricted or removed (design/prototype/ROUTES.md lists it as a gap).
 * Built from the going-live screens' parts: the band, the column, the list.
 */
const REASON: Record<NonNullable<LiveStatus["standingReason"]>, string> = {
  pricing: "your plan doesn't match where you live",
  safety: "reports from other members about safety",
  married: "reports that you're married — Toastly is for people who are free to commit",
  photos: "your photos may not be of you",
  verification: "we couldn't confirm your verification",
  other: "something that goes against our community rules",
};

export function StandingNotice({ status }: { status: LiveStatus }) {
  const removed = status.standing === "removed";
  const reason = status.standingReason ? REASON[status.standingReason] : REASON.other;

  return (
    <>
      <AppBand title="Your account" sub={removed ? "Closed" : "Restricted for now"} safety />
      <AppColumn>
        <div className="grid gap-2.5 px-0.5">
          <h2 className="font-serif text-[24px] font-bold leading-[1.22] text-ink-900">
            {removed ? "Your account has been closed." : "Your account is restricted while we take a look."}
          </h2>
          <p className="text-ui leading-[1.6] text-ink-800">
            {removed
              ? "A person on our team closed your account. "
              : "A person on our team has paused matching and messages while they review your account. "}
            The reason: {reason}.
          </p>
          <p className="text-ui leading-[1.6] text-ink-800">
            If you think this is a mistake, email{" "}
            <a href="mailto:support@trytoastly.com" className="text-green-500">
              support@trytoastly.com
            </a>{" "}
            and a person will look again.
          </p>
        </div>

        <LinkList
          heading="Still open to you"
          items={[
            { href: "/account", label: "Your data", sub: "See, download or delete what we hold" },
            ...(removed ? [] : [{ href: "/profile", label: "Settings" }]),
            { href: "/safety-kit", label: "Safety kit", sub: "Free on every plan, always" },
          ]}
        />
      </AppColumn>
    </>
  );
}
